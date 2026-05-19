import { button, chip, emptyState, h, meter } from "../helpers/dom";
import { formatRelativeTime, percent } from "../helpers/format";
import type { InterestDomain, ProfileSummary } from "../types";
import type { ViewContext } from "./context";

export function renderProfileView(ctx: ViewContext): HTMLElement {
  const state = ctx.store.getState();
  const root = h("section", { className: "view profile-view" });
  root.append(
    h(
      "div",
      { className: "view-head" },
      h("div", {}, h("h2", {}, "用户画像"), h("p", {}, "把后端已经理解到的东西完整摊开看。")),
      button("刷新", {
        className: "btn btn-ghost",
        disabled: state.actionBusy.profile,
        onClick: () => void ctx.loadProfile({ force: true }),
      }, "refresh"),
    ),
  );

  if (state.actionBusy.profile && !state.profile) {
    root.append(emptyState("正在读取画像", "阿B 正在从后端拿最新的画像摘要。"));
    return root;
  }

  if (state.errors.profile) {
    root.append(h("div", { className: "notice notice-error" }, state.errors.profile));
  }

  const profile = state.profile;
  if (!profile || !profile.initialized) {
    root.append(
      emptyState(
        "画像还没初始化",
        "服务器会从 /root/b站cookie.txt 导入 Cookie 并初始化画像。Web v1 不提供 Cookie 粘贴入口，避免在公开页面暴露登录信息。",
      ),
    );
    return root;
  }

  root.append(renderPortrait(profile));
  root.append(renderListSection("核心特质", profile.core_traits));
  root.append(renderListSection("深层需求", profile.deep_needs));
  root.append(renderMbti(profile));
  root.append(renderListSection("价值观", profile.values));
  root.append(renderListSection("动机", profile.motivational_drivers));
  root.append(renderInterestSection("喜欢", profile.likes));
  root.append(renderInterestSection("避雷", profile.dislikes));
  root.append(renderListSection("常看 UP", profile.favorite_up_users));
  root.append(renderRoleSection(profile));
  root.append(renderListSection("认知风格", profile.cognitive_style));
  root.append(renderStyleSection(profile));
  root.append(renderContextSection(profile));
  root.append(renderSpeculativeSection(profile));
  root.append(renderCognitionUpdates(ctx, profile));
  root.append(renderInsights(profile));
  root.append(renderAwareness(profile));
  return root;
}

function renderPortrait(profile: ProfileSummary): HTMLElement {
  return h(
    "article",
    { className: "panel panel-accent" },
    h("div", { className: "panel-title" }, h("h3", {}, "画像总述")),
    h("p", { className: "portrait-text" }, profile.personality_portrait),
  );
}

function renderListSection(title: string, items: string[]): HTMLElement {
  if (items.length === 0) return renderQuietPanel(title, "暂时还没有稳定结论。");
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, title)),
    h("div", { className: "chip-cloud" }, ...items.map((item) => chip(item))),
  );
}

function renderMbti(profile: ProfileSummary): HTMLElement {
  const mbti = profile.mbti;
  if (!mbti.type) return renderQuietPanel("MBTI", "还没有足够信号形成稳定判断。");
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, "MBTI"), chip(percent(mbti.confidence), "score")),
    h("div", { className: "big-kpi" }, mbti.type),
    h(
      "div",
      { className: "meter-list" },
      ...Object.entries(mbti.dimensions).map(([key, value]) =>
        meter(`${key.toUpperCase()} · ${value.pole || "未定"}`, value.strength),
      ),
    ),
  );
}

function renderInterestSection(title: string, domains: InterestDomain[]): HTMLElement {
  if (domains.length === 0) return renderQuietPanel(title, "还没有明显条目。");
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, title)),
    ...domains.map((domain) =>
      h(
        "div",
        { className: "domain-row" },
        h("div", {}, h("strong", {}, domain.domain), h("span", {}, percent(domain.weight))),
        domain.specifics.length
          ? h("div", { className: "chip-cloud" }, ...domain.specifics.slice(0, 8).map((item) => chip(item.name)))
          : null,
      ),
    ),
  );
}

function renderRoleSection(profile: ProfileSummary): HTMLElement {
  return h(
    "article",
    { className: "panel split-panel" },
    h("div", {}, h("span", {}, "人生阶段"), h("strong", {}, profile.life_stage || "未判断")),
    h("div", {}, h("span", {}, "当前阶段"), h("strong", {}, profile.current_phase || "未判断")),
  );
}

