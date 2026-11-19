#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build plugin/web/vendor
# LittleCMS 2.20, immutable upstream source revision.
LCMS_SHA=7717fce0d85447ef3b2df0cca2e99207c15eeecd
curl --fail --location --retry 3 "https://codeload.github.com/mm2/Little-CMS/tar.gz/$LCMS_SHA" -o .build/lcms.tar.gz
tar -xzf .build/lcms.tar.gz -C .build
LCMS_DIR=".build/Little-CMS-$LCMS_SHA"
emcc native/engine.c "$LCMS_DIR"/src/*.c -I "$LCMS_DIR/include" \
  -O3 -DCMS_NO_PTHREADS -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createEngine -sENVIRONMENT=web,worker,node \
  -sFILESYSTEM=0 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 \
  -sSTACK_SIZE=1048576 -sSINGLE_FILE=1 \
  '-sEXPORTED_FUNCTIONS=["_malloc","_free","_engine_version","_engine_open","_engine_close","_engine_channels","_engine_sample"]' \
  '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]' \
  -o plugin/web/vendor/lcms.mjs
cp "$LCMS_DIR/LICENSE" plugin/web/vendor/LittleCMS-LICENSE.txt
curl --fail --location --retry 3 https://raw.githubusercontent.com/emscripten-core/emscripten/4.0.20/LICENSE -o plugin/web/vendor/Emscripten-LICENSE.txt
printf '%s\n' "$LCMS_SHA" > plugin/web/vendor/LittleCMS-REVISION.txt
cc tests/fixtures.c "$LCMS_DIR"/src/*.c -I "$LCMS_DIR/include" -DCMS_NO_PTHREADS -lm -o .build/fixtures
.build/fixtures
