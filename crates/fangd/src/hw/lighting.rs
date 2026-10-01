//! Model-specific keyboard lighting, exercised without a physical HID handle.

use fang_protocol::api::KbdEffect;
use fang_protocol::packet::{self, Report};

pub fn apply_keyboard_effect(
    pid: u16,
    effect: KbdEffect,
    command: &mut impl FnMut(Report) -> Result<(), String>,
) -> Result<(), String> {
    if let (0x02b7, KbdEffect::Static { r, g, b }) = (pid, effect) {
        for (index, report) in packet::blade_16_2024_static_frame([r, g, b])
            .into_iter()
            .enumerate()
        {
            command(report).map_err(|error| {
                if index < 6 {
                    format!("static keyboard frame row {index} failed: {error}")
                } else {
                    format!("static keyboard frame activation failed: {error}")
                }
            })?;
        }
        return Ok(());
    }

    let (id, params) = match effect {
        KbdEffect::Off => (packet::kbd_effect::OFF, vec![]),
        KbdEffect::Static { r, g, b } => (packet::kbd_effect::STATIC, vec![r, g, b]),
        KbdEffect::Spectrum => (packet::kbd_effect::SPECTRUM, vec![]),
        KbdEffect::Wave => (packet::kbd_effect::WAVE, vec![0x01]),
    };
    command(packet::set_kbd_effect(id, &params))
}

#[cfg(test)]
mod tests {
    use super::*;
    use fang_protocol::models;

    fn reports(pid: u16, effect: KbdEffect) -> Vec<Report> {
        let mut seen = Vec::new();
        apply_keyboard_effect(pid, effect, &mut |report| {
            seen.push(report);
            Ok(())
        })
        .unwrap();
        seen
    }

    #[test]
    fn only_02b7_uses_custom_frames_for_static_colors() {
        let effect = KbdEffect::Static { r: 255, g: 0, b: 0 };
        let special = reports(0x02b7, effect);
        assert_eq!(special.len(), 7);
        assert!(special[..6]
            .iter()
            .all(|r| (r.command_class, r.command_id) == (3, 0x0b)));
        assert_eq!(special[6].data_size, 2);
        for model in models::MODELS.iter().chain([&models::FALLBACK]) {
            if model.pid != 0x02b7 {
                let legacy = reports(model.pid, effect);
                assert_eq!(
                    legacy,
                    vec![packet::set_kbd_effect(
                        packet::kbd_effect::STATIC,
                        &[255, 0, 0]
                    )]
                );
            }
        }
    }

    #[test]
    fn off_spectrum_and_wave_keep_their_existing_packets_on_02b7() {
        for (effect, id, params) in [
            (KbdEffect::Off, packet::kbd_effect::OFF, vec![]),
            (KbdEffect::Spectrum, packet::kbd_effect::SPECTRUM, vec![]),
            (KbdEffect::Wave, packet::kbd_effect::WAVE, vec![1]),
        ] {
            assert_eq!(
                reports(0x02b7, effect),
                vec![packet::set_kbd_effect(id, &params)]
            );
        }
    }

    #[test]
    fn every_row_or_activation_failure_is_reported_and_stops_the_sequence() {
        for fail_at in 0..7 {
            let mut seen = Vec::new();
            let error = apply_keyboard_effect(
                0x02b7,
                KbdEffect::Static { r: 0, g: 0, b: 255 },
                &mut |report| {
                    seen.push(report);
                    if seen.len() == fail_at + 1 {
                        Err("EC rejected frame".into())
                    } else {
                        Ok(())
                    }
                },
            )
            .unwrap_err();
            assert_eq!(seen.len(), fail_at + 1);
            assert!(error.contains("EC rejected frame"), "{error}");
            if fail_at < 6 {
                assert!(error.contains(&format!("row {fail_at}")), "{error}");
                assert!(
                    seen.iter().all(|r| r.command_id == 0x0b),
                    "partial frame must not be activated"
                );
            } else {
                assert!(error.contains("activation"), "{error}");
            }
        }
    }

    #[test]
    fn changing_color_or_returning_from_wave_rewrites_and_activates_the_full_frame() {
        let mut seen = Vec::new();
        for effect in [
            KbdEffect::Static { r: 255, g: 0, b: 0 },
            KbdEffect::Wave,
            KbdEffect::Static { r: 0, g: 0, b: 255 },
        ] {
            apply_keyboard_effect(0x02b7, effect, &mut |r| {
                seen.push(r);
                Ok(())
            })
            .unwrap();
        }
        assert_eq!(seen.len(), 15);
        assert_eq!(&seen[0].args[4..7], &[255, 0, 0]);
        assert_eq!(&seen[6].args[..2], &[5, 0]);
        assert_eq!(seen[7].args[0], packet::kbd_effect::WAVE);
        assert_eq!(&seen[8].args[4..7], &[0, 0, 255]);
        assert_eq!(&seen[14].args[..2], &[5, 0]);
    }

    #[test]
    fn busy_rows_are_acknowledged_in_order_before_frame_activation() {
        let mut exchanges = Vec::new();
        let mut acknowledged_rows = Vec::new();
        let mut waits = Vec::new();
        apply_keyboard_effect(
            0x02b7,
            KbdEffect::Static {
                r: 120,
                g: 255,
                b: 140,
            },
            &mut |request| {
                let mut attempts = 0;
                super::super::transport::command_with_retry(
                    &request,
                    || {
                        attempts += 1;
                        exchanges.push((request.command_id, request.args[1]));
                        if request.command_id == 0x0a {
                            assert_eq!(acknowledged_rows, vec![0, 1, 2, 3, 4, 5]);
                        }
                        let mut response = request.clone();
                        response.status = if attempts == 1 {
                            packet::status::BUSY
                        } else {
                            if request.command_id == 0x0b {
                                acknowledged_rows.push(request.args[1]);
                            }
                            packet::status::SUCCESS
                        };
                        Ok(response.to_feature_report().to_vec())
                    },
                    |delay| waits.push(delay),
                )
                .map(|_| ())
            },
        )
        .unwrap();
        assert_eq!(
            exchanges,
            vec![
                (0x0b, 0),
                (0x0b, 0),
                (0x0b, 1),
                (0x0b, 1),
                (0x0b, 2),
                (0x0b, 2),
                (0x0b, 3),
                (0x0b, 3),
                (0x0b, 4),
                (0x0b, 4),
                (0x0b, 5),
                (0x0b, 5),
                (0x0a, 0),
                (0x0a, 0),
            ]
        );
        assert_eq!(waits, vec![std::time::Duration::from_millis(20); 7]);
    }
}
