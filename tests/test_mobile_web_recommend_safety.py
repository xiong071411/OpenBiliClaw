"""Static safety tests for mobile web recommendation refresh behavior."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECOMMEND_JS = ROOT / "src/openbiliclaw/web/js/views/recommend.js"


def _function_body(source: str, name: str) -> str:
    match = re.search(rf"(?:async\s+)?function\s+{re.escape(name)}\([^)]*\)\s*\{{", source)
    assert match is not None, f"missing function {name}"
    start = match.end()
    depth = 1
    index = start
    while index < len(source):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start:index]
        index += 1
    raise AssertionError(f"unterminated function {name}")


def test_mobile_web_load_data_does_not_consume_recommendation_pool() -> None:
    """Initial page load must be read-only; reshuffle consumes pool rows."""

    js = RECOMMEND_JS.read_text()
    load_data = _function_body(js, "loadData")
    read_only = _function_body(js, "refreshReadOnlyData")

    assert "fetchRecommendations().catch" in load_data
    assert "reshuffleRecommendations(" not in load_data
    assert "fetchRecommendations().catch" in read_only


def test_mobile_web_pool_update_event_does_not_auto_reshuffle() -> None:
    """A replenishment event should refresh state without recursively reshuffling."""

    js = RECOMMEND_JS.read_text()
    stream_handler = _function_body(js, "onStreamEvent")
    pool_branch = stream_handler.split('type === "refresh.pool_updated"', 1)[1].split(
        '} else if (type === "refresh.started"', 1
    )[0]

    scheduled_refresh = _function_body(js, "runScheduledRecommendationItemsRefresh")
    assert "scheduleRecommendationItemsRefresh()" in pool_branch
    assert (
        "await refreshReadOnlyData({ includeStatus: false, resetAppendState: true })"
        in scheduled_refresh
    )
    assert "loadData()" not in pool_branch
    assert "reshuffleRecommendations(" not in pool_branch


def test_mobile_web_user_reshuffle_is_debounced() -> None:
    """User-triggered reshuffle should have an in-flight guard and short cooldown."""

    js = RECOMMEND_JS.read_text()
    handle = _function_body(js, "handleReshuffle")

    assert "reshuffleInFlight" in js
    assert "RESHUFFLE_COOLDOWN_MS" in js
    assert "if (loading || reshuffleInFlight) return;" in handle
    assert "now - lastReshuffleAt < RESHUFFLE_COOLDOWN_MS" in handle
