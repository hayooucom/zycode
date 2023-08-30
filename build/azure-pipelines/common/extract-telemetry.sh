#!/usr/bin/env bash
set -e

cd $BUILD_STAGINGDIRECTORY
mkdir extraction
cd extraction
git clone --depth 1 https://github.com/microsoft/zycode-extension-telemetry.git
git clone --depth 1 https://github.com/microsoft/zycode-chrome-debug-core.git
git clone --depth 1 https://github.com/microsoft/zycode-node-debug2.git
git clone --depth 1 https://github.com/microsoft/zycode-node-debug.git
git clone --depth 1 https://github.com/microsoft/zycode-html-languageservice.git
git clone --depth 1 https://github.com/microsoft/zycode-json-languageservice.git
node $BUILD_SOURCESDIRECTORY/node_modules/.bin/zycode-telemetry-extractor --sourceDir $BUILD_SOURCESDIRECTORY --excludedDir $BUILD_SOURCESDIRECTORY/extensions --outputDir . --applyEndpoints
node $BUILD_SOURCESDIRECTORY/node_modules/.bin/zycode-telemetry-extractor --config $BUILD_SOURCESDIRECTORY/build/azure-pipelines/common/telemetry-config.json -o .
mkdir -p $BUILD_SOURCESDIRECTORY/.build/telemetry
mv declarations-resolved.json $BUILD_SOURCESDIRECTORY/.build/telemetry/telemetry-core.json
mv config-resolved.json $BUILD_SOURCESDIRECTORY/.build/telemetry/telemetry-extensions.json
cd ..
rm -rf extraction
