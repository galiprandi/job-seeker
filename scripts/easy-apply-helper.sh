#!/bin/bash
# Helper to apply to a job from current LinkedIn Jobs search page
# Usage: bash scripts/easy-apply-helper.sh <listitem_ref> <easy_apply_button_ref>
# Navigates through all steps automatically
set -e
cd "$(dirname "$0")/.."

LI_REF="$1"
EA_REF="$2"

if [ -z "$LI_REF" ] || [ -z "$EA_REF" ]; then
  echo "Usage: $0 <listitem_ref> <easy_apply_button_ref>"
  exit 1
fi

echo "Clicking job card $LI_REF..."
npx playwright-cli click "$LI_REF" 2>&1 | tail -3
sleep 2

echo "Clicking Easy Apply button $EA_REF..."
npx playwright-cli click "$EA_REF" 2>&1 | tail -3
sleep 3

# Loop through steps
for i in 1 2 3 4 5 6 7 8; do
  BTN=$(npx playwright-cli snapshot 2>&1 | grep -o 'button "Continue to next step" \[ref=[a-f0-9]*\]' | head -1 | grep -o '\[ref=[a-f0-9]*\]' | head -1 | sed 's/\[ref=//;s/\]//')
  if [ -n "$BTN" ]; then
    echo "Step $i: Continue..."
    npx playwright-cli click "$BTN" 2>&1 | tail -2
    sleep 2
    continue
  fi
  BTN=$(npx playwright-cli snapshot 2>&1 | grep -o 'button "Review your application" \[ref=[a-f0-9]*\]' | head -1 | grep -o '\[ref=[a-f0-9]*\]' | head -1 | sed 's/\[ref=//;s/\]//')
  if [ -n "$BTN" ]; then
    echo "Review step..."
    npx playwright-cli click "$BTN" 2>&1 | tail -2
    sleep 2
    continue
  fi
  BTN=$(npx playwright-cli snapshot 2>&1 | grep -o 'button "Submit application" \[ref=[a-f0-9]*\]' | head -1 | grep -o '\[ref=[a-f0-9]*\]' | head -1 | sed 's/\[ref=//;s/\]//')
  if [ -n "$BTN" ]; then
    echo "Submitting..."
    npx playwright-cli click "$BTN" 2>&1 | tail -2
    sleep 2
    echo "APPLIED"
    exit 0
  fi
  echo "No button found at step $i, checking for questions..."
  # Check if there are questions to fill
  npx playwright-cli snapshot 2>&1 | grep -i "textbox\|radio\|checkbox\|combobox" | head -5
  sleep 1
done
echo "Max steps reached"
exit 1
