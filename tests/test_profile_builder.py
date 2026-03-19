from __future__ import annotations

import json

import pytest

from openbiliclaw.llm.base import LLMResponse


class FakeRegistry:
    def __init__(self, content: str) -> None:
        self.content = content
        self.calls: list[list[dict[str, str]]] = []

    async def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> LLMResponse:
        self.calls.append(messages)
        return LLMResponse(content=self.content, provider="openai")


class FakeStructuredService:
    def __init__(self, content: str) -> None:
        self.content = content
        self.calls: list[dict[str, object]] = []

    async def complete_structured_task(
        self,
        *,
        system_instruction: str,
        user_input: str,
        history: list[dict[str, str]] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        self.calls.append(
            {
                "system_instruction": system_instruction,
                "user_input": user_input,
                "history": history,
            }
        )
        return LLMResponse(content=self.content, provider="openai")


@pytest.mark.asyncio
async def test_profile_builder_creates_soul_profile_from_json() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder

    service = FakeStructuredService(
        json.dumps(
            {
                "personality_portrait": "这是一个长期保持好奇心、偏好深度内容、做判断较为克制的人。"
                * 8,
                "core_traits": ["理性", "好奇", "谨慎"],
                "cognitive_style": ["会先看结构", "对证据比较敏感", "偏好把问题讲透"],
                "motivational_drivers": ["建立判断确定性", "持续扩展理解边界"],
                "current_phase": "最近更像在一边吸收高密度信息，一边整理自己的判断框架。",
                "values": ["真实", "成长"],
                "life_stage": "处于探索与积累阶段",
                "deep_needs": ["被理解", "持续成长"],
            },
            ensure_ascii=False,
        )
    )

    profile = await ProfileBuilder(service).build(
        history=[{"title": "AI 视频", "author": "科技UP主"}],
        preference={"interests": [{"name": "科技", "category": "知识"}]},
        awareness_notes=[],
        active_insights=[],
    )

    assert profile.personality_portrait.startswith("这是一个长期保持好奇心")
    assert profile.core_traits == ["理性", "好奇", "谨慎"]
    assert profile.cognitive_style == ["会先看结构", "对证据比较敏感", "偏好把问题讲透"]
    assert profile.motivational_drivers == ["建立判断确定性", "持续扩展理解边界"]
    assert profile.current_phase == "最近更像在一边吸收高密度信息，一边整理自己的判断框架。"
    assert profile.values == ["真实", "成长"]
    assert profile.life_stage == "处于探索与积累阶段"
    assert profile.deep_needs == ["被理解", "持续成长"]
    assert service.calls


@pytest.mark.asyncio
async def test_profile_builder_raises_on_invalid_json() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder, SoulProfileBuildError

    with pytest.raises(SoulProfileBuildError, match="invalid JSON"):
        await ProfileBuilder(FakeStructuredService("not-json")).build(
            history=[{"title": "AI 视频"}],
            preference={},
            awareness_notes=[],
            active_insights=[],
        )


@pytest.mark.asyncio
async def test_profile_builder_raises_on_empty_response() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder, SoulProfileBuildError

    with pytest.raises(SoulProfileBuildError, match="empty soul profile"):
        await ProfileBuilder(FakeStructuredService("")).build(
            history=[{"title": "AI 视频"}],
            preference={},
            awareness_notes=[],
            active_insights=[],
        )


@pytest.mark.asyncio
async def test_profile_builder_raises_when_portrait_is_too_short() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder, SoulProfileBuildError

    service = FakeStructuredService(
        json.dumps(
            {
                "personality_portrait": "过短描述",
                "core_traits": ["理性", "好奇", "谨慎"],
                "cognitive_style": ["会先看结构"],
                "motivational_drivers": ["建立判断确定性"],
                "current_phase": "最近在整理判断。",
                "values": ["真实", "成长"],
                "life_stage": "探索阶段",
                "deep_needs": ["被理解"],
            },
            ensure_ascii=False,
        )
    )

    with pytest.raises(SoulProfileBuildError, match="at least 200"):
        await ProfileBuilder(service).build(
            history=[{"title": "AI 视频"}],
            preference={},
            awareness_notes=[],
            active_insights=[],
        )


@pytest.mark.asyncio
async def test_profile_builder_allows_missing_preference_data() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder

    service = FakeStructuredService(
        json.dumps(
            {
                "personality_portrait": "喜欢长期积累、偏好深度内容、处理信息比较审慎的人。"
                * 8,
                "core_traits": ["理性", "自驱", "克制"],
                "cognitive_style": ["偏好先想清楚再表态", "对信息密度要求较高"],
                "motivational_drivers": ["确认方向", "积累长期能力"],
                "current_phase": "最近更像在稳定积累，不急着追逐表面热度。",
                "values": ["成长", "真实"],
                "life_stage": "稳定积累阶段",
                "deep_needs": ["确认方向", "持续成长"],
            },
            ensure_ascii=False,
        )
    )

    profile = await ProfileBuilder(service).build(
        history=[{"title": "AI 视频"}],
        preference={},
        awareness_notes=[],
        active_insights=[],
    )

    assert profile.core_traits == ["理性", "自驱", "克制"]


@pytest.mark.asyncio
async def test_profile_builder_can_use_unified_service() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder

    service = FakeStructuredService(
        json.dumps(
            {
                "personality_portrait": "这是一个长期保持好奇心、偏好深度内容、做判断较为克制的人。"
                * 8,
                "core_traits": ["理性", "好奇", "谨慎"],
                "cognitive_style": ["会先看结构", "偏好讲透"],
                "motivational_drivers": ["扩大理解边界"],
                "current_phase": "最近更像在主动扩张认知边界。",
                "values": ["真实", "成长"],
                "life_stage": "处于探索与积累阶段",
                "deep_needs": ["被理解", "持续成长"],
            },
            ensure_ascii=False,
        )
    )

    profile = await ProfileBuilder(service).build(
        history=[{"title": "AI 视频"}],
        preference={},
        awareness_notes=[],
        active_insights=[],
    )

    assert profile.core_traits == ["理性", "好奇", "谨慎"]
    assert service.calls


@pytest.mark.asyncio
async def test_profile_builder_injects_old_friend_tone_in_prompt() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder

    service = FakeStructuredService(
        json.dumps(
            {
                "personality_portrait": "这是一个长期保持好奇心、偏好深度内容、做判断较为克制的人。"
                * 8,
                "core_traits": ["理性", "好奇", "谨慎"],
                "cognitive_style": ["会先看结构", "偏好讲透"],
                "motivational_drivers": ["扩大理解边界"],
                "current_phase": "最近更像在主动扩张认知边界。",
                "values": ["真实", "成长"],
                "life_stage": "处于探索与积累阶段",
                "deep_needs": ["被理解", "持续成长"],
            },
            ensure_ascii=False,
        )
    )

    await ProfileBuilder(service).build(
        history=[{"title": "国际新闻", "author": "时事UP"}],
        preference={},
        awareness_notes=[
            {
                "date": "2026-03-20",
                "observation": "最近会在高信息密度内容里停留更久。",
                "trend": "更偏向讲透结构，而不是只看热点结论。",
            }
        ],
        active_insights=[
            {
                "hypothesis": "用户可能在通过深度内容建立判断确定性。",
                "confidence": 0.71,
            }
        ],
    )

    assert "老朋友" in str(service.calls[0]["system_instruction"])
    assert "认知风格" in str(service.calls[0]["system_instruction"])
    assert "不要把兴趣 topic 堆成画像主体" in str(service.calls[0]["system_instruction"])
    assert "<recent_awareness>" in str(service.calls[0]["user_input"])
    assert "建立判断确定性" in str(service.calls[0]["user_input"])
    assert "<active_insights>" in str(service.calls[0]["user_input"])


def test_profile_builder_requires_core_memory_task_service() -> None:
    from openbiliclaw.soul.profile_builder import ProfileBuilder

    with pytest.raises(TypeError, match="complete_structured_task"):
        ProfileBuilder(FakeRegistry("{}"))
