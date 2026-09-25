#!/usr/bin/env bash
set -euo pipefail

mode="${1:?use normal or rate-limited}"
if [[ "$mode" != normal && "$mode" != rate-limited ]]; then
  printf 'Unknown mode: %s\n' "$mode" >&2
  exit 2
fi

# The documented creator must never inherit a GitHub credential. The GitHub
# checkout action also uses persist-credentials: false in the workflow.
unset GITHUB_TOKEN GH_TOKEN GIGET_AUTH GITHUB_API_TOKEN

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/quoteproof-readme-$mode"
mkdir -p "$work"
command_file="$work/start-here-command.sh"
awk '
  /^## Start here$/ { in_section=1; next }
  in_section && /^## / { exit }
  in_section && /^```bash$/ { in_block=1; next }
  in_block && /^```$/ { exit }
  in_block { print }
' "$root/README.md" > "$command_file"
test -s "$command_file"
test "$(wc -l < "$command_file")" -eq 1

read_quota() {
  local output="$work/rate-limit.json"
  curl --silent --show-error --max-time 10 \
    -H 'Accept: application/vnd.github+json' \
    -o "$output" https://api.github.com/rate_limit
  node -e 'const j=require(process.argv[1]); const n=j.resources?.core?.remaining; if(!Number.isInteger(n)) process.exit(1); console.log(n)' "$output"
}

if [[ "$mode" == rate-limited ]]; then
  remaining="$(read_quota)"
  for attempt in $(seq 1 70); do
    if [[ "$remaining" == 0 ]]; then break; fi
    curl --silent --show-error --max-time 10 -o /dev/null \
      -H 'Accept: application/vnd.github+json' \
      -H 'Cache-Control: no-cache' \
      "https://api.github.com/repos/ref-dev22/quoteproof-template/commits?per_page=1&quota_burn=$attempt" || true
    remaining="$(read_quota)"
    sleep 1
  done
  printf 'Anonymous GitHub core remaining after quota setup: %s\n' "$remaining"
  test "$remaining" -eq 0
fi

version="$(npm create scaffold-hbar@latest -- --version </dev/null)"
printf 'Resolved create-scaffold-hbar version: %s\n' "$version"
npm_version="$(npm --version)"
printf 'npm version: %s\n' "$npm_version"

git config --global user.name 'github-actions[bot]'
git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'
mkdir -p "$work/readme"
set +e
(cd "$work/readme" && bash "$command_file" </dev/null > "$work/readme.log" 2>&1)
readme_exit=$?
set -e
if [[ "$readme_exit" -ne 0 ]]; then
  printf 'Exact README command failed with exit %s\n' "$readme_exit" >&2
  exit "$readme_exit"
fi
app="$work/readme/quoteproof"
test -f "$app/packages/hardhat/contracts/QuoteProofRegistry.sol"
test ! -e "$app/packages/foundry"
test -f "$app/package-lock.json"
test ! -e "$app/yarn.lock"
printf 'README command passed: Hardhat contract and npm lockfile present; Foundry and Yarn lockfile absent.\n'

if [[ "$mode" == rate-limited ]]; then
  remaining="$(read_quota)"
  printf 'Anonymous GitHub core remaining after scaffold: %s\n' "$remaining"
  test "$remaining" -eq 0

  error_line() {
    node - "$1" <<'NODE'
const fs = require("node:fs");
const lines = fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const line = lines.find(value => /Yarn|Foundry|unknown option|validation|Invalid|not installed/i.test(value))
  ?? lines.find(value => /error/i.test(value))
  ?? lines.at(-1)
  ?? "no output";
console.log(line.replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]").replaceAll("|", "/").slice(0, 180));
NODE
  }

  run_case() {
    local label="$1" npm_label="$2" directory="$3"
    shift 3
    mkdir -p "$work/$directory"
    set +e
    (cd "$work/$directory" && timeout 180s "$@" </dev/null > "$work/$directory.log" 2>&1)
    local result=$?
    set -e
    local detail
    detail="$(error_line "$work/$directory.log")"
    printf '| `%s` | `%s` | `0` | exit `%s`: %s |\n' "$label" "$npm_label" "$result" "$detail" >> "$GITHUB_STEP_SUMMARY"
    printf 'Evidence %s: exit %s; %s\n' "$directory" "$result" "$detail"
  }

  npm11_version="$(npx --yes npm@11 --version </dev/null)"
  {
    printf '### Anonymous-rate-limit scaffold evidence\n\n'
    printf 'Resolved create-scaffold-hbar: `%s`\n\n' "$version"
    printf '| command | npm | quota | result |\n'
    printf '|---|---:|---:|---|\n'
    printf '| `%s` | `%s` | `0` | passed; Hardhat + npm lockfile |\n' "$(cat "$command_file")" "$npm_version"
  } >> "$GITHUB_STEP_SUMMARY"

  run_case 'npm create scaffold-hbar@latest -- --template ref-dev22/quoteproof-template --ci --skip-install' \
    "$npm_version" old npm create scaffold-hbar@latest -- --template ref-dev22/quoteproof-template --ci --skip-install
  run_case 'npm create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills' \
    "$npm_version" no-separator-npm10 npm create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills
  run_case 'npm create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills' \
    "$npm11_version" no-separator-npm11 npx --yes npm@11 create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills
fi
