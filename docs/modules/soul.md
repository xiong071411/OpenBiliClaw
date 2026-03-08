# 灵魂引擎

> 用户深度理解核心 — 从行为数据到人格画像的推理引擎。

## 概述

`soul/` 包实现了用户理解的核心逻辑，包括：

- **SoulEngine** — 编排器，从事件出发驱动各层分析
- **PreferenceAnalyzer** — LLM 驱动的偏好提取和合并
- **SocraticDialogue** — 苏格拉底式用户对话，通过追问深化理解
- **SoulProfile** — 用户灵魂画像数据结构

## 已实现功能

| 任务 | 状态 | 说明 |
|------|------|------|
| SoulEngine.analyze_events() | ✅ | 事件 → PreferenceAnalyzer → 偏好层更新 |
| PreferenceAnalyzer | ✅ | LLM structured extraction + 合并 + 衰减 |
| SocraticDialogue.respond() | ✅ | 通过 LLMService 调用 LLM，自动注入画像 |
| ProfileBuilder | ✅ | 结构化 prompt + JSON 校验 + `SoulProfile` 构建 |
| SoulEngine.build_initial_profile() | ✅ | 从 history + preference 生成并持久化 `soul.json` |
| SoulEngine.get_profile() | ✅ | 从 soul 层读取画像，未初始化时抛明确异常 |

## 公开 API

### SoulEngine

```python
from openbiliclaw.soul.engine import SoulEngine

engine = SoulEngine(llm=registry, memory=memory_manager)

# 分析事件批次 → 更新偏好层
await engine.analyze_events([
    {"event_type": "view", "title": "世界史解说"},
    {"event_type": "search", "title": "纪录片推荐"},
])
# 执行后 memory_manager.get_layer("preference").data 已更新并持久化
```

### SocraticDialogue

```python
from openbiliclaw.soul.dialogue import SocraticDialogue

dialogue = SocraticDialogue(llm=None, soul_engine=engine, llm_service=service)

reply = await dialogue.respond("我最近很喜欢看讲得很透的纪录片")
# reply: "我猜你喜欢的是那种能慢慢展开逻辑的讲述方式..."

print(dialogue.history)  # [DialogueTurn(role="user", ...), DialogueTurn(role="agent", ...)]
dialogue.clear_history()
```

### PreferenceAnalyzer

```python
from openbiliclaw.soul.preference_analyzer import PreferenceAnalyzer

analyzer = PreferenceAnalyzer(registry=llm_registry)
updated_pref = await analyzer.analyze_events(
    events=[...],
    existing_preference=current_pref,
)
# 返回:
# {
#   "interests": [{"name": "历史", "category": "知识", "weight": 0.82, ...}],
#   "style": {"preferred_duration": "long", "depth_preference": 0.91},
#   "exploration_openness": 0.66,
#   "favorite_up_users": ["小约翰可汗"],
#   "disliked_topics": ["低质标题党"],
# }
```

### ProfileBuilder / SoulProfile

```python
from openbiliclaw.soul.profile_builder import ProfileBuilder

builder = ProfileBuilder(registry=llm_registry)
profile = await builder.build(
    history=[
        {"title": "AI 工具实测", "author": "科技UP主"},
        {"title": "效率系统分享", "author": "知识UP主"},
    ],
    preference=current_pref,
)

assert len(profile.personality_portrait) >= 200
assert 3 <= len(profile.core_traits) <= 5
```

```python
profile = await engine.build_initial_profile(history=[...])
loaded = await engine.get_profile()
assert loaded.core_traits == profile.core_traits
```

## 设计决策

1. **偏好提取用 json_mode**：确保 LLM 返回结构化 JSON，便于程序处理
2. **对话错误优雅降级**：LLM 调用失败时返回友好中文提示，不崩溃
3. **`_build_service()` 回退**：未注入 LLMService 时从 SoulEngine 自动构建
4. **历史格式转换**：`agent` → `assistant` 角色映射，适配 OpenAI 消息格式
5. **画像生成独立为 `ProfileBuilder`**：避免把 prompt/JSON 校验逻辑塞进 `SoulEngine`
6. **灵魂层失败不覆盖旧画像**：坏 JSON、空响应、缺字段时直接报错，已有 `soul.json` 保留
