#!/usr/bin/env bash
# Deploy web assets to Netlify via the zip-upload API.
set -euo pipefail
cd "$(dirname "$0")"
NETLIFY_SITE_ID="${NETLIFY_SITE_ID:-64175b72-d9f1-48c3-a7e0-1911983e7723}"
CFG="$HOME/.config/netlify/config.json"
NETLIFY_AUTH_TOKEN="${NETLIFY_AUTH_TOKEN:-$(jq -r '.users[.userId].auth.token' "$CFG" 2>/dev/null || true)}"
if [ -z "$NETLIFY_AUTH_TOKEN" ] || [ "$NETLIFY_AUTH_TOKEN" = "null" ]; then
  echo "deploy: no NETLIFY_AUTH_TOKEN"; exit 1
fi
ZIP="/tmp/gargantua-deploy.$$.zip"; rm -f "$ZIP"
zip -qr "$ZIP" index.html css js vendor audio
echo "[deploy] uploading $(du -h "$ZIP" | cut -f1) to site $NETLIFY_SITE_ID ..."
RESP="$(curl -s -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
  -H "Content-Type: application/zip" --data-binary @"$ZIP" \
  "https://api.netlify.com/api/v1/sites/$NETLIFY_SITE_ID/deploys")"
rm -f "$ZIP"
DID="$(echo "$RESP" | jq -r '.id // empty')"
URL="$(echo "$RESP" | jq -r '.ssl_url // .deploy_ssl_url // .url // "?"')"
[ -z "$DID" ] && { echo "[deploy] FAILED: $RESP"; exit 1; }
for i in $(seq 1 15); do
  st="$(curl -s -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" "https://api.netlify.com/api/v1/deploys/$DID" | jq -r '.state')"
  echo "[deploy]   state=$st"; [ "$st" = "ready" ] && break; sleep 2
done
echo "[deploy] ✓ live: $URL"
