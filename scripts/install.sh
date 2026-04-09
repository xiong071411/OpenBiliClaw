#!/usr/bin/env bash
#
# OpenBiliClaw one-command installer.
#
# Usage:
#     curl -fsSL https://raw.githubusercontent.com/OpenBiliClaw/OpenBiliClaw/main/scripts/install.sh | bash
#
# Environment overrides:
#     INSTALL_DIR      Target directory (default: $HOME/OpenBiliClaw)
#     REUSE_FROM       Reuse API keys/cookie from another OpenBiliClaw checkout
#                      (default: auto-detected under $HOME)
#     OPENBILICLAW_REPO_URL  Git repository URL (default: public GitHub)
#     OPENBILICLAW_BRANCH    Git branch to clone (default: main)
#     SKIP_START       Set to any non-empty value to skip starting the backend
#     MODE             auto | docker | local (default: auto)
#     PORT             API port (default: 8420)
#     HOST             API host  (default: 127.0.0.1)
#
# Examples:
#     INSTALL_DIR=$HOME/obc curl -fsSL .../install.sh | bash
#     REUSE_FROM=$HOME/workspace/OpenBiliClaw curl -fsSL .../install.sh | bash
#     SKIP_START=1 curl -fsSL .../install.sh | bash      # prepare only
#
# Works on macOS, Linux, and WSL2. Requires git and python3 (3.11+).
# Native Windows is not supported — use WSL2.

set -euo pipefail

readonly DEFAULT_REPO_URL="https://github.com/OpenBiliClaw/OpenBiliClaw.git"
readonly DEFAULT_BRANCH="main"
readonly DEFAULT_INSTALL_DIR="${HOME}/OpenBiliClaw"
readonly CANDIDATE_SOURCES=(
    "${HOME}/workspace/OpenBiliClaw"
    "${HOME}/OpenBiliClaw"
    "${HOME}/projects/OpenBiliClaw"
    "${HOME}/code/OpenBiliClaw"
)

REPO_URL="${OPENBILICLAW_REPO_URL:-$DEFAULT_REPO_URL}"
BRANCH="${OPENBILICLAW_BRANCH:-$DEFAULT_BRANCH}"
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
REUSE_FROM="${REUSE_FROM:-}"
SKIP_START="${SKIP_START:-}"
MODE="${MODE:-auto}"
PORT="${PORT:-8420}"
HOST="${HOST:-127.0.0.1}"

# ---------------------------------------------------------------------------
# Logging helpers (ANSI colours only when stdout is a tty)

if [ -t 1 ]; then
    readonly C_CYAN=$'\033[1;36m'
    readonly C_GREEN=$'\033[1;32m'
    readonly C_RED=$'\033[1;31m'
    readonly C_YELLOW=$'\033[1;33m'
    readonly C_RESET=$'\033[0m'
else
    readonly C_CYAN=""
    readonly C_GREEN=""
    readonly C_RED=""
    readonly C_YELLOW=""
    readonly C_RESET=""
fi

log()  { printf '%s[openbiliclaw]%s %s\n' "$C_CYAN"   "$C_RESET" "$*"; }
ok()   { printf '%s[openbiliclaw]%s %s\n' "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf '%s[openbiliclaw]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf '%s[openbiliclaw]%s %s\n' "$C_RED"    "$C_RESET" "$*" >&2; }

# ---------------------------------------------------------------------------
# Prerequisite checks

require_command() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        err "Missing required command: $cmd"
        case "$cmd" in
            git)     err "  Install: https://git-scm.com/downloads" ;;
            python3) err "  Install Python 3.11+: https://www.python.org/downloads/" ;;
        esac
        exit 1
    fi
}

check_python_version() {
    local version
    version=$(python3 -c 'import sys; print("{}.{}".format(sys.version_info[0], sys.version_info[1]))')
    local major minor
    major=${version%.*}
    minor=${version#*.}
    if (( major < 3 )) || (( major == 3 && minor < 11 )); then
        err "Python 3.11+ required, found $version"
        exit 1
    fi
}

check_platform() {
    case "$(uname -s)" in
        Darwin|Linux) ;;
        MINGW*|MSYS*|CYGWIN*)
            err "Native Windows is not supported. Please install WSL2 and re-run this command."
            exit 1
            ;;
        *)
            warn "Unrecognised platform: $(uname -s). Proceeding anyway."
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Source discovery (auto-reuse existing install)

