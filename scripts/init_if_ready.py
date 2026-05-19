#!/usr/bin/env python3.12
"""Run OpenBiliClaw init once after the browser extension syncs Bilibili cookies."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tomllib
import urllib.error
import urllib.request
from pathlib import Path


PROJECT_DIR = Path("/root/OpenBiliClaw")
COOKIE_PATH = PROJECT_DIR / "data" / "bilibili_cookie.json"
CONFIG_PATH = PROJECT_DIR / "config.toml"
ROOT_COOKIE_CANDIDATES = (Path("/root/b站cookie.txt"),)
COOKIE_API_URL = "http://127.0.0.1:8420/api/bilibili/cookie"
PYTHON = PROJECT_DIR / ".venv" / "bin" / "python"
CLI = PROJECT_DIR / ".venv" / "bin" / "openbiliclaw"


def _json_cookie_to_header(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("cookie", "Cookie", "cookies", "Cookies"):
            cookie = value.get(key)
            if isinstance(cookie, str) and cookie.strip():
                return cookie.strip()
            if isinstance(cookie, list):
                return _json_cookie_to_header(cookie)
        parts = []
        for name, cookie_value in value.items():
            if isinstance(name, str) and isinstance(cookie_value, (str, int, float)):
                parts.append(f"{name}={cookie_value}")
        return "; ".join(parts).strip()
    if isinstance(value, list):
        parts = []
        for item in value:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            cookie_value = str(item.get("value", "")).strip()
            if name and cookie_value:
                parts.append(f"{name}={cookie_value}")
        return "; ".join(parts).strip()
    return ""


def _normalize_cookie_text(text: str) -> str:
    text = text.strip().strip("\ufeff")
    if not text:
        return ""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        cookie = text
    else:
        cookie = _json_cookie_to_header(parsed)
    cookie = " ".join(line.strip() for line in cookie.splitlines() if line.strip())
    if "cookie:" in cookie[:16].lower():
        cookie = cookie.split(":", 1)[1].strip()
    markers = ("SESSDATA=", "bili_jct=", "DedeUserID=", "buvid3=")
    if any(marker in cookie for marker in markers) and "=" in cookie:
        return cookie
    return ""


def _read_root_cookie() -> str:
    for path in ROOT_COOKIE_CANDIDATES:
        if not path.exists() or path.stat().st_size <= 0:
            continue
        try:
            cookie = _normalize_cookie_text(path.read_text(encoding="utf-8"))
        except UnicodeDecodeError:
            cookie = _normalize_cookie_text(path.read_text(encoding="utf-8-sig", errors="ignore"))
        except Exception as exc:
            print(f"root cookie unreadable: {path.name}: {exc}")
            return ""
        if cookie:
            return cookie
        print(f"root cookie file exists but does not look like a Bilibili Cookie header: {path.name}")
    return ""


def _current_cookie() -> str:
    if COOKIE_PATH.exists():
        try:
            payload = json.loads(COOKIE_PATH.read_text(encoding="utf-8"))
            cookie = str(payload.get("cookie", "")).strip()
            if cookie:
                return cookie
        except Exception:
            pass
    if CONFIG_PATH.exists():
        try:
            payload = tomllib.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            cookie = payload.get("bilibili", {}).get("cookie", "")
            return str(cookie).strip()
        except Exception:
            return ""
    return ""


def _has_cookie() -> bool:
    return bool(_current_cookie())


def _sync_root_cookie_if_present() -> None:
    cookie = _read_root_cookie()
    if not cookie:
        return
    if cookie == _current_cookie():
        print("root cookie already synced")
        return

    body = json.dumps(
        {
            "cookie": cookie,
            "source": "root-file",
            "validate_with_bilibili": True,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        COOKIE_API_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
        except Exception:
            payload = {"ok": False, "message": str(exc)}
    except Exception as exc:
        print(f"root cookie sync failed: {exc}")
        return

    if payload.get("ok"):
        username = str(payload.get("username", "") or "")
        user_id = int(payload.get("user_id", 0) or 0)
        suffix = f" for user_id={user_id}" if user_id else ""
        if username:
            suffix += " with username present"
        print(f"root cookie imported{suffix}")
        for path in (COOKIE_PATH, CONFIG_PATH):
            with suppress_os_error():
                path.chmod(0o600)
        return

    code = str(payload.get("error_code", "") or "unknown")
    message = str(payload.get("message", "") or "Cookie rejected")
    print(f"root cookie rejected: {code}: {message}")


class suppress_os_error:
    def __enter__(self) -> None:
        return None

    def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
        return exc_type is not None and issubclass(exc_type, OSError)


def _initialized() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8420/api/profile-summary", timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return bool(payload.get("initialized"))
    except Exception:
        return False


def main() -> int:
    if _initialized():
        print("already initialized")
        return 0
    _sync_root_cookie_if_present()
    if not _has_cookie():
        print("waiting for bilibili cookie")
        return 0

    print("cookie detected; running init")
    result = subprocess.run(
        [str(CLI), "init", "--no-xhs", "--no-douyin", "--no-youtube"],
        cwd=PROJECT_DIR,
        env={
            **dict(os.environ),
            "OPENBILICLAW_PROJECT_ROOT": str(PROJECT_DIR),
            "NO_PROXY": "localhost,127.0.0.1,::1",
            "no_proxy": "localhost,127.0.0.1,::1",
        },
        check=False,
    )
    return int(result.returncode)


if __name__ == "__main__":
    sys.exit(main())
