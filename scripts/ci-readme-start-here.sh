#!/usr/bin/env bash
set -euo pipefail

mode="${1:?use normal or manifest-unavailable}"
if [[ "$mode" != normal && "$mode" != manifest-unavailable ]]; then
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

if [[ "$mode" == manifest-unavailable ]]; then
  git -C "$root" archive --format=tar.gz --prefix=quoteproof-template/ HEAD -o "$work/template.tar.gz"
  node "$root/scripts/ci-serve-template-archive.mjs" "$work/template.tar.gz" "$work/server-port" &
  server_pid=$!
  hosts_added=false
  cleanup() {
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    if [[ "$hosts_added" == true ]]; then
      sudo sed -i '/# quoteproof-ci-manifest-unavailable$/d' /etc/hosts
    fi
  }
  trap cleanup EXIT
  for attempt in $(seq 1 50); do
    [[ -s "$work/server-port" ]] && break
    sleep 0.1
  done
  test -s "$work/server-port"
  export GIGET_GITHUB_URL="http://127.0.0.1:$(cat "$work/server-port")"
  curl --silent --show-error --fail --max-time 5 -o /dev/null \
    "$GIGET_GITHUB_URL/repos/ref-dev22/quoteproof-template/tarball/main"
  printf '127.0.0.1 api.github.com # quoteproof-ci-manifest-unavailable\n' | sudo tee -a /etc/hosts >/dev/null
  hosts_added=true
  if curl --silent --show-error --noproxy '*' --max-time 5 -o /dev/null \
    https://api.github.com > "$work/api-check.log" 2>&1; then
    printf 'GitHub API remained reachable; manifest fallback was not simulated.\n' >&2
    exit 1
  fi
  printf 'GitHub API: unreachable; template archive: local server.\n'
fi

version="$(npm view create-scaffold-hbar@latest version)"
test -n "$version"
printf 'Resolved create-scaffold-hbar version: %s\n' "$version"
npm_version="$(npm --version)"
printf 'npm version: %s\n' "$npm_version"

git config --global user.name 'github-actions[bot]'
git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'

error_line() {
  node - "$1" <<'NODE'
const fs = require("node:fs");
const lines = fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const line = lines.find(value => /Yarn|Foundry/i.test(value))
  ?? lines.find(value => /unknown option|validation|Invalid|not installed/i.test(value))
  ?? lines.find(value => /error/i.test(value))
  ?? lines.at(-1)
  ?? "no output";
console.log(line.replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]").replaceAll("|", "/").slice(0, 180));
NODE
}

if [[ "$mode" == manifest-unavailable ]]; then
  {
    printf '### GitHub manifest unavailable: local template archive\n\n'
    printf 'Resolved create-scaffold-hbar: `%s`. The GitHub API hostname was blocked while giget downloaded the checked-out archive from localhost.\n\n' "$version"
    printf '| command | npm | GitHub API | result |\n'
    printf '|---|---:|---|---|\n'
  } >> "$GITHUB_STEP_SUMMARY"

  mkdir -p "$work/old"
  set +e
  (cd "$work/old" && timeout 180s npm create scaffold-hbar@latest -- --template ref-dev22/quoteproof-template --ci --skip-install </dev/null > "$work/old.log" 2>&1)
  old_exit=$?
  set -e
  old_detail="$(error_line "$work/old.log")"
  if [[ "$old_exit" -ne 0 ]]; then
    if ! grep -Eiq 'foundry|yarn' <<< "$old_detail"; then
      printf 'old command failed for an unrelated reason\n' >&2
      exit 1
    fi
    old_result="exit $old_exit: $old_detail"
  else
    old_app="$(find "$work/old" -mindepth 1 -maxdepth 1 -type d -print -quit)"
    old_manager=""
    if [[ -n "$old_app" && -f "$old_app/package.json" ]]; then
      old_manager="$(node -e 'console.log(require(process.argv[1]).packageManager ?? "")' "$old_app/package.json")"
    fi
    if [[ -n "$old_app" && -d "$old_app/packages/foundry" && ! -d "$old_app/packages/hardhat" && "$old_manager" == yarn@* ]]; then
      old_result="Foundry + Yarn selected"
    else
      printf 'fallback not exercised (or CLI changed upstream); check version\n' >&2
      exit 1
    fi
  fi
  printf '| `%s` | `%s` | unreachable | %s |\n' \
    'npm create scaffold-hbar@latest -- --template ref-dev22/quoteproof-template --ci --skip-install' \
    "$npm_version" "$old_result" >> "$GITHUB_STEP_SUMMARY"
  printf 'Old command self-check: %s\n' "$old_result"
fi

mkdir -p "$work/readme"
set +e
(cd "$work/readme" && bash "$command_file" </dev/null > "$work/readme.log" 2>&1)
readme_exit=$?
set -e
if [[ "$readme_exit" -ne 0 ]]; then
  printf 'Exact README command failed with exit %s: %s\n' "$readme_exit" "$(error_line "$work/readme.log")" >&2
  exit "$readme_exit"
fi
app="$work/readme/quoteproof"
test -f "$app/packages/hardhat/contracts/QuoteProofRegistry.sol"
test ! -e "$app/packages/foundry"
test -f "$app/package-lock.json"
test ! -e "$app/yarn.lock"
printf 'README command passed: Hardhat contract and npm lockfile present; Foundry and Yarn lockfile absent.\n'

if [[ "$mode" == manifest-unavailable ]]; then
  printf '| `%s` | `%s` | unreachable | passed; Hardhat + npm lockfile |\n' \
    "$(cat "$command_file")" "$npm_version" >> "$GITHUB_STEP_SUMMARY"

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
    printf '| `%s` | `%s` | unreachable | exit `%s`: %s |\n' "$label" "$npm_label" "$result" "$detail" >> "$GITHUB_STEP_SUMMARY"
    printf 'Evidence %s: exit %s; %s\n' "$directory" "$result" "$detail"
  }

  npm11_version="$(npx --yes npm@11 --version </dev/null)"
  run_case 'npm create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills' \
    "$npm_version" no-separator-npm10 npm create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills
  run_case 'npm create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills' \
    "$npm11_version" no-separator-npm11 npx --yes npm@11 create scaffold-hbar@latest quoteproof --template ref-dev22/quoteproof-template --frontend nextjs-app --solidity-framework hardhat --network testnet --package-manager npm --skip-hedera-skills
fi
