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
mkdir "$probe_bin"
chmod 755 "$probe_dir" "$probe_bin"
trap 'rm -rf -- "$probe_dir"' EXIT

write_probe_command() {
    local command=$1
    shift
    printf '%s\n' "$@" > "$probe_bin/$command"
    chmod 755 "$probe_bin/$command"
}

write_probe_command curl \
    '#!/usr/bin/env bash' \
    "printf '%s\\n' 'installer detection probe stopped before download' >&2" \
    'exit 1'
for command in sudo apt-get dnf systemctl usermod; do
    write_probe_command "$command" \
        '#!/usr/bin/env bash' \
        "printf '%s\\n' 'installer detection probe blocked system mutation' >&2" \
        'exit 1'
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
    FANG_OS_RELEASE_FILE="$os_release_file" \
    "${runner[@]}" bash "$root/install.sh" 2>&1
)
probe_status=$?
set -e
printf '%s\n' "$probe_output"

if [[ $probe_output != *"Detected: linux ($expected_platform)"* ]]; then
    echo "installer detected a platform other than expected: $expected_platform" >&2
    exit 1
fi
if ((probe_status == 0)); then
    echo 'installer detection probe unexpectedly completed without blocking downloads.' >&2
    exit 1
fi

echo "installer detected $expected_platform from $os_release_file"
