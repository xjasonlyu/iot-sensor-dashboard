#!/usr/bin/env sh

set -eu

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repository_dir=$(CDPATH= cd -- "$package_dir/../.." && pwd)
output_dir="$package_dir/src/generated"
dist_dir="$package_dir/dist"

rm -rf "$output_dir"
rm -rf "$dist_dir"
mkdir -p "$output_dir"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --volume "$repository_dir:/local" \
  openapitools/openapi-generator-cli:v7.24.0 generate \
  --input-spec /local/api_spec.yaml \
  --generator-name typescript-fetch \
  --output /local/packages/api-contract/src/generated \
  --additional-properties supportsES6=true,typescriptThreePlus=true,useSingleRequestParameter=true,importFileExtension=.js \
  --type-mappings Date=string \
  --global-property apis,models,supportingFiles=runtime.ts:index.ts:apis/index.ts:models/index.ts,apiDocs=false,modelDocs=false,apiTests=false,modelTests=false

"$package_dir/node_modules/.bin/tsc" --project "$package_dir/tsconfig.json"
