//! Bounded response validation and retries, independent of HID discovery.

use fang_protocol::packet::{self, Report};
use std::time::Duration;

const FRAME_ATTEMPTS: usize = 5;
const RETRY_DELAY: Duration = Duration::from_millis(20);

pub fn command_with_retry(
    request: &Report,
    mut exchange: impl FnMut() -> Result<Vec<u8>, String>,
    mut wait: impl FnMut(Duration),
) -> Result<Report, String> {
    // Only the 02B7 workaround emits these 0xFF custom-frame requests. Other
    // commands keep their existing two-attempt limit. Transport loss and
    // unsupported commands are never retried here.
    let frame = request.transaction_id == 0xff
        && request.command_class == 0x03
        && (request.command_id == 0x0b
            || (request.command_id == 0x0a && request.args[..2] == [0x05, 0x00]));
    let attempts = if frame { FRAME_ATTEMPTS } else { 2 };
    for attempt in 0..attempts {
        let response = exchange()?;
        let parsed = match Report::response_from_feature_report(request, &response) {
            Ok(parsed) => parsed,
            Err(error) if attempt == 0 => {
                log::warn!(
                    "invalid EC response for {:#04x}/{:#04x}: {error}; retrying",
                    request.command_class,
                    request.command_id
                );
                wait(RETRY_DELAY);
                continue;
            }
            Err(error) => {
                return Err(format!(
                    "invalid EC response for {:#04x}/{:#04x}: {error}",
                    request.command_class, request.command_id
                ));
            }
        };
        match parsed.status {
            packet::status::SUCCESS => return Ok(parsed),
            packet::status::BUSY if attempt + 1 < attempts => wait(RETRY_DELAY),
            packet::status::BUSY => {
                return Err(format!(
                    "EC remained busy after {attempts} attempts for command {:#04x}/{:#04x}",
                    request.command_class, request.command_id
                ));
            }
            packet::status::NOT_SUPPORTED => {
                return Err(format!(
                    "EC rejected command {:#04x}/{:#04x} as unsupported",
                    request.command_class, request.command_id
                ));
            }
            other => {
                return Err(format!(
                    "EC status {other:#04x} for command {:#04x}/{:#04x}",
                    request.command_class, request.command_id
                ));
            }
        }
    }
    unreachable!("the final attempt returns success or a bounded error")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    fn reply(request: &Report, status: u8) -> Vec<u8> {
        let mut response = request.clone();
        response.status = status;
        response.to_feature_report().to_vec()
    }

    fn scripted(
        request: &Report,
        responses: Vec<Result<Vec<u8>, String>>,
    ) -> (Result<Report, String>, usize, Vec<Duration>) {
        let mut responses: VecDeque<_> = responses.into();
        let mut calls = 0;
        let mut waits = Vec::new();
        let result = command_with_retry(
            request,
            || {
                calls += 1;
                responses.pop_front().expect("unexpected retry")
            },
            |delay| waits.push(delay),
        );
        (result, calls, waits)
    }

    #[test]
    fn custom_rows_and_activation_retry_busy_responses_until_success() {
        let frame = packet::blade_16_2024_static_frame([255, 0, 0]);
        for request in [&frame[0], &frame[6]] {
            let mut responses = vec![Ok(reply(request, packet::status::BUSY)); 4];
            responses.push(Ok(reply(request, packet::status::SUCCESS)));
            let (result, calls, waits) = scripted(request, responses);
            assert_eq!(result.unwrap().status, packet::status::SUCCESS);
            assert_eq!(calls, 5);
            assert_eq!(waits, vec![Duration::from_millis(20); 4]);
        }
    }

    #[test]
    fn busy_frame_retries_stop_at_five_attempts_without_a_final_wait() {
        let frame = packet::blade_16_2024_static_frame([0, 0, 255]);
        for request in [&frame[0], &frame[6]] {
            let (result, calls, waits) =
                scripted(request, vec![Ok(reply(request, packet::status::BUSY)); 5]);
            assert!(result.unwrap_err().contains("busy after 5 attempts"));
            assert_eq!(calls, 5);
            assert_eq!(waits.len(), 4);
        }
    }

    #[test]
    fn ordinary_commands_keep_the_two_attempt_busy_limit() {
        for request in [
            packet::set_fan_rpm(packet::Zone::Fan1, 30),
            packet::set_kbd_effect(packet::kbd_effect::STATIC, &[255, 0, 0]),
        ] {
            let (result, calls, waits) =
                scripted(&request, vec![Ok(reply(&request, packet::status::BUSY)); 2]);
            assert!(result.unwrap_err().contains("busy after 2 attempts"));
            assert_eq!(calls, 2);
            assert_eq!(waits.len(), 1);
        }
    }

    #[test]
    fn transport_and_unsupported_or_failed_commands_are_not_retried() {
        let request = &packet::blade_16_2024_static_frame([255; 3])[0];
        for response in [
            Err("send_feature_report: device removed".into()),
            Err("get_feature_report: device removed".into()),
            Ok(reply(request, packet::status::NOT_SUPPORTED)),
            Ok(reply(request, packet::status::FAILURE)),
            Ok(reply(request, packet::status::TIMEOUT)),
        ] {
            let (result, calls, waits) = scripted(request, vec![response]);
            assert!(result.is_err());
            assert_eq!(calls, 1);
            assert!(waits.is_empty());
        }
    }

    #[test]
    fn malformed_or_mismatched_responses_have_only_one_retry() {
        let request = &packet::blade_16_2024_static_frame([255; 3])[0];
        let mut wrong_transaction = request.clone();
        wrong_transaction.transaction_id = 0x1f;
        let mut corrupt_crc = reply(request, packet::status::SUCCESS);
        corrupt_crc[89] ^= 1;
        for malformed in [
            vec![0; 90],
            wrong_transaction.to_feature_report().to_vec(),
            corrupt_crc,
        ] {
            let (result, calls, waits) =
                scripted(request, vec![Ok(malformed.clone()), Ok(malformed)]);
            assert!(result.unwrap_err().contains("invalid EC response"));
            assert_eq!(calls, 2);
            assert_eq!(waits.len(), 1);
        }
        let (result, calls, _) = scripted(
            request,
            vec![Ok(vec![0; 90]), Ok(reply(request, packet::status::SUCCESS))],
        );
        assert!(result.is_ok());
        assert_eq!(calls, 2);
    }

    #[test]
    fn successful_frame_acknowledgement_is_not_repeated() {
        let request = &packet::blade_16_2024_static_frame([120, 255, 140])[0];
        let (result, calls, waits) =
            scripted(request, vec![Ok(reply(request, packet::status::SUCCESS))]);
        assert!(result.is_ok());
        assert_eq!(calls, 1);
        assert!(waits.is_empty());
    }
}
