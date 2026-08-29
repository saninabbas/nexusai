#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
extension_dir="$project_root/extension"
if [[ ! -d "$extension_dir" && -d "$project_root/../extension" ]]; then
  extension_dir="$(cd "$project_root/../extension" && pwd)"
fi
output_file="$project_root/public/Nexus-Trader-Extension.zip"
temporary_output="$output_file.tmp.zip"
temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

files=(
  README.md
  background.js
  binance.js
  config.js
  crypto-utils.js
  dashboard.css
  dashboard.html
  dashboard.js
  manifest.json
  popup.html
  popup.js
  strategies.js
  styles.css
)

for file in "${files[@]}"; do
  test -f "$extension_dir/$file" || { echo "Missing extension file: $file" >&2; exit 1; }
  cp "$extension_dir/$file" "$temporary_dir/$file"
done

node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(m.manifest_version!==3 || m.version!=="3.1.0" || m.background?.type!=="module") process.exit(1)' "$temporary_dir/manifest.json"

(cd "$temporary_dir" && zip -q -X -9 "$temporary_output" "${files[@]}")
mv "$temporary_output" "$output_file"
echo "Built $output_file"
