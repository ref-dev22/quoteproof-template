#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d)"
parent="$scratch/work"
mkdir -p "$parent"
export GIT_CONFIG_GLOBAL="$scratch/gitconfig"
git config --global user.name 'Tutorial CI'
git config --global user.email 'tutorial-ci@example.invalid'
started_at="$(date +%s)"
server_pid=''
cleanup() {
  if [[ -n "$server_pid" ]]; then
    pkill -TERM -P "$server_pid" 2>/dev/null || true
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  local elapsed=$(( $(date +%s) - started_at ))
  printf '\n## Tutorial run\n\nTotal: %d minutes %d seconds. Scaffolded app; localhost health and WebKit checks. Historical checks use the published reference registry. Browser limit on localhost: 60 seconds to four green (public judge check remains 8 seconds).\n' "$((elapsed / 60))" "$((elapsed % 60))" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  rm -rf -- "$scratch"
}
trap cleanup EXIT

node - "$root/docs/TUTORIAL.md" "$scratch" <<'NODE'
const fs = require('node:fs');
const [source, dir] = process.argv.slice(2);
const markdown = fs.readFileSync(source, 'utf8');
const matches = [...markdown.matchAll(/```bash tutorial:(scaffold|start|demo|verify)\r?\n([\s\S]*?)\r?\n```/g)];
const expected = ['scaffold', 'start', 'demo', 'verify'];
if (matches.length !== expected.length || matches.some((match, index) => match[1] !== expected[index])) {
  throw new Error(`Expected marked runnable tutorial blocks in this order: ${expected.join(', ')}`);
}
for (const match of matches) fs.writeFileSync(`${dir}/${match[1]}.sh`, `${match[2]}\n`);
NODE

echo 'Running marked scaffold command from TUTORIAL.md'
(cd "$parent" && bash -e "$scratch/scaffold.sh")
test -f "$parent/quoteproof/packages/hardhat/contracts/QuoteProofRegistry.sol"
test -f "$parent/quoteproof/package-lock.json"
test ! -e "$parent/quoteproof/packages/foundry"

echo 'Running marked app-start command from TUTORIAL.md'
(cd "$parent" && bash -e "$scratch/start.sh") > "$scratch/server.log" 2>&1 &
server_pid=$!
ready=false
for attempt in {1..150}; do
  if curl --silent --show-error --max-time 3 --output /dev/null --fail 'http://127.0.0.1:3001/'; then
    ready=true
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    tail -80 "$scratch/server.log"
    echo 'Tutorial app stopped before HTTP 200' >&2
    exit 1
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  tail -80 "$scratch/server.log"
  echo 'Tutorial app did not return HTTP 200 within five minutes' >&2
  exit 1
fi

echo 'Running marked demo and verifier commands from TUTORIAL.md'
(cd "$parent/quoteproof" && bash -e "$scratch/demo.sh")
(cd "$parent/quoteproof" && bash -e "$scratch/verify.sh")

echo 'Running localhost health and WebKit browser checks'
BASE_URL='http://127.0.0.1:3001' bash "$root/scripts/ci-judge-health.sh"
BASE_URL='http://127.0.0.1:3001' FOUR_GREEN_LIMIT_MS=60000 CHECK_TIMEOUT_MS=60000 \
  PLAYWRIGHT_MODULE="$PLAYWRIGHT_MODULE" node "$root/scripts/ci-judge-browser.cjs"
