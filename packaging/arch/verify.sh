#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="${1:?usage: verify.sh PACKAGE_DIRECTORY TEST_BUILDER}"
TEST_BUILDER="${2:?usage: verify.sh PACKAGE_DIRECTORY TEST_BUILDER}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
chmod 0755 "$TMP"
trap 'rm -rf -- "$TMP"' EXIT

VERSION="$(node -p "require('$ROOT/app/package.json').version")"
UPPER="$({ sed -n 's/^_fangd_upper=//p' "$ROOT/packaging/arch/PKGBUILD"; } | head -n1)"
mapfile -t packages < <(find "$PACKAGE_DIR" -maxdepth 1 -type f -name '*.pkg.tar.zst' -print | sort)
[[ ${#packages[@]} == 2 ]] || {
  printf 'expected two Pacman packages, found %s\n' "${#packages[@]}" >&2
  exit 1
}

pkginfo() { bsdtar -xOf "$1" .PKGINFO; }
pkgfield() { pkginfo "$1" | sed -n "s/^$2 = //p"; }

fang=
fangd=
for package in "${packages[@]}"; do
  case "$(pkgfield "$package" pkgname)" in
    fang) fang=$package ;;
    fangd) fangd=$package ;;
    *) echo "unexpected Pacman package: $package" >&2; exit 1 ;;
  esac
done
[[ -n $fang && -n $fangd ]]

