#!/usr/bin/env bash
set -euo pipefail

base_url='https://quoteproof-judge-preview.vercel.app'
historical_tx='0x076690438e81f96fc77f3f6467157d2f53c05703ef098790a42b82909a340ef9'
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
summary="${GITHUB_STEP_SUMMARY:-$temp_dir/summary.md}"

if [[ "$(date -u +%Y%m%d)" -ge 20261020 ]]; then
  printf '## Judge link health\n\nSkipped: judging ended on 16 Oct 2026; the winner announcement was expected around 19 Oct.\n' >> "$summary"
  exit 0
fi

printf '## Judge link health\n\nPublic curl only; no cookies, tokens, or bypass headers. Each check gets up to three attempts.\n\n| Check | Result | Detail |\n|---|---|---|\n' >> "$summary"

body_file="$temp_dir/response.json"
check_detail=''
failures=0

fetch_200() {
  local method="$1" url="$2" payload="${3:-}" status
  local args=(--silent --show-error --connect-timeout 10 --max-time 25 --output "$body_file" --write-out '%{http_code}')
  if [[ "$method" == POST ]]; then
    args+=(--request POST --header 'Content-Type: application/json' --data-binary "@$payload")
  fi
  if ! status="$(curl "${args[@]}" "$url")"; then
    check_detail='curl transport error'
    return 1
  fi
  if [[ "$status" != 200 ]]; then
    check_detail="HTTP $status"
    return 1
  fi
}

check_home() {
  fetch_200 GET "$base_url/?judge_health=$(date -u +%s%N)" || return 1
  if ! grep -Eq 'href="https://github[.]com/ref-dev22/quoteproof-template"[^>]*>QuoteProof source</a>' "$body_file"; then
    check_detail='footer source link missing'
    return 1
  fi
  check_detail='HTTP 200; footer links to public source'
}

check_share() {
  fetch_200 GET "$base_url/?tx=$historical_tx&hcsTopic=0.0.10698279&hcsSeq=1" || return 1
  check_detail='historical share link HTTP 200'
}

jq -cn --slurpfile receipt "$root/examples/adversarial/genuine.json" \
  '{receipt:$receipt[0]}' > "$temp_dir/genuine-compare.json"
jq -cn --slurpfile receipt "$root/examples/adversarial/genuine.json" \
  --arg transactionHash "$historical_tx" \
  '{receipt:$receipt[0],transactionHash:$transactionHash,logIndex:0,topicId:"0.0.10698279",sequenceNumber:1}' \
  > "$temp_dir/genuine-hcs.json"
jq -cn --slurpfile receipt "$root/examples/adversarial/recomputed-cents-1000.json" \
  '{receipt:$receipt[0]}' > "$temp_dir/forged-compare.json"

check_genuine_compare() {
  fetch_200 POST "$base_url/api/quote/compare" "$temp_dir/genuine-compare.json" || return 1
  if ! jq -e '.localConsistency.status == "valid" and .recordedComparison.status == "match" and .historicalOracle.status == "match"' "$body_file" >/dev/null; then
    check_detail='expected valid / match / match'
    return 1
  fi
  check_detail='valid / match / match'
}

check_genuine_hcs() {
  fetch_200 POST "$base_url/api/quote/hcs/verify" "$temp_dir/genuine-hcs.json" || return 1
  if ! jq -e '.hcsAnchor.status == "match"' "$body_file" >/dev/null; then
    check_detail='expected HCS match'
    return 1
  fi
  check_detail='HCS match'
}

check_forgery() {
  fetch_200 POST "$base_url/api/quote/compare" "$temp_dir/forged-compare.json" || return 1
  if ! jq -e '.recordedComparison.status == "mismatch"' "$body_file" >/dev/null; then
    check_detail='expected recorded mismatch for recomputed amount'
    return 1
  fi
  check_detail='recomputed amount rejected by stored record'
}

check_preview() {
  fetch_200 GET "$base_url/api/quote/preview?cents=100" || return 1
  local observed_at now age
  if ! observed_at="$(jq -er '.observedAt | select(type == "string" and test("^[0-9]+$"))' "$body_file")"; then
    check_detail='preview observation timestamp missing'
    return 1
  fi
  if ! jq -e '(.roundId | type == "string" and test("^[0-9]+$")) and (.price | type == "string" and test("^[0-9]+$"))' "$body_file" >/dev/null; then
    check_detail='preview round or price missing'
    return 1
  fi
  now="$(date -u +%s)"
  age=$((now - observed_at))
  if (( age < 0 )); then
    check_detail='preview observation is in the future'
    return 1
  fi
  if (( age > 93600 )); then
    check_detail="Chainlink testnet feed stale (${age}s old; exceeds 93600s policy)"
    return 1
  fi
  if (( age > 86400 )); then
    check_detail="Chainlink testnet feed stale (${age}s old; 24h alert threshold)"
    return 1
  fi
  check_detail="reference age ${age}s; within 24h alert threshold and 93600s policy"
}

run_check() {
  local label="$1" function_name="$2" attempt
  for attempt in 1 2 3; do
    if "$function_name"; then
      printf '| %s | PASS | %s (attempt %s) |\n' "$label" "$check_detail" "$attempt" >> "$summary"
      return
    fi
    if (( attempt < 3 )); then
      sleep $((2 ** attempt))
    fi
  done
  printf '| %s | FAIL | %s after 3 attempts |\n' "$label" "$check_detail" >> "$summary"
  failures=$((failures + 1))
}

run_check 'Home page' check_home
run_check 'Historical share link' check_share
run_check 'Genuine receipt: local / registry / oracle' check_genuine_compare
run_check 'Genuine receipt: HCS anchor' check_genuine_hcs
run_check 'Recomputed amount forgery' check_forgery
run_check 'Live reference freshness' check_preview

if [[ "${SIMULATE_FAILURE:-false}" == true ]]; then
  printf '| Simulated failure | FAIL | Requested by workflow_dispatch to test notifications |\n' >> "$summary"
  failures=$((failures + 1))
fi

cat "$summary"
if (( failures > 0 )); then
  exit 1
fi
