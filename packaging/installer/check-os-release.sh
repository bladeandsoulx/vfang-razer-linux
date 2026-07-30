#!/usr/bin/env bash
# Usage: packaging/installer/check-os-release.sh CAPTURE_NAME
#
# Assert that this machine's /etc/os-release still agrees with the captured
# projection the installer tests detect against. Run inside each CI matrix
# container so a capture cannot drift from upstream unnoticed: Fedora 43 dropped
# PLATFORM_ID and shipped an empty VERSION_CODENAME, which broke detection on
# every supported Fedora while hand-written fixtures kept the suite green.
#
# Only the fields install.sh actually parses are compared. Everything else in
# os-release (PRETTY_NAME, SUPPORT_END, point-release VERSION strings) churns
# upstream without affecting detection.
set -euo pipefail

name=${1:-}
[[ -n $name ]] || {
    echo "usage: ${0##*/} CAPTURE_NAME" >&2
    exit 2
}

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
capture="$root/packaging/installer/os-release/$name"

[[ -r $capture ]] || {
    echo "no captured os-release projection: $capture" >&2
    exit 1
}

fields='^(ID|ID_LIKE|VERSION_ID|VERSION_CODENAME|UBUNTU_CODENAME|PLATFORM_ID|CPE_NAME)='

if ! grep -E "$fields" /etc/os-release | diff -u "$capture" -; then
    echo >&2
    echo "/etc/os-release no longer matches packaging/installer/os-release/$name." >&2
    echo "Re-capture it and confirm detect_platform still gates this release:" >&2
    echo "  grep -E '$fields' /etc/os-release > packaging/installer/os-release/$name" >&2
    exit 1
fi

echo "os-release projection matches $name"
