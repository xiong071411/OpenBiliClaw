"""MusicMark listening-stats sync service.

Periodically fetches aggregated listening statistics from a self-hosted
MusicMark instance and feeds them into the Soul Engine as preference
signals.  MusicMark is NOT a content discovery source — it produces
behavioral events that influence the preference layer, not content
candidates for the recommendation pool.

The sync is throttled by ``sync_interval_hours`` (default 12) and
piggybacks on the existing 60-second soul pipeline loop in
``ContinuousRefreshController``.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta
from hashlib import sha256
from pathlib import Path
from typing import Any, cast

import httpx

from openbiliclaw.soul.pipeline import ProfileUpdatePipeline, signals_from_events
from openbiliclaw.sources.event_format import SOURCE_MUSICMARK, build_event

logger = logging.getLogger(__name__)

_SYNC_STATE_FILENAME = "musicmark_sync_state.json"
_PIPELINE_INGEST_TIMEOUT_SECONDS = 60


class MusicMarkSyncService:
    """Fetch MusicMark stats and inject them as soul-pipeline signals."""

    def __init__(
        self,
        *,
        base_url: str,
        username: str,
        api_password: str,
        pipeline: ProfileUpdatePipeline,
        memory: Any,
        sync_interval_hours: int = 12,
        min_artist_play_count: int = 5,
        max_artists: int = 8,
        max_songs: int = 0,
        ingest_into_pipeline: bool = True,
        data_dir: Path | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._username = username.strip()
        self._api_password = api_password
        self._pipeline = pipeline
        self._memory = memory
        self._sync_interval_hours = max(1, int(sync_interval_hours))
        self._min_artist_play_count = max(1, int(min_artist_play_count))
        self._max_artists = max(0, int(max_artists))
        self._max_songs = max(0, int(max_songs))
        self._ingest_into_pipeline = bool(ingest_into_pipeline)
        self._state_path = (
            data_dir / "memory" / _SYNC_STATE_FILENAME
            if data_dir is not None
            else Path("data") / "memory" / _SYNC_STATE_FILENAME
        )

    async def sync_if_due(self) -> bool:
        """Run a sync cycle if enough time has elapsed since the last one.

        Returns ``True`` if a sync actually happened, ``False`` if skipped.
        """
        if not self._is_due():
            return False

        state = self._load_state()
        now = datetime.now().isoformat()
        state["last_attempt_at"] = now

        try:
            stats = await self._fetch_stats()
        except Exception as exc:
            logger.exception("[musicmark-sync] Failed to fetch stats from MusicMark")
            state.update(
                {
                    "last_sync_at": now,
                    "last_error": str(exc)[:500],
                    "last_skip_reason": "fetch_failed",
                    "last_event_count": 0,
                }
            )
            self._save_state(state)
            return False

        digest = self._stats_digest(stats)
        if digest and digest == state.get("last_digest"):
            state.update(
                {
                    "last_sync_at": now,
                    "last_error": "",
                    "last_skip_reason": "unchanged",
                    "last_event_count": 0,
                    "last_total_count": int(stats.get("total_count", 0) or 0),
                }
            )
            self._save_state(state)
            logger.info("[musicmark-sync] Summary unchanged; skipped ingestion")
            return True

        try:
            events = self._stats_to_events(stats)
        except Exception as exc:
            logger.exception("[musicmark-sync] Failed to convert stats to events")
            state.update(
                {
                    "last_sync_at": now,
                    "last_error": str(exc)[:500],
                    "last_skip_reason": "convert_failed",
                    "last_event_count": 0,
                }
            )
            self._save_state(state)
            return False

        if not events:
            logger.info("[musicmark-sync] No events generated from stats")
            state.update(
                {
                    "last_sync_at": now,
                    "last_success_at": now,
                    "last_error": "",
                    "last_skip_reason": "no_events",
                    "last_event_count": 0,
                    "last_digest": digest,
                    "last_total_count": int(stats.get("total_count", 0) or 0),
                }
            )
            self._save_state(state)
            return True

        try:
            await self._persist_events(events)
        except Exception as exc:
            logger.exception("[musicmark-sync] Failed to ingest events")
            state.update(
                {
                    "last_sync_at": now,
                    "last_error": str(exc)[:500],
                    "last_skip_reason": "ingest_failed",
                    "last_event_count": 0,
                }
            )
            self._save_state(state)
            return False

        state.update(
            {
                "last_sync_at": now,
                "last_success_at": now,
                "last_error": "",
                "last_skip_reason": "pipeline_pending" if self._ingest_into_pipeline else "",
                "last_event_count": len(events),
                "last_digest": digest,
                "last_total_count": int(stats.get("total_count", 0) or 0),
                "last_summary": self._summary_for_status(stats),
            }
        )
        self._save_state(state)

        if self._ingest_into_pipeline:
            try:
                await asyncio.wait_for(
                    self._ingest_pipeline(events),
                    timeout=_PIPELINE_INGEST_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                logger.exception("[musicmark-sync] Profile pipeline ingestion timed out")
                state.update(
                    {
                        "last_error": "profile pipeline ingestion timed out",
                        "last_skip_reason": "pipeline_timeout",
                    }
                )
                self._save_state(state)
            except Exception as exc:
                logger.exception("[musicmark-sync] Failed to ingest events into profile pipeline")
                state.update(
                    {
                        "last_error": str(exc)[:500],
                        "last_skip_reason": "pipeline_failed",
                    }
                )
                self._save_state(state)
            else:
                state.update({"last_error": "", "last_skip_reason": ""})
                self._save_state(state)

        logger.info(
            "[musicmark-sync] Synced %d compressed events from MusicMark (user=%s)",
            len(events),
            self._username,
        )
        return True

    def get_runtime_status(self) -> dict[str, object]:
        """Return a compact user-visible sync status."""
        state = self._load_state()
        return {
            "musicmark_sync_enabled": True,
            "last_musicmark_sync_at": str(state.get("last_success_at", "")),
            "last_musicmark_sync_attempt_at": str(state.get("last_attempt_at", "")),
            "last_musicmark_sync_error": str(state.get("last_error", "")),
            "last_musicmark_sync_skip_reason": str(state.get("last_skip_reason", "")),
            "last_musicmark_sync_event_count": int(state.get("last_event_count", 0) or 0),
            "last_musicmark_sync_total_count": int(state.get("last_total_count", 0) or 0),
            "last_musicmark_sync_summary": str(state.get("last_summary", "")),
            "musicmark_sync_interval_hours": self._sync_interval_hours,
        }

    # ── internal helpers ─────────────────────────────────────────────

    def _is_due(self) -> bool:
        state = self._load_state()
        last_sync_str = state.get("last_sync_at")
        if not last_sync_str:
            return True
        try:
            last_sync = datetime.fromisoformat(last_sync_str)
        except (ValueError, TypeError):
            return True
        return datetime.now() - last_sync >= timedelta(hours=self._sync_interval_hours)

    def _load_state(self) -> dict[str, Any]:
        try:
            raw = json.loads(self._state_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {}
        if isinstance(raw, dict):
            return cast("dict[str, Any]", raw)
        return {}

    def _save_state(self, state: dict[str, Any] | None = None) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        self._state_path.write_text(
            json.dumps(
                state or {"last_sync_at": datetime.now().isoformat()},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    async def _fetch_stats(self) -> dict[str, Any]:
        if not self._username or not self._api_password:
            raise RuntimeError("MusicMark username/api_password is not configured")
        url = f"{self._base_url}/api/stats/summary"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                url,
                params={"range": "all"},
                auth=httpx.BasicAuth(self._username, self._api_password),
            )
            resp.raise_for_status()
            data: object = resp.json()
        if not isinstance(data, dict) or not data.get("ok"):
            raise RuntimeError(f"MusicMark API returned ok=false: {data}")
        stats = data.get("stats")
        if not isinstance(stats, dict):
            raise RuntimeError(f"MusicMark API returned invalid stats payload: {data}")
        return cast("dict[str, Any]", stats)

    def _stats_to_events(self, stats: dict[str, Any]) -> list[dict[str, Any]]:
        """Convert MusicMark stats summary into unified behavioral events."""
        events: list[dict[str, Any]] = []

        total_count = int(stats.get("total_count", 0))
        total_duration_sec = int(stats.get("total_duration_sec", 0))
        total_hours = round(total_duration_sec / 3600, 1)
        unique_artists = int(stats.get("unique_artists", 0))
        unique_titles = int(stats.get("unique_titles", 0))

        raw_top_artists = stats.get("top_artists", [])
        top_artists = (
            [artist for artist in raw_top_artists if isinstance(artist, dict)]
            if isinstance(raw_top_artists, list)
            else []
        )
        top_artist_strs = [f"{a['name']}({a['count']}次)" for a in top_artists[:5] if a.get("name")]

        # 1. Summary event — broad taste overview
        summary_context = (
            f"音乐平台听歌概览: 共{unique_titles}首歌,{unique_artists}位艺术家,"
            f"总计{total_hours}小时"
        )
        if top_artist_strs:
            summary_context += f"; 最常听:{','.join(top_artist_strs)}"
        events.append(
            build_event(
                event_type="view",
                source_platform=SOURCE_MUSICMARK,
                title="音乐平台听歌概览",
                context=summary_context,
                metadata={
                    "total_count": total_count,
                    "total_duration_sec": total_duration_sec,
                    "unique_artists": unique_artists,
                    "unique_titles": unique_titles,
                },
            )
        )

        # 2. Top artist events — strong preference signals
        for artist in top_artists[: self._max_artists]:
            count = int(artist.get("count", 0))
            if count < self._min_artist_play_count:
                continue
            name = artist.get("name", "").strip()
            if not name:
                continue
            duration_sec = int(artist.get("duration", 0))
            hours = round(duration_sec / 3600, 1)
            events.append(
                build_event(
                    event_type="favorite",
                    source_platform=SOURCE_MUSICMARK,
                    title=name,
                    author=name,
                    context=f"在音乐平台反复听{name}的歌({count}次,累计{hours}小时)",
                    metadata={"play_count": count, "duration_sec": duration_sec},
                )
            )

        # 3. Recent trend event — taste shift signal
        raw_recent_songs = stats.get("recent_top_30d", [])
        recent_songs = (
            [song for song in raw_recent_songs if isinstance(song, dict)]
            if isinstance(raw_recent_songs, list)
            else []
        )
        if recent_songs:
            all_time_artists = {a["name"] for a in top_artists[:10]}
            recent_artists = {
                s.get("artist", "").strip() for s in recent_songs[:10] if s.get("artist")
            }
            new_artists = recent_artists - all_time_artists
            if new_artists:
                events.append(
                    build_event(
                        event_type="view",
                        source_platform=SOURCE_MUSICMARK,
                        title="近期音乐趋势",
                        context=(
                            "近期音乐口味变化: 最近30天新增关注艺术家:"
                            + ",".join(sorted(new_artists))
                        ),
                    )
                )

        return events

    async def _ingest_events(self, events: list[dict[str, Any]]) -> None:
        await self._persist_events(events)
        await self._ingest_pipeline(events)

    async def _persist_events(self, events: list[dict[str, Any]]) -> None:
        for event in events:
            await self._memory.propagate_event(event)

    async def _ingest_pipeline(self, events: list[dict[str, Any]]) -> None:
        if not self._ingest_into_pipeline:
            return

        # Convert to pipeline signals and let the normal thresholds decide
        # when a paid LLM-backed layer update is warranted.
        signals = signals_from_events(events)
        if signals:
            await self._pipeline.ingest_batch(signals)

    def _stats_digest(self, stats: dict[str, Any]) -> str:
        relevant = {
            "total_count": stats.get("total_count", 0),
            "total_duration_sec": stats.get("total_duration_sec", 0),
            "unique_artists": stats.get("unique_artists", 0),
            "unique_titles": stats.get("unique_titles", 0),
            "top_artists": stats.get("top_artists", [])[: self._max_artists],
            "top_songs": stats.get("top_songs", [])[: self._max_songs],
            "recent_top_30d": stats.get("recent_top_30d", [])[:10],
        }
        payload = json.dumps(relevant, ensure_ascii=False, sort_keys=True, default=str)
        return sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _summary_for_status(stats: dict[str, Any]) -> str:
        total_count = int(stats.get("total_count", 0) or 0)
        unique_artists = int(stats.get("unique_artists", 0) or 0)
        top_artists = [
            str(item.get("name", "")).strip()
            for item in stats.get("top_artists", [])[:3]
            if isinstance(item, dict) and str(item.get("name", "")).strip()
        ]
        if top_artists:
            return f"{total_count} 次播放，{unique_artists} 位艺术家，常听 {', '.join(top_artists)}"
        return f"{total_count} 次播放，{unique_artists} 位艺术家"