auto_detect_reuse_source() {
    if [ -n "$REUSE_FROM" ]; then
        return
    fi
    local cand
    for cand in "${CANDIDATE_SOURCES[@]}"; do
        if [ "$cand" = "$INSTALL_DIR" ]; then
            continue
        fi
        if [ ! -d "$cand" ]; then
            continue
        fi
        # Valid if it has a config.toml OR a bilibili_cookie.json
        if [ -f "$cand/config.toml" ] || [ -f "$cand/data/bilibili_cookie.json" ]; then
            REUSE_FROM="$cand"
            log "Found existing OpenBiliClaw at ${C_GREEN}${REUSE_FROM}${C_RESET} — will reuse API keys and cookie."
            return
        fi
    done
}

# ---------------------------------------------------------------------------
# Main install steps

ensure_checkout() {
    if [ -f "$INSTALL_DIR/pyproject.toml" ] && [ -f "$INSTALL_DIR/config.example.toml" ]; then
        log "Using existing checkout at $INSTALL_DIR"
        return
    fi

    if [ -e "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]; then
        err "Target directory is not empty and not an OpenBiliClaw checkout: $INSTALL_DIR"
        err "Set INSTALL_DIR to an empty or non-existent path, or remove the existing one first."
        exit 1
    fi

    mkdir -p "$(dirname "$INSTALL_DIR")"
    log "Cloning ${REPO_URL} (branch ${BRANCH}) into ${INSTALL_DIR}"
    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
}

run_bootstrap() {
    local bootstrap="$INSTALL_DIR/scripts/agent_bootstrap.py"
    if [ ! -f "$bootstrap" ]; then
        err "Bootstrap script missing: $bootstrap"
        err "Your checkout may be stale — run 'git pull' inside $INSTALL_DIR and retry."
        exit 1
    fi

    local args=(
        --project-dir "$INSTALL_DIR"
        --mode "$MODE"
        --host "$HOST"
        --port "$PORT"
    )
    if [ -n "$REUSE_FROM" ]; then
        args+=(--reuse-from "$REUSE_FROM")
    fi
    if [ -n "$SKIP_START" ]; then
        args+=(--skip-start)
    fi

    log "Running bootstrap: python3 $bootstrap ${args[*]}"
    python3 "$bootstrap" "${args[@]}"
}

print_next_steps() {
    echo ""
    ok "OpenBiliClaw install complete"
    echo ""
    echo "  Checkout:    $INSTALL_DIR"
    if [ -n "$REUSE_FROM" ]; then
        echo "  Reused from: $REUSE_FROM"
    fi
    echo "  Health URL:  http://${HOST}:${PORT}/api/health"
    echo ""
    echo "Next steps:"
    echo "  cd $INSTALL_DIR"
    echo "  curl http://${HOST}:${PORT}/api/health            # confirm backend is up"
    echo "  uv run openbiliclaw init                          # first-time init (history, profile, discovery)"
    echo "  uv run openbiliclaw recommend                     # get recommendations"
    echo ""
    echo "If the bootstrap reported missing credentials, supply them with:"
    echo "  python3 scripts/agent_bootstrap.py --project-dir . \\"
    echo "      --llm-api-key \"\$YOUR_KEY\" --bilibili-cookie \"\$YOUR_COOKIE\" --skip-start \\"
    echo "      --port $PORT --host $HOST"
    echo ""
    echo "Full agent contract: $INSTALL_DIR/docs/agent-install.md"
}

main() {
    log "OpenBiliClaw one-command installer"
    check_platform
    require_command git
    require_command python3
    check_python_version

    auto_detect_reuse_source
    ensure_checkout
    run_bootstrap
    print_next_steps
}

main "$@"
