#!/bin/zsh
# pushbuild.sh <local-file> [remote-name]
#
# Uploads a build to Cloudflare R2 under qa-builds/ and prints the public URL.
# The R2 keys are never here: this asks the `r2-presign` edge function on the
# Yuuki project for a 15-minute presigned PUT, then sends the bytes straight to
# Cloudflare.
#
#   R2_PRESIGN_TOKEN   must match the secret of the same name on that project
#   YUUKI_REF          Supabase project ref (default below)
set -e
SRC="$1"; NAME="${2:-$(basename "$SRC")}"
REF="${YUUKI_REF:-hpjhqezgfqztcafaknzk}"
TOK="${R2_PRESIGN_TOKEN:?set R2_PRESIGN_TOKEN (Supabase → Yuuki project → Edge Functions → Secrets)}"

case "$NAME" in
  *.aab) CT="application/octet-stream" ;;
  *)     CT="application/vnd.android.package-archive" ;;
esac

RESP=$(curl -s -X POST "https://$REF.supabase.co/functions/v1/r2-presign" \
  -H "Content-Type: application/json" -H "x-presign-token: $TOK" \
  -d "{\"path\":\"qa-builds/$NAME\",\"contentType\":\"$CT\"}")
URL=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['url'])")
PUB=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['publicUrl'])")
curl -s -f -o /dev/null -X PUT -H "Content-Type: $CT" --data-binary @"$SRC" "$URL"
echo "$PUB"
