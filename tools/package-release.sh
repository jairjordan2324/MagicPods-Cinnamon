#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
set -eu
umask 022
if [ "$#" -ne 3 ]; then
    echo 'Usage: tools/package-release.sh CORE_CHECKOUT FETCHCONTENT_DIRECTORY OUTPUT_DIRECTORY' >&2
    exit 2
fi
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
core=$(CDPATH='' cd -- "$1" && pwd)
cache=$(CDPATH='' cd -- "$2" && pwd)
mkdir -p -- "$3"
out=$(CDPATH='' cd -- "$3" && pwd)
pin=04af4bdeb5cbdc7cb6eeba9b0acf2076cc6d3c16
[ "$(git -C "$core" rev-parse HEAD)" = "$pin" ] || {
    echo "Core checkout must be pinned to $pin" >&2
    exit 1
}
[ "$(uname -m)" = x86_64 ] || {
    echo 'This packaging recipe targets Linux x86-64.' >&2
    exit 1
}
for dep in sdbus-cpp-src usockets_content-src uwebsockets_content-src nlohmann_json-src tomlplusplus-src; do
    [ -d "$cache/$dep" ] || {
        echo "Missing fetched sources: $dep" >&2
        exit 1
    }
done
verify_git_dependency() {
    directory="$cache/$1"
    if [ "$(git -C "$directory" rev-parse HEAD)" != "$2" ] ||
        [ -n "$(git -C "$directory" status --porcelain)" ]; then
        echo "Unexpected dependency revision or local changes: $1" >&2
        exit 1
    fi
}
verify_git_dependency usockets_content-src a15d9bbdea68fd02dab40d2394200deb1b883aa6
verify_git_dependency uwebsockets_content-src fc2b7be765983fbce8a3839bc3ff16b51c81b44b

work=$(mktemp -d "$out/build.XXXXXX")
source="$work/magicpods-cinnamon-source"
runtime="$work/magicpods-cinnamon"
mkdir -p "$source/core" "$source/vendor" "$source/tools" "$source/patches"
mkdir -p "$runtime/applet" "$runtime/service" "$runtime/backend" "$runtime/licenses"

git -C "$core" archive "$pin" | tar -x -C "$source/core"
patch -d "$source/core" -p1 < "$repo/patches/backend.patch"
for dep in sdbus-cpp-src usockets_content-src uwebsockets_content-src nlohmann_json-src tomlplusplus-src; do
    tar --exclude='.git' -cf - -C "$cache" "$dep" | tar -xf - -C "$source/vendor"
done
install -m 755 "$repo/tools/build-core.sh" "$source/tools/"
install -m 644 "$repo/patches/backend.patch" "$source/patches/"
install -m 755 "$repo/install.sh" "$repo/uninstall.sh" "$runtime/"
install -m 644 "$repo/README.md" "$repo/LICENSE" "$repo/NOTICE" "$runtime/"
install -m 644 "$repo/applet/applet.js" "$repo/applet/metadata.json" \
    "$repo/applet/settings-schema.json" "$repo/applet/stylesheet.css" "$runtime/applet/"
install -m 755 "$repo/service/check-backend" "$runtime/service/"
install -m 644 "$repo/service/magicpods-cinnamon.service" "$runtime/service/"
cp -a "$runtime/applet" "$runtime/service" "$runtime/"*.sh \
    "$runtime/README.md" "$runtime/LICENSE" "$runtime/NOTICE" "$source/"

install -m 644 "$source/vendor/sdbus-cpp-src/COPYING" "$runtime/licenses/sdbus-cpp-LGPL-2.1"
install -m 644 "$source/vendor/sdbus-cpp-src/COPYING-LGPL-Exception" "$runtime/licenses/sdbus-cpp-exception"
install -m 644 "$source/vendor/usockets_content-src/LICENSE" "$runtime/licenses/uSockets-Apache-2.0"
install -m 644 "$source/vendor/uwebsockets_content-src/LICENSE" "$runtime/licenses/uWebSockets-Apache-2.0"
install -m 644 "$source/vendor/nlohmann_json-src/LICENSE.MIT" "$runtime/licenses/nlohmann-json-MIT"
install -m 644 "$source/vendor/tomlplusplus-src/LICENSE" "$runtime/licenses/tomlplusplus-MIT"
for dep in usockets_content-src uwebsockets_content-src; do
    if [ -f "$source/vendor/$dep/NOTICE" ]; then
        install -m 644 "$source/vendor/$dep/NOTICE" "$runtime/licenses/$dep-NOTICE"
    fi
done

"$source/tools/build-core.sh" "$work/core-build"
install -m 755 "$work/core-build/magicpodscore" "$runtime/backend/"
(cd "$runtime/backend" && sha256sum magicpodscore > magicpodscore.sha256)
"$runtime/backend/magicpodscore" --version

archive() {
    tar --sort=name --mtime=@1793093247 --owner=0 --group=0 --numeric-owner \
        -C "$work" -cf "$work/archive.tar" "$1"
    gzip -n -9 -c "$work/archive.tar" > "$out/$2"
}
archive magicpods-cinnamon-source magicpods-cinnamon-source.tar.gz
archive magicpods-cinnamon magicpods-cinnamon-mint22-x86_64.tar.gz
(
    cd "$out"
    sha256sum magicpods-cinnamon-mint22-x86_64.tar.gz magicpods-cinnamon-source.tar.gz > SHA256SUMS
)
printf 'Archives and checksums: %s\n' "$out"