function renderStyleSection(profile: ProfileSummary): HTMLElement {
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, "内容风格偏好")),
    profile.style.preferred_duration ? h("p", {}, `时长偏好：${profile.style.preferred_duration}`) : null,
    profile.style.preferred_pace ? h("p", {}, `节奏偏好：${profile.style.preferred_pace}`) : null,
    meter("质量敏感", profile.style.quality_sensitivity),
    meter("幽默偏好", profile.style.humor_preference),
    meter("深度偏好", profile.style.depth_preference),
    meter("探索开放度", profile.exploration_openness),
  );
}

function renderContextSection(profile: ProfileSummary): HTMLElement {
  const rows = [
    ["工作日", profile.context.weekday_patterns],
    ["周末", profile.context.weekend_patterns],
    ["时间规律", profile.context.time_of_day_patterns],
    ["会话类型", profile.context.session_type],
  ].filter(([, value]) => value);
  if (rows.length === 0) return renderQuietPanel("场景规律", "还没有明显规律。");
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, "场景规律")),
    ...rows.map(([label, value]) =>
      h("p", { className: "key-value" }, h("strong", {}, label), h("span", {}, value)),
    ),
  );
}

function renderSpeculativeSection(profile: ProfileSummary): HTMLElement {
  if (profile.speculative_interests.length === 0) {
    return renderQuietPanel("猜测兴趣", "还没有待确认的兴趣探针。");
  }
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, "猜测兴趣")),
    ...profile.speculative_interests.map((item) =>
      h(
        "div",
        { className: "message-card compact" },
        h("strong", {}, item.domain),
        h("p", {}, item.reason),
        h(
          "div",
          { className: "chip-cloud" },
          chip(percent(item.confidence), "score"),
          chip(`${item.confirmation_count}/${item.confirmation_threshold}`),
          ...item.specifics.map((specific) => chip(specific.name)),
        ),
      ),
    ),
  );
}

function renderCognitionUpdates(ctx: ViewContext, profile: ProfileSummary): HTMLElement {
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, "近期认知更新")),
    profile.recent_cognition_updates.length === 0
      ? h("p", { className: "muted" }, "还没有新的认知更新。")
      : null,
    ...profile.recent_cognition_updates.map((item) =>
      h(
        "details",
        { className: "cognition-card" },
        h(
          "summary",
          {},
          h("strong", {}, item.summary),
          h("span", {}, formatRelativeTime(item.created_at) || item.context_line || "最近"),
        ),
        item.context_line ? h("p", {}, item.context_line) : null,
        item.impact ? h("p", {}, `影响：${item.impact}`) : null,
        item.reasoning ? h("p", {}, `推理：${item.reasoning}`) : null,
        item.evidence ? h("p", {}, `证据：${item.evidence}`) : null,
      ),
    ),
    profile.has_more_cognition_updates
      ? h(
          "div",
          { className: "load-more-bar" },
          button("加载更早变化", {
            className: "btn btn-secondary",
            disabled: ctx.store.getState().actionBusy.cognition,
            onClick: () => void ctx.loadMoreCognition(),
          }),
        )
      : null,
  );
}

function renderInsights(profile: ProfileSummary): HTMLElement {
  if (profile.active_insights.length === 0) return renderQuietPanel("活跃洞察", "暂时没有活跃洞察。");
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, "活跃洞察")),
    ...profile.active_insights.map((item) =>
      h(
        "div",
        { className: "message-card compact" },
        h("strong", {}, item.hypothesis),
        h("div", { className: "chip-cloud" }, chip(percent(item.confidence), "score"), item.validated ? chip("已验证", "success") : chip("观察中")),
        item.evidence.length ? h("p", {}, item.evidence.join("；")) : null,
      ),
    ),
  );
}

function renderAwareness(profile: ProfileSummary): HTMLElement {
  if (profile.recent_awareness.length === 0) return renderQuietPanel("近期觉察", "暂时没有近期觉察。");
  return h(
    "article",
    { className: "panel" },
    h("div", { className: "panel-title" }, h("h3", {}, "近期觉察")),
    ...profile.recent_awareness.map((item) =>
      h(
        "div",
        { className: "message-card compact" },
        h("strong", {}, item.date || "最近"),
        h("p", {}, item.observation),
        item.trend ? h("p", { className: "muted" }, `趋势：${item.trend}`) : null,
        item.emotion_guess ? h("p", { className: "muted" }, `情绪猜测：${item.emotion_guess}`) : null,
      ),
    ),
  );
}

function renderQuietPanel(title: string, body: string): HTMLElement {
  return h(
    "article",
    { className: "panel quiet-panel" },
    h("div", { className: "panel-title" }, h("h3", {}, title)),
    h("p", {}, body),
  );
}
