#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Run from the corresponding source archive. Uses its vendored sources offline.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$#" -ne 1 ]; then
    echo 'Usage: tools/build-core.sh BUILD_DIRECTORY' >&2
    exit 2
fi
if [ ! -f "$root/core/CMakeLists.txt" ] || [ ! -d "$root/vendor" ]; then
    echo 'Extract the corresponding source archive before building.' >&2
    exit 1
fi
mkdir -p -- "$1"
build=$(CDPATH='' cd -- "$1" && pwd)
export LC_ALL=C SOURCE_DATE_EPOCH=1793093247
map="-ffile-prefix-map='$root'=. -ffile-prefix-map='$build'=./build"
cmake -S "$root/core" -B "$build" -DCMAKE_BUILD_TYPE=Release \
    "-DCMAKE_C_FLAGS=$map" "-DCMAKE_CXX_FLAGS=$map" \
    -DFETCHCONTENT_FULLY_DISCONNECTED=ON \
    "-DFETCHCONTENT_SOURCE_DIR_SDBUS-CPP=$root/vendor/sdbus-cpp-src" \
    "-DFETCHCONTENT_SOURCE_DIR_USOCKETS_CONTENT=$root/vendor/usockets_content-src" \
    "-DFETCHCONTENT_SOURCE_DIR_UWEBSOCKETS_CONTENT=$root/vendor/uwebsockets_content-src" \
    "-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=$root/vendor/nlohmann_json-src" \
    "-DFETCHCONTENT_SOURCE_DIR_TOMLPLUSPLUS=$root/vendor/tomlplusplus-src"
cmake --build "$build" --target magicpodscore --parallel "${JOBS:-2}"