require_scalar() {
  local metadata=$1 key=$2 expected=$3
  local values=()
  mapfile -t values < <(sed -n "s/^${key} = //p" <<< "$metadata")
  [[ ${#values[@]} == 1 && ${values[0]} == "$expected" ]] || {
    echo "invalid $key metadata; expected exactly: $expected" >&2
    exit 1
  }
}

require_payload() {
  local members=$1 expected=$2
  grep -Fxq "$expected" <<< "$members" || {
    echo "missing package payload: $expected" >&2
    exit 1
  }
}

verify_package() {
  local package=$1 expected_name=$2
  local members metadata
  members="$(bsdtar -tf "$package" | sed 's#^\./##')"
  [[ $(grep -Fxc .PKGINFO <<< "$members") == 1 ]]
  if grep -Fxq .INSTALL <<< "$members"; then
    echo "package has prohibited install script: $package" >&2
    exit 1
  fi
  metadata="$(bsdtar -xOf "$package" .PKGINFO)"
  require_scalar "$metadata" pkgname "$expected_name"
  require_scalar "$metadata" pkgver "${VERSION}-1"
  require_scalar "$metadata" arch x86_64
  require_scalar "$metadata" license GPL-2.0-only
}

[[ ${fang##*/} == "fang-${VERSION}-1-x86_64.pkg.tar.zst" ]]
[[ ${fangd##*/} == "fangd-${VERSION}-1-x86_64.pkg.tar.zst" ]]
verify_package "$fang" fang
verify_package "$fangd" fangd

fang_metadata="$(pkginfo "$fang")"
mapfile -t daemon_bounds < <(sed -n 's/^depend = \(fangd.*\)$/\1/p' <<< "$fang_metadata")
[[ ${#daemon_bounds[@]} == 2 ]]
[[ $(printf '%s\n' "${daemon_bounds[@]}" | grep -Fxc "fangd>=${VERSION}") == 1 ]]
[[ $(printf '%s\n' "${daemon_bounds[@]}" | grep -Fxc "fangd<${UPPER}") == 1 ]]
if pkginfo "$fangd" | grep -Eq '^depend = fangd'; then
  echo 'fangd package must not depend on itself' >&2
  exit 1
fi

require_payload "$(bsdtar -tf "$fang" | sed 's#^\./##')" usr/bin/fang
require_payload "$(bsdtar -tf "$fang" | sed 's#^\./##')" usr/share/applications/fang.desktop
require_payload "$(bsdtar -tf "$fang" | sed 's#^\./##')" usr/share/licenses/fang/LICENSE
for size in 32 128 256 512; do
  require_payload "$(bsdtar -tf "$fang" | sed 's#^\./##')" \
    "usr/share/icons/hicolor/${size}x${size}/apps/fang.png"
done
require_payload "$(bsdtar -tf "$fangd" | sed 's#^\./##')" usr/bin/fangd
require_payload "$(bsdtar -tf "$fangd" | sed 's#^\./##')" usr/lib/systemd/system/fangd.service
require_payload "$(bsdtar -tf "$fangd" | sed 's#^\./##')" usr/lib/sysusers.d/fang.conf
require_payload "$(bsdtar -tf "$fangd" | sed 's#^\./##')" usr/share/licenses/fangd/LICENSE

for package in "$fang" "$fangd"; do
  namcap "$package" | tee -a "$TMP/namcap.log"
done
if grep -Fq ' E: ' "$TMP/namcap.log"; then
  echo 'namcap found package errors' >&2
  exit 1
fi

make_dummy_fangd() {
  local dummy_version=$1
  local dir="$TMP/dummy-$dummy_version"
  mkdir -p "$dir"
  cat > "$dir/PKGBUILD" <<EOF
pkgname=fangd
pkgver=$dummy_version
pkgrel=1
pkgdesc='dependency-bound test double'
arch=(x86_64)
license=('MIT')
package() {
  install -Dm0644 /dev/null "\$pkgdir/usr/share/fang-test/$dummy_version"
}
EOF
  chown -R "$TEST_BUILDER" "$dir"
  runuser -u "$TEST_BUILDER" -- sh -c "cd '$dir' && makepkg --force --noconfirm >/dev/null"
  find "$dir" -maxdepth 1 -type f -name 'fangd-*.pkg.tar.zst' -print -quit
}

for incompatible in 0.0.1 "$UPPER"; do
  dummy="$(make_dummy_fangd "$incompatible")"
  [[ -n $dummy && -f $dummy ]] || {
    echo "failed to build dummy fangd $incompatible" >&2
    exit 1
  }
  if pacman -U --noconfirm "$fang" "$dummy" >"$TMP/pacman-$incompatible.log" 2>&1; then
    echo "fang accepted incompatible fangd $incompatible" >&2
    cat "$TMP/pacman-$incompatible.log" >&2
    exit 1
  fi
  if pacman -Q -- fang >/dev/null 2>&1 || pacman -Q -- fangd >/dev/null 2>&1; then
    echo 'incompatible transaction left packages installed' >&2
    exit 1
  fi
done

pacman -U --noconfirm "$fangd" "$fang"
[[ "$(pacman -Q fang)" == "fang ${VERSION}-1" ]]
[[ "$(pacman -Q fangd)" == "fangd ${VERSION}-1" ]]
getent group fang
pacman -Qkk fang fangd | tee "$TMP/pacman-qkk.log"
if grep -Eq '[1-9][0-9]* altered files' "$TMP/pacman-qkk.log"; then
  echo 'Pacman detected altered packaged files' >&2
  exit 1
fi
/usr/bin/fangd --version | grep -Fx "fangd $VERSION"
systemd-analyze verify /usr/lib/systemd/system/fangd.service
python3 "$ROOT/packaging/rpm/mock_smoke.py"
desktop-file-validate /usr/share/applications/fang.desktop
if ldd /usr/bin/fang | grep -F 'not found'; then
  echo 'desktop binary has unresolved libraries' >&2
  exit 1
fi

set +e
dbus-run-session -- timeout --kill-after=2s 8s xvfb-run -a /usr/bin/fang \
  >"$TMP/fang.out" 2>"$TMP/fang.err"
desktop_status=$?
set -e
case $desktop_status in
  124|137) ;;
  *)
    cat "$TMP/fang.out" "$TMP/fang.err" >&2
    echo "desktop exited before smoke timeout: $desktop_status" >&2
    exit 1
    ;;
esac

pacman -Qlq fang fangd | while IFS= read -r path; do
  [[ -f $path || -L $path ]] && printf '%s\n' "$path"
done > "$TMP/owned-files"
pacman -Rns --noconfirm fang fangd
while IFS= read -r path; do
  [[ ! -e $path && ! -L $path ]] || {
    echo "packaged file remains after removal: $path" >&2
    exit 1
  }
done < "$TMP/owned-files"

# shellcheck disable=SC1091
os_name="$(. /etc/os-release; printf '%s' "$PRETTY_NAME")"
printf 'Pacman verification passed on %s\n' "$os_name"
