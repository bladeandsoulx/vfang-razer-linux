#!/usr/bin/env bash
# Usage: packaging/installer/check-os-release.sh CAPTURE_NAME EXPECTED_PLATFORM
#
# Assert that the real operating-system identity agrees with the captured
# projection the installer tests detect against. Run inside each CI matrix
# container so a capture cannot drift from upstream unnoticed: Fedora 43
# dropped PLATFORM_ID and shipped an empty VERSION_CODENAME, which broke
# detection on every supported Fedora while hand-written fixtures kept the
# suite green.
#
# Only the fields install.sh actually parses are compared. Everything else in
# os-release (PRETTY_NAME, SUPPORT_END, point-release VERSION strings) churns
# upstream without affecting detection.
set -euo pipefail

name=${1:-}
expected_platform=${2:-}
[[ -n $name && -n $expected_platform ]] || {
    echo "usage: ${0##*/} CAPTURE_NAME EXPECTED_PLATFORM" >&2
    exit 2
}

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
capture="$root/packaging/installer/os-release/$name"
os_release_file=${FANG_OS_RELEASE_FILE:-/etc/os-release}

[[ -r $capture ]] || {
    echo "no captured os-release projection: $capture" >&2
    exit 1
}
[[ -r $os_release_file ]] || {
    echo "cannot read operating-system identity: $os_release_file" >&2
    exit 1
}

fields='^(ID|ID_LIKE|VERSION_ID|VERSION_CODENAME|UBUNTU_CODENAME|PLATFORM_ID|CPE_NAME)='

if ! grep -E "$fields" "$os_release_file" | diff -u "$capture" -; then
    echo >&2
    echo "$os_release_file no longer matches packaging/installer/os-release/$name." >&2
    echo "Re-capture it and confirm detect_platform still gates this release:" >&2
    echo "  grep -E '$fields' '$os_release_file' > packaging/installer/os-release/$name" >&2
    exit 1
fi

echo "os-release projection matches $name"

# CI containers run as root, but the release installer deliberately refuses to
# run that way.  Drop privileges for the probe and replace only the commands
# that could download or mutate the container.  curl stops immediately after
# detection, so the probe never reaches a real download or elevated operation.
probe_dir=$(mktemp -d)
probe_bin="$probe_dir/bin"
probe_state="$probe_dir/state"
mkdir "$probe_bin" "$probe_state"
chmod 755 "$probe_dir" "$probe_bin"
chmod 733 "$probe_state"
trap 'rm -rf -- "$probe_dir"' EXIT
readonly probe_stop_marker='installer detection probe stopped before download'
readonly mutation_block_marker='installer detection probe blocked system mutation'
readonly probe_stop_status=86
readonly mutation_block_status=87
readonly probe_curl_status_file="$probe_state/curl-status"

write_probe_command() {
    local command=$1
    shift
    printf '%s\n' "$@" > "$probe_bin/$command"
    chmod 755 "$probe_bin/$command"
}

# download_file reports curl failures through fatal(), so record the stub's
# unique status separately instead of confusing the installer's status 1 with
# proof that this particular command stopped it.
write_probe_command curl \
    '#!/usr/bin/env bash' \
    "trap 'status=\$?; printf \"%s\\n\" \"\$status\" > \"\$FANG_INSTALLER_PROBE_CURL_STATUS_FILE\"' EXIT" \
    "printf '%s\\n' '$probe_stop_marker' >&2" \
    "exit $probe_stop_status"
for command in sudo apt-get dnf systemctl usermod; do
    write_probe_command "$command" \
        '#!/usr/bin/env bash' \
        "printf '%s\\n' '$mutation_block_marker' >&2" \
        "exit $mutation_block_status"
done

runner=()
if [[ $EUID == 0 ]]; then
    command -v setpriv >/dev/null 2>&1 || {
        echo 'setpriv is required to probe installer detection from a root container.' >&2
        exit 1
    }
    runner=(setpriv --reuid=65534 --regid=65534 --clear-groups)
fi

set +e
probe_output=$(
    PATH="$probe_bin:$PATH" \
    FANG_INSTALLER_TESTING=1 \
    FANG_INSTALLER_PROBE_CURL_STATUS_FILE="$probe_curl_status_file" \
    FANG_OS_RELEASE_FILE="$os_release_file" \
    "${runner[@]}" bash "$root/install.sh" 2>&1
)
probe_status=$?
set -e
printf '%s\n' "$probe_output"

probe_stopped=0
mutation_blocked=0
probe_curl_status=
while IFS= read -r probe_line; do
    [[ $probe_line == "$probe_stop_marker" ]] && probe_stopped=1
    [[ $probe_line == "$mutation_block_marker" ]] && mutation_blocked=1
done <<< "$probe_output"
if [[ -r $probe_curl_status_file ]]; then
    probe_curl_status=$(< "$probe_curl_status_file")
fi

if [[ $probe_output != *"Detected: linux ($expected_platform)"* ]]; then
    echo "installer detected a platform other than expected: $expected_platform" >&2
    exit 1
fi
if ((mutation_blocked)); then
    echo 'installer detection probe reached a blocked system mutation command.' >&2
    exit 1
fi
if ((probe_status == 0)); then
    echo 'installer detection probe unexpectedly completed without blocking downloads.' >&2
    exit 1
fi
if [[ $probe_curl_status != "$probe_stop_status" ]]; then
    echo "installer curl sentinel exited with ${probe_curl_status:-unknown} instead of $probe_stop_status." >&2
    exit 1
fi
if ((!probe_stopped)); then
    echo "installer detection probe did not emit the exact marker: $probe_stop_marker" >&2
    exit 1
fi

echo "installer detected $expected_platform from $os_release_file"
