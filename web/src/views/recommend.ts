import { button, chip, emptyState, h } from "../helpers/dom";
import { formatRelativeTime, sourceLabel } from "../helpers/format";
import { buildContentUrl } from "../helpers/recommendation";
import type { Recommendation } from "../types";
import type { ViewContext } from "./context";

export function renderRecommendView(ctx: ViewContext): HTMLElement {
  const state = ctx.store.getState();
  const root = h("section", { className: "view recommend-view" });
  root.append(
    h(
      "div",
      { className: "view-head" },
      h("div", {}, h("h2", {}, "推荐流"), h("p", {}, recommendSubtitle(state.recommendations))),
      h(
        "div",
        { className: "view-actions" },
        button("换一批", {
          className: "btn btn-primary",
          disabled: state.actionBusy.reshuffle,
          onClick: () => void ctx.reshuffle(),
        }, "shuffle"),
        button("补货", {
          className: "btn btn-ghost",
          disabled: state.actionBusy.refreshPool,
          onClick: () => void ctx.manualRefreshPool(),
        }, "refresh"),
      ),
    ),
  );

  if (state.errors.recommendations) {
    root.append(
      h(
        "div",
        { className: "notice notice-error" },
        state.errors.recommendations,
        button("重试", {
          className: "btn btn-small",
          onClick: () => void ctx.refreshRecommendations(),
        }),
      ),
    );
  }

  if (state.actionBusy.recommendations && state.recommendations.length === 0) {
    root.append(renderSkeletonList());
    return root;
  }

  if (state.recommendations.length === 0) {
    const initialized = state.runtimeStatus?.initialized ?? false;
    root.append(
      emptyState(
        initialized ? "这会儿还没新推荐" : "还没完成初始化",
        initialized
          ? "可以先点补货，让后台继续找，也可以等定时任务自动更新。"
          : "服务器会从 /root/b站cookie.txt 导入 Cookie 并完成初始化；Web v1 不在页面里粘贴 Cookie。",
      ),
    );
    return root;
  }

  const list = h("div", { className: "recommendation-list" });
  for (const item of state.recommendations) {
    list.append(renderRecommendationCard(ctx, item, state.feedbackStatus[item.id] || ""));
  }
  root.append(list);
  root.append(
    h(
      "div",
      { className: "load-more-bar" },
      button("继续加载", {
        className: "btn btn-secondary",
        disabled: state.actionBusy.appendRecommendations,
        onClick: () => void ctx.appendRecommendations(),
      }, "more"),
    ),
  );
  return root;
}

function recommendSubtitle(items: Recommendation[]): string {
  if (items.length > 0) return `当前 ${items.length} 条，点开会作为强信号记入画像。`;
  return "查看推荐、打开视频、喜欢、不喜欢、写反馈、换一批。";
}

function renderRecommendationCard(
  ctx: ViewContext,
  item: Recommendation,
  feedbackState: string,
): HTMLElement {
  const cover = item.cover_url
    ? h("img", {
        src: item.cover_url,
        alt: "",
        loading: "lazy",
        referrerpolicy: "no-referrer",
        onError: (event: Event) => replaceBrokenCover(event.currentTarget),
      })
    : h("div", { className: "cover-placeholder" }, "B");
  const url = buildContentUrl(item);
  const noteId = `note-${item.id}`;
  const form = h(
    "form",
    {
      className: "comment-form",
      onSubmit: (event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        const note = String(data.get("note") || "").trim();
        void ctx.submitRecommendationFeedback(item, "comment", note);
      },
    },
    h("label", { for: noteId }, "写一句你的想法"),
    h("textarea", {
      id: noteId,
      name: "note",
      rows: "3",
      placeholder: "例如：这类多来点 / 标题党别来了 / 我喜欢这个角度",
    }),
    h(
      "div",
      { className: "form-row" },
      button("发出去", { className: "btn btn-small btn-primary", type: "submit" }, "send"),
    ),
  );

  return h(
    "article",
    { className: "recommendation-card" },
    h("a", {
      className: "cover-frame",
      href: url || "#",
      target: "_blank",
      rel: "noopener noreferrer",
      onClick: () => ctx.openRecommendation(item),
    }, cover),
    h(
      "div",
      { className: "card-body" },
      h(
        "div",
        { className: "card-meta" },
        chip(sourceLabel(item.source_platform), "source"),
        item.topic_label ? chip(item.topic_label) : null,
      ),
      h("h3", {}, item.title),
      h("p", { className: "up-line" }, item.up_name),
      item.expression ? h("p", { className: "friend-copy" }, item.expression) : null,
      h(
        "div",
        { className: "card-actions" },
        h("a", {
          className: "btn btn-primary",
          href: url || "#",
          target: "_blank",
          rel: "noopener noreferrer",
          onClick: () => ctx.openRecommendation(item),
        }, "打开视频"),
        button("喜欢", {
          className: "btn btn-soft",
          disabled: feedbackState === "submitting",
          onClick: () => void ctx.submitRecommendationFeedback(item, "like"),
        }, "like"),
        button("不喜欢", {
          className: "btn btn-soft",
          disabled: feedbackState === "submitting",
          onClick: () => void ctx.submitRecommendationFeedback(item, "dislike"),
        }, "dislike"),
      ),
      h("details", { className: "feedback-details" }, h("summary", {}, "写反馈"), form),
      feedbackState
        ? h(
            "p",
            { className: `inline-status ${feedbackState === "error" ? "is-error" : ""}` },
            feedbackState === "success"
              ? "已记住，会影响后面的推荐。"
              : feedbackState === "submitting"
                ? "正在记下..."
                : "这条反馈没记上，可以再试一次。",
          )
        : null,
    ),
  );
}

function replaceBrokenCover(target: EventTarget | null): void {
  if (!(target instanceof HTMLImageElement)) return;
  const parent = target.parentElement;
  target.remove();
  parent?.append(h("div", { className: "cover-placeholder" }, "B"));
}

function renderSkeletonList(): HTMLElement {
  return h(
    "div",
    { className: "skeleton-list" },
    ...Array.from({ length: 4 }, (_, index) =>
      h(
        "div",
        { className: "skeleton-card", "data-index": String(index) },
        h("i", {}),
        h("span", {}),
        h("span", {}),
      ),
    ),
  );
}

export function renderRuntimeStrip(ctx: ViewContext): HTMLElement {
  const state = ctx.store.getState();
  const status = state.runtimeStatus;
  const topics = status?.recent_pool_topics?.slice(0, 3).join(" / ");
  return h(
    "div",
    { className: "runtime-strip" },
    h(
      "div",
      {},
      h("span", { className: `status-dot ${state.online ? "online" : "offline"}` }),
      h("strong", {}, state.online ? "后端在线" : "后端离线"),
      h("small", {}, state.streamOnline ? "实时流已连接" : "实时流重连中"),
    ),
    h(
      "div",
      {},
      h("span", {}, status?.initialized ? "已初始化" : "未初始化"),
      h("span", {}, `候选 ${status?.pool_available_count ?? 0}/${status?.pool_target_count ?? 0}`),
      h("span", {}, `推荐 ${status?.recommendation_count ?? 0}`),
    ),
    h(
      "p",
      {},
      status?.manual_refresh_state === "running"
        ? status.manual_refresh_message || "后台正在补货。"
        : topics || lastRefreshLine(status?.last_refresh_at || ""),
    ),
  );
}

function lastRefreshLine(value: string): string {
  const formatted = formatRelativeTime(value);
  return formatted ? `上次刷新 ${formatted}` : "等待后台状态更新。";
}
