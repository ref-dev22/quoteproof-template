#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${PROBE_ROOT:?PROBE_ROOT is required}"

case "${1:?use setup or cleanup}" in
  setup)
    mkdir -p "$work/evidence" "$work/bin"
    # Same unavailable-manifest simulation as ci-readme-start-here.sh:
    # archive this checkout, reuse its HTTP server, block only the API host.
    git -C "$root" archive --format=tar.gz --prefix=quoteproof-template/ HEAD -o "$work/template.tar.gz"
    node "$root/scripts/ci-serve-template-archive.mjs" "$work/template.tar.gz" "$work/server-port" > "$work/archive-server.log" 2>&1 &
    echo "$!" > "$work/archive-server.pid"
    for attempt in $(seq 1 50); do
      [[ -s "$work/server-port" ]] && break
      sleep 0.1
    done
    test -s "$work/server-port"
    archive_url="http://127.0.0.1:$(cat "$work/server-port")"
    curl --silent --show-error --fail --max-time 5 -o /dev/null \
      "$archive_url/repos/ref-dev22/quoteproof-template/tarball/main"
    printf '127.0.0.1 api.github.com # quoteproof-ci-fallback-probe\n' | sudo tee -a /etc/hosts >/dev/null
    if curl --silent --show-error --noproxy '*' --max-time 5 -o /dev/null \
      https://api.github.com > "$work/api-check.log" 2>&1; then
      printf 'GitHub API remained reachable; fallback was not simulated.\n' >&2
      exit 1
    fi
    printf 'GIGET_GITHUB_URL=%s\n' "$archive_url" >> "$GITHUB_ENV"
    git config --global user.name 'github-actions[bot]'
    git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'
    # Transparent observers preserve arguments/cwd/environment and return the
    # real install exit code. A failed CLI install must never be retried.
    for manager in npm yarn forge; do
      command -v "$manager" > "$work/$manager-path"
      printf '#!/usr/bin/env bash\nexec node %q observe %q "$@"\n' \
        "$root/scripts/ci-fallback-probe.mjs" "$manager" > "$work/bin/$manager"
      chmod +x "$work/bin/$manager"
    done
    printf '%s\n' "$work/bin" >> "$GITHUB_PATH"
    {
      printf 'Template commit: '; git -C "$root" rev-parse HEAD
      printf 'Node: '; node --version
      printf 'npm: '; npm --version
      printf 'Yarn: '; yarn --version
      forge --version
      printf 'create-scaffold-hbar latest: '; npm view create-scaffold-hbar@latest version
      printf 'GitHub API: blocked; template archive: localhost\n'
    } > "$work/toolchain.log"
    ;;
  cleanup)
    sudo sed -i '/# quoteproof-ci-fallback-probe$/d' /etc/hosts
    if [[ -f "$work/archive-server.pid" ]]; then
      kill "$(cat "$work/archive-server.pid")" 2>/dev/null || true
    fi
    if [[ -f "$work/app.pid" ]]; then
      kill -- "-$(cat "$work/app.pid")" 2>/dev/null || true
    fi
    ;;
  *) exit 2 ;;
esac
