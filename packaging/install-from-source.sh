#!/usr/bin/env bash
# Build and install Fang from source on Debian/Ubuntu.
# Usage: sudo ./packaging/install-from-source.sh   (run from the repo root)
set -euo pipefail

source_installer_decode_os_value() {
    local raw=$1
    local destination=$2
    local decoded=
    local inner
    local char
    local next
    local index

    if [[ ${raw:0:1} == '"' ]]; then
        [[ ${#raw} -ge 2 && ${raw: -1} == '"' ]] || return 1
        inner=${raw:1:${#raw}-2}
        index=0
        while ((index < ${#inner})); do
            char=${inner:index:1}
            if [[ $char == \\ ]]; then
                ((index += 1))
                ((index < ${#inner})) || return 1
                next=${inner:index:1}
                case $next in
                    '$'|'`'|'"'|\\) decoded+=$next ;;
                    *) return 1 ;;
                esac
            else
                decoded+=$char
            fi
            ((index += 1))
        done
    elif [[ ${raw:0:1} == "'" ]]; then
        [[ ${#raw} -ge 2 && ${raw: -1} == "'" ]] || return 1
        inner=${raw:1:${#raw}-2}
        [[ $inner != *"'"* ]] || return 1
        decoded=$inner
    else
        decoded=$raw
    fi
    printf -v "$destination" '%s' "$decoded"
}

source_installer_valid_os_value() {
    local key=$1
    local value=$2
    case $key in
        ID) [[ $value =~ ^[a-z0-9._+-]+$ ]] ;;
        ID_LIKE) [[ $value =~ ^[a-z0-9._+-]+([[:space:]]+[a-z0-9._+-]+)*$ ]] ;;
        *) return 1 ;;
    esac
}

source_installer_read_os_release() {
    local source=$1
    local line
    local key
    local raw
    local value
    declare -A seen=()

    DISTRO_ID=
    DISTRO_ID_LIKE=

    if [[ ! -r $source ]]; then
        echo "cannot read operating-system identity from $source" >&2
        return 1
    fi
    while IFS= read -r line || [[ -n $line ]]; do
        [[ -z $line || $line == \#* ]] && continue
        if [[ $line != *=* ]]; then
            echo "malformed os-release line: $line" >&2
            return 1
        fi
        key=${line%%=*}
        raw=${line#*=}
        case $key in
            ID|ID_LIKE) ;;
            *) continue ;;
        esac
        if [[ -n ${seen[$key]+present} ]]; then
            echo "duplicate os-release field: $key" >&2
            return 1
        fi
        seen[$key]=1
        value=
        if ! source_installer_decode_os_value "$raw" value; then
            echo "malformed os-release value for $key" >&2
            return 1
        fi
        if ! source_installer_valid_os_value "$key" "$value"; then
            echo "invalid os-release value for $key" >&2
            return 1
        fi
        case $key in
            ID) DISTRO_ID=$value ;;
            ID_LIKE) DISTRO_ID_LIKE=$value ;;
        esac
    done < "$source"
    if [[ -z $DISTRO_ID ]]; then
        echo "operating-system ID is missing" >&2
        return 1
    fi
}

source_installer_id_like_has() {
    local wanted=$1
    local item
    for item in $DISTRO_ID_LIKE; do
        [[ $item == "$wanted" ]] && return 0
    done
    return 1
}

source_installer_require_debian_family() {
    local source=${1:-/etc/os-release}

    source_installer_read_os_release "$source" || return 1
    if [[ $DISTRO_ID == debian || $DISTRO_ID == ubuntu ]] ||
        source_installer_id_like_has debian ||
        source_installer_id_like_has ubuntu; then
        return 0
    fi

    echo "this script builds from source on Debian and Ubuntu only" >&2
    echo "detected: $DISTRO_ID" >&2
    echo "on Fedora, install the released RPMs instead - see README.md" >&2
    return 1
}

if [[ ${BASH_SOURCE[0]} != "$0" ]]; then
    return 0
fi

# Everything below assumes apt-get and Debian's -dev package names. Check the
# family before asking for root, so a Fedora user gets a useful message instead
# of a bare "apt-get: command not found" after already elevating.
# Read os-release rather than sourcing it, matching install.sh's posture.
source_installer_require_debian_family /etc/os-release || exit 1

if [ "$(id -u)" -ne 0 ]; then
    echo "run as root: sudo $0" >&2
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REAL_USER="${SUDO_USER:-root}"
USER_HOME="$(getent passwd "$REAL_USER" | cut -d: -f6)"
VERSION="$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$REPO_ROOT/Cargo.toml" | head -n 1)"
[[ -n "$VERSION" ]]

# Run a command as the invoking user with their Rust toolchain on PATH.
# rustup installs cargo under ~/.cargo/bin, which sudo's secure_path drops —
# so a plain `sudo -u user cargo` would fail to find cargo (and the Tauri
# build shells out to cargo as well).
run_user() {
    sudo -u "$REAL_USER" env "PATH=$USER_HOME/.cargo/bin:$PATH" "$@"
}

echo "==> installing build dependencies"
apt-get update
apt-get install -y --no-install-recommends \
    build-essential pkg-config curl \
    libudev-dev \
    libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
    libayatana-appindicator3-dev \
    nodejs npm

if ! run_user sh -c 'command -v cargo >/dev/null'; then
    echo "==> rust toolchain not found for $REAL_USER; install rustup first:" >&2
    echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" >&2
    exit 1
fi

echo "==> building the fangd .deb"
cd "$REPO_ROOT"
if ! run_user sh -c 'command -v cargo-deb >/dev/null'; then
    echo "==> installing cargo-deb (one-time; this compiles, give it a minute)"
    run_user cargo install cargo-deb --locked
fi
run_user cargo deb -p fangd
FANGD_DEB="target/debian/fangd_${VERSION}-1_amd64.deb"
[[ -f "$FANGD_DEB" ]]
echo "==> installing $FANGD_DEB"
# The package installs the binary + unit, creates the 'fang' group, and enables
# and starts the service — see the cargo-deb metadata in crates/fangd/Cargo.toml.
# Installing it this way means `apt remove fangd` cleanly undoes everything.
apt-get install -y "$FANGD_DEB"
echo "==> fangd running: $(systemctl is-active fangd)"

echo "==> building the Fang app (Tauri)"
cd "$REPO_ROOT/app"
run_user npm install
run_user npm run tauri build
DEB="src-tauri/target/release/bundle/deb/Fang_${VERSION}_amd64.deb"
[[ -f "$DEB" ]]
echo "==> installing $DEB"
apt-get install -y "$DEB"

if [ "$REAL_USER" != "root" ]; then
    usermod -aG fang "$REAL_USER"
    echo "==> added $REAL_USER to the 'fang' group (log out and back in once)"
fi

echo
echo "Done. Launch 'Fang' from your app menu."
echo "Daemon logs: journalctl -u fangd -f"
