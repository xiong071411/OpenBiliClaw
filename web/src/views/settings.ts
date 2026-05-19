import { API_BASE } from "../api";
import { button, chip, emptyState, h, meter } from "../helpers/dom";
import { formatRelativeTime } from "../helpers/format";
import type { ViewContext } from "./context";

export function renderSettingsView(ctx: ViewContext): HTMLElement {
  const state = ctx.store.getState();
  const status = state.runtimeStatus;
  const config = state.config;
  const root = h("section", { className: "view settings-view" });
  root.append(
    h(
      "div",
      { className: "view-head" },
      h("div", {}, h("h2", {}, "设置"), h("p", {}, "Web v1 只放低风险状态和手动刷新入口。")),
      button("刷新", {
        className: "btn btn-ghost",
        disabled: state.actionBusy.settings,
        onClick: () => void ctx.refreshAll(),
      }, "refresh"),
    ),
  );

  root.append(
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-title" }, h("h3", {}, "连接")),
      h("p", { className: "key-value" }, h("strong", {}, "API"), h("span", {}, API_BASE)),
      h("p", { className: "key-value" }, h("strong", {}, "服务"), h("span", {}, state.health?.service || "unknown")),
      h("p", { className: "key-value" }, h("strong", {}, "状态"), h("span", {}, state.online ? "在线" : "离线")),
      h("p", { className: "key-value" }, h("strong", {}, "实时流"), h("span", {}, state.streamOnline ? "已连接" : "重连中")),
    ),
  );

  if (!status) {
    root.append(emptyState("还没有运行状态", "后端在线后会显示初始化、候选池、推荐数量和补货状态。"));
  } else {
    const ratio = status.pool_target_count > 0 ? status.pool_available_count / status.pool_target_count : 0;
    root.append(
      h(
        "article",
        { className: "panel" },
        h("div", { className: "panel-title" }, h("h3", {}, "运行状态"), status.initialized ? chip("已初始化", "success") : chip("未初始化")),
        meter("候选池", ratio),
        h("p", { className: "key-value" }, h("strong", {}, "推荐数量"), h("span", {}, String(status.recommendation_count))),
        h("p", { className: "key-value" }, h("strong", {}, "最近刷新"), h("span", {}, formatRelativeTime(status.last_refresh_at) || "暂无")),
        h("p", { className: "key-value" }, h("strong", {}, "最近补货"), h("span", {}, `${status.last_replenished_count} 条`)),
        h("p", { className: "key-value" }, h("strong", {}, "手动刷新"), h("span", {}, status.manual_refresh_message || status.manual_refresh_state)),
        button("手动刷新推荐池", {
          className: "btn btn-primary wide",
          disabled: state.actionBusy.refreshPool,
          onClick: () => void ctx.manualRefreshPool(),
        }, "refresh"),
      ),
    );
  }

  root.append(
    h(
      "article",
      { className: "panel" },
      h("div", { className: "panel-title" }, h("h3", {}, "登录态与安全")),
      h(
        "p",
        {},
        status?.last_account_sync_error
          ? `最近账号同步失败：${status.last_account_sync_error}`
          : status?.last_account_sync_at
            ? `最近账号同步：${formatRelativeTime(status.last_account_sync_at)}`
            : "当前 Web v1 不读取浏览器 Cookie；服务器侧使用 /root/b站cookie.txt 或扩展同步后的登录态。",
      ),
      h("p", { className: "muted" }, "公开页面不会展示完整 API Key、Cookie 或 config.toml 里的敏感字段。"),
    ),
  );

  if (config) {
    root.append(
      h(
        "article",
        { className: "panel" },
        h("div", { className: "panel-title" }, h("h3", {}, "配置摘要")),
        h("p", { className: "key-value" }, h("strong", {}, "LLM Provider"), h("span", {}, config.llm?.default_provider || "unknown")),
        h("p", { className: "key-value" }, h("strong", {}, "模型"), h("span", {}, config.llm?.openai_compatible?.model || "masked")),
        h("p", { className: "key-value" }, h("strong", {}, "后台调度"), h("span", {}, config.scheduler?.enabled === false ? "暂停" : "启用")),
        h(
          "div",
          { className: "chip-cloud" },
          chip(`XHS ${config.sources?.xiaohongshu?.enabled === false ? "关" : "开"}`),
          chip(`抖音 ${config.sources?.douyin?.enabled ? "开" : "关"}`),
          chip(`YouTube ${config.sources?.youtube?.enabled ? "开" : "关"}`),
        ),
      ),
    );
  }

  root.append(
    h(
      "article",
      { className: "panel quiet-panel" },
      h("div", { className: "panel-title" }, h("h3", {}, "Web v1 暂不支持")),
      h(
        "ul",
        { className: "plain-list" },
        h("li", {}, "小红书、抖音、YouTube 的页面内容采集需要浏览器扩展。"),
        h("li", {}, "浏览器 Cookie 自动同步需要浏览器扩展或未来 Web/PWA 版本支持。"),
        h("li", {}, "系统通知、toolbar badge、side panel/sidebar 不属于普通网页能力。"),
        h("li", {}, "完整 LLM Key 编辑、Cookie 粘贴和配置保存不会放在公开 Web v1。"),
      ),
    ),
  );
  return root;
}
