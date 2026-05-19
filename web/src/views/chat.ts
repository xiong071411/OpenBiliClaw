import { button, emptyState, h } from "../helpers/dom";
import { formatRelativeTime } from "../helpers/format";
import type { ChatTurn } from "../types";
import type { ViewContext } from "./context";

export function renderChatView(ctx: ViewContext): HTMLElement {
  const state = ctx.store.getState();
  const root = h("section", { className: "view chat-view" });
  root.append(
    h(
      "div",
      { className: "view-head" },
      h("div", {}, h("h2", {}, "聊天"), h("p", {}, "使用 durable turn，切后台后也能等后端完成。")),
      button("刷新", {
        className: "btn btn-ghost",
        disabled: state.actionBusy.chat,
        onClick: () => void ctx.refreshAll(),
      }, "refresh"),
    ),
  );

  if (state.errors.chat) {
    root.append(h("div", { className: "notice notice-error" }, state.errors.chat));
  }

  const turns = [...state.chatTurns].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const thread = h("div", { className: "chat-thread" });
  if (turns.length === 0) {
    thread.append(emptyState("还没有聊天", "可以直接告诉阿B最近想看什么、别推什么，或者校准它对你的理解。"));
  } else {
    for (const turn of turns) {
      thread.append(renderTurn(turn));
    }
  }
  root.append(thread);
  root.append(renderComposer(ctx));
  return root;
}

function renderTurn(turn: ChatTurn): HTMLElement {
  return h(
    "article",
    { className: "turn-card" },
    h("div", { className: "bubble bubble-user" }, h("p", {}, turn.message)),
    h(
      "div",
      { className: `bubble bubble-agent status-${turn.status}` },
      h(
        "p",
        {},
        turn.status === "pending"
          ? "阿B 正在整理这句..."
          : turn.status === "failed"
            ? turn.error || "这次回复失败了。"
            : turn.reply || "回复已完成，但没有返回内容。",
      ),
      h("small", {}, formatRelativeTime(turn.updated_at || turn.created_at)),
    ),
  );
}

function renderComposer(ctx: ViewContext): HTMLElement {
  return h(
    "form",
    {
      className: "chat-composer",
      onSubmit: (event: SubmitEvent) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        const message = String(data.get("message") || "").trim();
        if (!message) return;
        form.reset();
        void ctx.sendChatMessage(message);
      },
    },
    h("label", { className: "sr-only", for: "chat-message" }, "聊天内容"),
    h("textarea", {
      id: "chat-message",
      name: "message",
      rows: "2",
      placeholder: "告诉阿B：这类少推点 / 我最近想看... / 为什么你觉得我会喜欢这个？",
      onKeydown: (event: KeyboardEvent) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.isComposing
        ) {
          event.preventDefault();
          (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
        }
      },
    }),
    button("发送", {
      className: "btn btn-primary",
      disabled: ctx.store.getState().actionBusy.sendChat,
      type: "submit",
    }, "send"),
  );
}
