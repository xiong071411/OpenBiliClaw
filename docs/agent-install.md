# OpenBiliClaw agent install contract

> **⚠️ If you reached this file via WebFetch, STOP.** Claude Code's WebFetch
> tool hands the document to a small summariser model before returning it,
> which can silently drop exact flag names, JSON field names, and shell
> commands. Instead, **download this file verbatim** with
> `curl -fsSL <url> -o /tmp/agent-install.md`, then Read it. Or — better
> yet — just run `curl -fsSL https://raw.githubusercontent.com/OpenBiliClaw/OpenBiliClaw/main/scripts/install.sh | bash`
> which wraps every step in this document inside a standalone shell script
> and emits the same `BOOTSTRAP_STATUS:` JSON events you'd parse anyway.
>
> Machine-operational install contract. When a user pastes
> "please follow <this URL> to install OpenBiliClaw" into an AI coding agent
> (Claude Code, Codex CLI, OpenClaw, Cursor Agent, …), obtain this file via
> `curl` (not WebFetch) and execute the steps literally. Do not improvise.
> Do not skip steps.

**Goal:** Deploy the OpenBiliClaw backend on the user's current machine,
reusing any existing install's API keys and Bilibili cookie, and asking the
user for nothing except the credentials that genuinely cannot be recovered
from disk.

---

## Step 1 — Prepare the checkout

- If the user gave you a target directory, `cd` there. Otherwise use
  `$HOME/OpenBiliClaw`.
- If that directory already contains `pyproject.toml` **and**
  `config.example.toml`, treat it as an existing checkout and continue.
- Else, clone into it:
  ```bash
  git clone --branch main --depth 1 https://github.com/OpenBiliClaw/OpenBiliClaw.git <dir>
  ```
- Never clone into a non-empty directory that doesn't already look like
  OpenBiliClaw. Stop and ask the user instead.

**All subsequent commands in this document run from inside that checkout
directory.** Either `cd <dir>` once at the start, or pass an absolute path
to every `--project-dir` flag.

## Step 2 — Find an existing install to reuse credentials from

Try these paths **in order** and stop at the first one that has either a
non-empty `config.toml` or a `data/bilibili_cookie.json`:

1. `~/workspace/OpenBiliClaw`
2. `~/OpenBiliClaw`
3. `~/projects/OpenBiliClaw`
4. `~/code/OpenBiliClaw`

Fallback search:
```bash
find ~ -maxdepth 4 -type f -name "config.toml" -path "*OpenBiliClaw*" 2>/dev/null
```

If nothing matches, skip this step — do **not** interrogate the user yet.
You'll only ask for credentials if Step 4 reports them missing.

## Step 3 — Run the bootstrap script

Base command (always run this form):

```bash
python3 scripts/agent_bootstrap.py --project-dir . --mode auto
```

Optional flags (append when the condition is met — **do not paste these brackets literally**):

- `--reuse-from <absolute path from Step 2>` — append when Step 2 found a valid existing install. Omit entirely if not.
- `--port <N>` — append only when the default port 8420 is already in use on this machine.
- `--host <H>` — append only when the user wants to bind to a non-default interface.

Example with everything:

```bash
python3 scripts/agent_bootstrap.py --project-dir . --mode auto --reuse-from /Users/alice/workspace/OpenBiliClaw --port 8421
```

The script is self-contained Python stdlib. It emits two kinds of lines on
stdout:

- `[bootstrap] …` — human-readable progress
- `BOOTSTRAP_STATUS: {"status": ..., "message": ..., "details": {...}}` — the
  machine contract you parse

## Step 4 — Decide from the final BOOTSTRAP_STATUS line

Read the **last** `BOOTSTRAP_STATUS` line. Record `details.health_url`
(always use this — never hard-code port 8420). Branch on `status`:

| status | meaning | action |
|---|---|---|
| `complete` | backend running, no missing secrets | `curl details.health_url`, report success, exit |
| `running_with_missing_secrets` | backend running but missing credentials | proceed to Step 5 |
| `needs_secrets` | backend not started, credentials missing | proceed to Step 5 |
| `error` | a step failed | report `details.step` and the message, stop |

## Step 5 — Prompt user for missing secrets

`details.missing` is an array. For each entry:

- `llm.<provider>.api_key` — ask the user for the API key that matches
  the default provider (`details.provider`).
- `bilibili.cookie` — ask the user to log into <https://www.bilibili.com>
  and paste the full cookie string from DevTools → Network → any request
  header.

Then re-run the **same** script with the new values. Carry forward every
flag you used in Step 3 (`--port`, `--host`, `--reuse-from`, …) so the
service keeps the same listen address:

```bash
python3 scripts/agent_bootstrap.py \
    --project-dir . \
    --llm-api-key "<user input>" \
    --bilibili-cookie "<user input>" \
    --skip-start \
    [original --port / --host / --reuse-from ...]
```

Then `curl <details.health_url>` to confirm the service is still healthy.

## Step 6 — Final summary to the user

Report in **one** message:

1. Deployment mode (`docker` / `local`)
2. Source directory you reused credentials from (or "none")
3. List of `details.reused` items
4. Health check result (status code + body)
5. Anything still missing (should be empty if Step 5 ran)
6. One-line suggestion of the next command, e.g.
   `uv run openbiliclaw init` or `uv run openbiliclaw recommend`

## Hard rules

1. Never edit `config.toml` by hand. Every credential write goes through
   `agent_bootstrap.py` flags.
2. Never hard-code `http://127.0.0.1:8420/api/health` — always read
   `details.health_url` from the last `BOOTSTRAP_STATUS` line.
3. Never run `openbiliclaw init` unless the user explicitly asks for it.
   It triggers real LLM calls and real Bilibili history fetches.
4. If `python3 scripts/agent_bootstrap.py --help` reveals a flag you don't
   recognise, read it before adding it to your command.
5. On any `error` status, stop and surface `details.step` + the message to
   the user. Don't retry blindly.

## Troubleshooting quick reference

| Symptom | Cause | Fix |
|---|---|---|
| `error` at step `clone` | `git` missing / network issue | Install git, retry |
| `error` at step `config` | `config.example.toml` missing | Wrong directory — verify `--project-dir` |
| `error` at step `reuse` | `--reuse-from` path invalid | Re-run Step 2, prompt user |
| `error` at step `install` | Python < 3.11 or dependency failure | Install Python 3.11+, retry |
| `error` at step `docker_up` | Docker daemon down or compose v1 | Fall back to `--mode local` |
| `health_check_failed` | Backend started but `/api/health` never returned 200 | `tail logs/agent-bootstrap.log` (local) or `docker compose logs` (docker) |

## Related documentation

- `docs/agent-deployment.md` — long-form human-readable version of this contract
- `docs/docker-deployment.md` — manual Docker setup
- `docs/openclaw-quickstart.md` — OpenClaw-specific integration after install
- `scripts/install.sh` — curl-friendly one-liner that wraps this contract for humans
