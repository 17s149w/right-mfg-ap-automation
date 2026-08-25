#!/usr/bin/env bash
# One-command client demo: starts the mock ERP, runs the batch in a VISIBLE
# browser, slow enough to follow, with on-screen narration + a recorded video.
#
#   ./demo.sh            # watch it live (headed, slow, narrated, records video)
#   ./demo.sh --live     # same, but actually clicks Save on matches
#
set -euo pipefail
cd "$(dirname "$0")"

DRY=true
[ "${1:-}" = "--live" ] && DRY=false

echo "Starting mock JobBOSS² server..."
node mock/serve.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1

AP_TARGET=mock \
AP_HEADLESS=false \
AP_SLOWMO=650 \
AP_NARRATE=true \
AP_VIDEO=true \
AP_DRY_RUN=$DRY \
AP_TOLERANCE_CENTS=0 \
node src/index.js --input data/invoices.sample.json

echo ""
echo "Done. Video is in ./reports/video/ ; the JSON + Markdown report are under the"
echo "working dir's reports/ (data/work/reports/ unless AP_WORK_DIR is set)."
