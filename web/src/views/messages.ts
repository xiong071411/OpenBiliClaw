import { button, chip, emptyState, h } from "../helpers/dom";
import { percent, sourceLabel } from "../helpers/format";
import type { DelightCandidate, InterestProbeMessage } from "../types";
import type { ViewContext } from "./context";

export function renderMessagesView(ctx: ViewContext): HTMLElement {
  const state = ctx.store.getState();
  const root = h("section", { className: "view messages-view" });
  root.append(
    h(
      "div",
      { className: "view-head" },
      h("div", {}, h("h2", {}, "消息"), h("p", {}, "惊喜推荐和兴趣探针都会收在这里。")),
      button("刷新", {
        className: "btn btn-ghost",
        disabled: state.actionBusy.messages,
        onClick: () => void ctx.refreshMessages(),
      }, "refresh"),
    ),
  );

  if (state.errors.messages) {
    root.append(h("div", { className: "notice notice-error" }, state.errors.messages));
  }

  if (state.delights.length === 0 && state.probes.length === 0) {
    root.append(
      emptyState(
        "还没有待处理消息",
        "后台有新的惊喜推荐或兴趣探针时会通过 runtime-stream 推过来；也会在刷新时读取当前队列。",
      ),
    );
    return root;
  }

  for (const delight of state.delights) {
    root.append(renderDelight(ctx, delight));
  }
  for (const probe of state.probes) {
    root.append(renderProbe(ctx, probe));
  }
  return root;
}

function renderDelight(ctx: ViewContext, item: DelightCandidate): HTMLElement {
  const handled = item.state && item.state !== "pending";
  return h(
    "article",
    { className: `message-card delight-card ${handled ? "handled" : ""}` },
    h(
      "div",
      { className: "message-media" },
      item.cover_url
        ? h("img", {
            src: item.cover_url,
            alt: "",
            loading: "lazy",
            referrerpolicy: "no-referrer",
            onError: (event: Event) => replaceBrokenCover(event.currentTarget),
          })
        : h("div", { className: "cover-placeholder" }, "D"),
    ),
    h(
      "div",
      { className: "message-body" },
      h("div", { className: "card-meta" }, chip("惊喜推荐", "hot"), chip(sourceLabel(item.source_platform)), chip(percent(item.delight_score), "score")),
      h("h3", {}, item.title),
      h("p", {}, item.delight_reason),
      item.delight_hook ? h("p", { className: "friend-copy" }, item.delight_hook) : null,
      item.response_message ? h("p", { className: "inline-status" }, item.response_message) : null,
      renderDelightActions(ctx, item),
      renderInlineChatForm("聊一聊", (message) => ctx.respondToDelight(item, "chat", message)),
    ),
  );
}

function replaceBrokenCover(target: EventTarget | null): void {
  if (!(target instanceof HTMLImageElement)) return;
  const parent = target.parentElement;
  target.remove();
  parent?.append(h("div", { className: "cover-placeholder" }, "D"));
}

function renderDelightActions(ctx: ViewContext, item: DelightCandidate): HTMLElement {
  return h(
    "div",
    { className: "card-actions" },
    button("看看", {
      className: "btn btn-primary",
      onClick: () => void ctx.respondToDelight(item, "view"),
    }, "open"),
    button("喜欢", {
      className: "btn btn-soft",
      onClick: () => void ctx.respondToDelight(item, "like"),
    }, "like"),
    button("不喜欢", {
      className: "btn btn-soft",
      onClick: () => void ctx.respondToDelight(item, "dislike"),
    }, "dislike"),
  );
}

function renderProbe(ctx: ViewContext, probe: InterestProbeMessage): HTMLElement {
  return h(
    "article",
    { className: `message-card probe-card ${probe.state && probe.state !== "pending" ? "handled" : ""}` },
    h(
      "div",
      { className: "message-body" },
      h("div", { className: "card-meta" }, chip("兴趣探针", "source"), probe.axis ? chip(probe.axis) : null),
      h("h3", {}, probe.domain),
      h("p", {}, probe.reason || probe.message || "阿B 想确认你是否对这个方向有兴趣。"),
      probe.specifics.length
        ? h("div", { className: "chip-cloud" }, ...probe.specifics.map((specific) => chip(specific)))
        : null,
      probe.reply ? h("p", { className: "inline-status" }, probe.reply) : null,
      h(
        "div",
        { className: "card-actions" },
        button("是", {
          className: "btn btn-primary",
          onClick: () => void ctx.respondToProbe(probe.domain, "confirm"),
        }, "like"),
        button("不是", {
          className: "btn btn-soft",
          onClick: () => void ctx.respondToProbe(probe.domain, "reject"),
        }, "dislike"),
      ),
      renderInlineChatForm("多聊聊", (message) => ctx.respondToProbe(probe.domain, "chat", message)),
    ),
  );
}

function renderInlineChatForm(
  label: string,
  onSubmit: (message: string) => Promise<void>,
): HTMLElement {
  return h(
    "details",
    { className: "feedback-details" },
    h("summary", {}, label),
    h(
      "form",
      {
        className: "comment-form",
        onSubmit: (event: SubmitEvent) => {
          event.preventDefault();
          const form = event.currentTarget as HTMLFormElement;
          const data = new FormData(form);
          const message = String(data.get("message") || "").trim();
          form.reset();
          void onSubmit(message);
        },
      },
      h("textarea", {
        name: "message",
        rows: "3",
        placeholder: "可以随便说一句你的判断，空着也会带默认上下文。",
      }),
      h("div", { className: "form-row" }, button("发送", { className: "btn btn-small btn-primary", type: "submit" }, "send")),
    ),
  );
}
