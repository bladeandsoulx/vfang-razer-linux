#!/usr/bin/env bash
# Build and install Fang from source on Debian/Ubuntu.
# Usage: sudo ./packaging/install-from-source.sh   (run from the repo root)
set -euo pipefail

# Everything below assumes apt-get and Debian's -dev package names. Check the
# family before asking for root, so a Fedora user gets a useful message instead
# of a bare "apt-get: command not found" after already elevating.
# Read os-release rather than sourcing it, matching install.sh's posture.
if [ -r /etc/os-release ]; then
    DISTRO_ID="$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"' | head -n 1)"
    DISTRO_ID_LIKE="$(sed -n 's/^ID_LIKE=//p' /etc/os-release | tr -d '"' | head -n 1)"
else
    DISTRO_ID=
    DISTRO_ID_LIKE=
fi

case " $DISTRO_ID $DISTRO_ID_LIKE " in
    *" debian "* | *" ubuntu "*) ;;
    *)
        echo "this script builds from source on Debian and Ubuntu only" >&2
        echo "detected: ${DISTRO_ID:-unknown}" >&2
        echo "on Fedora, install the released RPMs instead - see README.md" >&2
        exit 1
        ;;
esac

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
