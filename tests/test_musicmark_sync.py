"""Tests for MusicMark listening summary sync."""

from __future__ import annotations

import pytest

from openbiliclaw.sources.musicmark_sync import MusicMarkSyncService


class _FakePipeline:
    def __init__(self) -> None:
        self.batches: list[list[object]] = []

    async def ingest_batch(self, signals: list[object]) -> object:
        self.batches.append(signals)
        return object()


class _FakeMemory:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    async def propagate_event(self, event: dict[str, object]) -> None:
        self.events.append(event)


def _service(tmp_path, *, ingest_into_pipeline: bool = True) -> MusicMarkSyncService:
    return MusicMarkSyncService(
        base_url="https://mark.example.test",
        username="admin",
        api_password="secret",
        pipeline=_FakePipeline(),
        memory=_FakeMemory(),
        data_dir=tmp_path,
        sync_interval_hours=12,
        min_artist_play_count=5,
        max_artists=2,
        max_songs=0,
        ingest_into_pipeline=ingest_into_pipeline,
    )


def test_stats_to_events_uses_compressed_artist_signals(tmp_path) -> None:
    service = _service(tmp_path)

    events = service._stats_to_events(
        {
            "total_count": 100,
            "total_duration_sec": 7200,
            "unique_artists": 3,
            "unique_titles": 10,
            "top_artists": [
                {"name": "Artist A", "count": 20, "duration": 3600},
                {"name": "Artist B", "count": 4, "duration": 600},
                {"name": "Artist C", "count": 30, "duration": 5400},
            ],
            "recent_top_30d": [{"artist": "Artist D"}],
        }
    )

    assert [event["title"] for event in events] == [
        "音乐平台听歌概览",
        "Artist A",
        "近期音乐趋势",
    ]
    assert "累计1.0小时" in str(events[1]["context"])
    assert events[1]["metadata"]["source_platform"] == "musicmark"
    assert events[1]["metadata"]["play_count"] == 20


@pytest.mark.asyncio
async def test_ingest_events_awaits_pipeline_when_enabled(tmp_path) -> None:
    pipeline = _FakePipeline()
    memory = _FakeMemory()
    service = MusicMarkSyncService(
        base_url="https://mark.example.test",
        username="admin",
        api_password="secret",
        pipeline=pipeline,
        memory=memory,
        data_dir=tmp_path,
    )
    events = service._stats_to_events(
        {
            "total_count": 1,
            "total_duration_sec": 180,
            "unique_artists": 1,
            "unique_titles": 1,
            "top_artists": [],
            "recent_top_30d": [],
        }
    )

    await service._ingest_events(events)

    assert len(memory.events) == 1
    assert len(pipeline.batches) == 1
    assert len(pipeline.batches[0]) == 1


@pytest.mark.asyncio
async def test_ingest_events_can_skip_pipeline_to_save_llm_cost(tmp_path) -> None:
    pipeline = _FakePipeline()
    memory = _FakeMemory()
    service = MusicMarkSyncService(
        base_url="https://mark.example.test",
        username="admin",
        api_password="secret",
        pipeline=pipeline,
        memory=memory,
        data_dir=tmp_path,
        ingest_into_pipeline=False,
    )
    events = service._stats_to_events(
        {
            "total_count": 1,
            "total_duration_sec": 180,
            "unique_artists": 1,
            "unique_titles": 1,
            "top_artists": [],
            "recent_top_30d": [],
        }
    )

    await service._ingest_events(events)

    assert len(memory.events) == 1
    assert pipeline.batches == []


@pytest.mark.asyncio
async def test_sync_if_due_skips_unchanged_digest(tmp_path, monkeypatch) -> None:
    service = _service(tmp_path)
    calls = 0

    async def _fake_fetch() -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {
            "total_count": 1,
            "total_duration_sec": 180,
            "unique_artists": 1,
            "unique_titles": 1,
            "top_artists": [],
            "recent_top_30d": [],
        }

    monkeypatch.setattr(service, "_fetch_stats", _fake_fetch)

    assert await service.sync_if_due() is True
    service._save_state({**service._load_state(), "last_sync_at": ""})
    assert await service.sync_if_due() is True

    status = service.get_runtime_status()
    assert calls == 2
    assert status["last_musicmark_sync_skip_reason"] == "unchanged"
    assert status["last_musicmark_sync_event_count"] == 0
