#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT="${1:-$ROOT/target/arch-dist}"
[[ $OUTPUT == /* ]] || OUTPUT="$ROOT/$OUTPUT"
[[ $EUID != 0 ]] || {
  echo 'run the Arch package build as an unprivileged user' >&2
  exit 1
}

for command in cargo node npm makepkg bsdtar; do
  command -v "$command" >/dev/null || {
    echo "missing build command: $command" >&2
    exit 1
  }
done

STAGE="$(mktemp -d)"
PKGDEST="$STAGE/packages"
trap 'rm -rf -- "$STAGE"' EXIT
mkdir -p "$PKGDEST" "$OUTPUT"

cd "$ROOT"
node app/scripts/version.mjs check
cargo build --release --locked -p fangd
(
  cd app
  npm ci
  npm run tauri build -- --no-bundle
)

install -pm0644 packaging/arch/PKGBUILD "$STAGE/PKGBUILD"
install -pm0755 target/release/fangd "$STAGE/fangd"
install -pm0755 app/src-tauri/target/release/fang "$STAGE/fang"
install -pm0644 packaging/fangd.service "$STAGE/fangd.service"
install -pm0644 packaging/fang.sysusers "$STAGE/fang.sysusers"
install -pm0644 packaging/fang.desktop "$STAGE/fang.desktop"
install -pm0644 LICENSE "$STAGE/LICENSE"
install -pm0644 app/src-tauri/icons/32x32.png "$STAGE/fang-32.png"
install -pm0644 app/src-tauri/icons/128x128.png "$STAGE/fang-128.png"
install -pm0644 app/src-tauri/icons/128x128@2x.png "$STAGE/fang-256.png"
install -pm0644 app/src-tauri/icons/icon.png "$STAGE/fang-512.png"

(
  cd "$STAGE"
  PKGDEST="$PKGDEST" makepkg --clean --cleanbuild --force --noconfirm
)

mapfile -t built < <(find "$PKGDEST" -maxdepth 1 -type f -name '*.pkg.tar.zst' -print | sort)
[[ ${#built[@]} == 2 ]] || {
  printf 'expected two Pacman packages, found %s\n' "${#built[@]}" >&2
  exit 1
}

find "$OUTPUT" -maxdepth 1 -type f -name 'fang*.pkg.tar.zst' -delete
declare -A seen=()
for package in "${built[@]}"; do
  metadata="$(bsdtar -xOf "$package" .PKGINFO)"
  name="$(sed -n 's/^pkgname = //p' <<< "$metadata")"
  case $name in
    fang|fangd) ;;
    *) echo "unexpected Pacman package: $name" >&2; exit 1 ;;
  esac
  [[ -z ${seen[$name]+present} ]] || {
    echo "duplicate Pacman package: $name" >&2
    exit 1
  }
  seen[$name]=1
  install -pm0644 "$package" "$OUTPUT/"
done
[[ -n ${seen[fang]+present} && -n ${seen[fangd]+present} ]]
printf 'Pacman artifacts:\n'
find "$OUTPUT" -maxdepth 1 -type f -name '*.pkg.tar.zst' -printf '%f\n' | sort
