import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/mobile.css";

import {
  appendRecommendations as apiAppendRecommendations,
  fetchActivityFeed,
  fetchChatTurn,
  fetchChatTurns,
  fetchConfigSummary,
  fetchHealth,
  fetchPendingDelightBatch,
  fetchProfileSummary,
  fetchRecommendations,
  fetchRuntimeStatus,
  refreshRecommendations as apiRefreshRecommendations,
  reportRecommendationClick,
  respondToDelight as apiRespondToDelight,
  respondToInterestProbe,
  reshuffleRecommendations as apiReshuffleRecommendations,
  startChatTurn,
  submitFeedback,
} from "./api";
import { clear, h, svgIcon } from "./helpers/dom";
import { compactReason, uid } from "./helpers/format";
import { buildContentUrl, normalizeDelightCandidate } from "./helpers/recommendation";
import { ROUTES, listenRouter, navigate } from "./router";
import { createRuntimeStreamClient } from "./stream";
import { store } from "./state";
import type {
  ChatTurn,
  DelightCandidate,
  InterestProbeMessage,
  Recommendation,
  RuntimeEvent,
  RuntimeStatus,
} from "./types";
import { renderChatView } from "./views/chat";
import type { ViewContext } from "./views/context";
import { renderMessagesView } from "./views/messages";
import { renderProfileView } from "./views/profile";
import { renderRecommendView, renderRuntimeStrip } from "./views/recommend";
import { renderSettingsView } from "./views/settings";

const mountNode = document.querySelector<HTMLDivElement>("#app");

if (mountNode === null) {
  throw new Error("Missing #app mount node");
}

const app: HTMLDivElement = mountNode;

const ctx: ViewContext = {
  store,
  refreshAll,
  refreshRuntime,
  refreshRecommendations,
  reshuffle,
  appendRecommendations,
  manualRefreshPool,
  submitRecommendationFeedback,
  openRecommendation,
  loadProfile,
  loadMoreCognition,
  sendChatMessage,
  refreshMessages,
  respondToDelight,
  respondToProbe,
  showToast,
};

store.subscribe(renderApp);
listenRouter((route) => {
  store.setState({ route });
  void ensureRouteData(route);
});
renderApp();
void boot();

async function boot(): Promise<void> {
  connectRuntimeStream();
  await refreshAll();
  store.setState({ booted: true });
}

function renderApp(): void {
  const state = store.getState();
  clear(app);
  const children: Node[] = [
    h(
      "header",
      { className: "app-header" },
      h(
        "div",
        { className: "brand-row" },
        h("div", { className: "brand-mark" }, "OBC"),
        h("div", {}, h("h1", {}, "OpenBiliClaw"), h("p", {}, "移动 Web 操作台")),
        h("span", { className: `status-pill ${state.online ? "online" : "offline"}` }, state.online ? "在线" : "离线"),
      ),
      renderRuntimeStrip(ctx),
    ),
    h("main", { className: "app-main" }, renderRoute(ctx)),
    renderBottomNav(),
  ];
  if (state.toast) {
    children.splice(
      1,
      0,
      h("div", { className: `toast toast-${state.toast.tone}` }, state.toast.message),
    );
  }
  app.append(...children);
}

function renderRoute(context: ViewContext): HTMLElement {
  const route = context.store.getState().route;
  if (route === "profile") return renderProfileView(context);
  if (route === "chat") return renderChatView(context);
  if (route === "messages") return renderMessagesView(context);
  if (route === "settings") return renderSettingsView(context);
  return renderRecommendView(context);
}

function renderBottomNav(): HTMLElement {
  const { route, probes, delights } = store.getState();
  const unread = probes.filter((item) => !item.state || item.state === "pending").length
    + delights.filter((item) => !item.state || item.state === "pending").length;
  return h(
    "nav",
    { className: "bottom-nav", ariaLabel: "主导航" },
    ...ROUTES.map((item) =>
      renderNavButton(
        item.id,
        item.label,
        item.icon,
        route === item.id,
        item.id === "messages" ? unread : 0,
      ),
    ),
  );
}

function renderNavButton(
  routeId: (typeof ROUTES)[number]["id"],
  label: string,
  icon: string,
  active: boolean,
  badge: number,
): HTMLButtonElement {
  return h(
    "button",
    {
      type: "button",
      className: `nav-button ${active ? "active" : ""}`,
      ariaLabel: label,
      onClick: () => navigate(routeId),
    },
    svgIcon(icon),
    h("span", {}, label),
    badge > 0 ? h("i", { className: "nav-badge" }, String(Math.min(99, badge))) : null,
  ) as HTMLButtonElement;
}

async function ensureRouteData(route: string): Promise<void> {
  if (route === "profile" && !store.getState().profile) {
    await loadProfile();
  }
  if (route === "chat" && store.getState().chatTurns.length === 0) {
    await loadChatTurns();
  }
  if (route === "messages" && store.getState().delights.length === 0) {
    await refreshMessages();
  }
  if (route === "settings" && !store.getState().config) {
    await loadSettings();
  }
}

async function refreshAll(): Promise<void> {
  await Promise.allSettled([
    checkHealth(),
    refreshRuntime(),
    refreshRecommendations(),
    loadProfile(),
    loadChatTurns(),
    refreshMessages(),
    loadActivity(),
    loadSettings(),
  ]);
}

async function checkHealth(): Promise<void> {
  try {
    const health = await fetchHealth();
    store.setState({ health, online: true });
    clearError("health");
  } catch (error) {
    store.setState({ online: false });
    setError("health", compactReason(error, "后端健康检查失败。"));
  }
}

async function refreshRuntime(): Promise<void> {
  await withBusy("runtime", async () => {
    try {
      const runtimeStatus = await fetchRuntimeStatus();
      store.setState({ runtimeStatus, online: true });
      clearError("runtime");
    } catch (error) {
      setError("runtime", compactReason(error, "运行状态读取失败。"));
    }
  });
}

async function refreshRecommendations(): Promise<void> {
  await withBusy("recommendations", async () => {
    try {
      const recommendations = await fetchRecommendations();
      store.setState({ recommendations, online: true });
      clearError("recommendations");
    } catch (error) {
      setError("recommendations", compactReason(error, "推荐列表读取失败。"));
    }
  });
}

async function reshuffle(): Promise<void> {
  await withBusy("reshuffle", async () => {
    try {
      const recommendations = await apiReshuffleRecommendations();
      store.setState({ recommendations });
      showToast(recommendations.length ? "已经换了一批。" : "这次没有换出新内容。", "success");
      await refreshRuntime();
    } catch (error) {
      setError("recommendations", compactReason(error, "换一批失败。"));
      showToast("换一批失败。", "error");
    }
  });
}

async function appendRecommendations(): Promise<void> {
  await withBusy("appendRecommendations", async () => {
    const existing = store.getState().recommendations;
    const excluded = existing.map((item) => item.bvid).filter(Boolean);
    try {
      const next = await apiAppendRecommendations(excluded);
      const seen = new Set(existing.map((item) => `${item.source_platform}:${item.content_id || item.bvid}`));
      const merged = [
        ...existing,
        ...next.filter((item) => !seen.has(`${item.source_platform}:${item.content_id || item.bvid}`)),
      ];
      store.setState({ recommendations: merged });
      showToast(next.length ? "已经继续加载。" : "这池先翻到头了。", next.length ? "success" : "info");
      await refreshRuntime();
    } catch (error) {
      setError("recommendations", compactReason(error, "继续加载失败。"));
    }
  });
}

async function manualRefreshPool(): Promise<void> {
  await withBusy("refreshPool", async () => {
    try {
      const result = await apiRefreshRecommendations();
      showToast(refreshPoolMessage(result.reason || result.state), result.accepted ? "success" : "info");
      await refreshRuntime();
      window.setTimeout(() => void refreshRuntime(), 4000);
    } catch (error) {
      showToast(compactReason(error, "补货请求失败。"), "error");
    }
  });
}

function refreshPoolMessage(reason: string): string {
  if (reason === "not_initialized") return "先完成初始化，再刷新推荐池。";
  if (reason === "already_running") return "后台已经在补货了。";
  if (reason === "runtime_unavailable") return "运行时暂不可用。";
  return "已提交补货请求，后台会继续处理。";
}

async function submitRecommendationFeedback(
  item: Recommendation,
  feedbackType: "like" | "dislike" | "comment",
  note = "",
): Promise<void> {
  const recommendationId = item.recommendation_id || item.id;
  if (feedbackType === "comment" && !note.trim()) {
    showToast("请先写一句你的想法。", "error");
    return;
  }
  setFeedbackStatus(recommendationId, "submitting");
  try {
    await submitFeedback(recommendationId, feedbackType, note);
    setFeedbackStatus(recommendationId, "success");
    showToast("已记住，会影响后面的推荐。", "success");
    await Promise.allSettled([loadProfile({ force: true }), loadActivity(), refreshRuntime()]);
  } catch {
    setFeedbackStatus(recommendationId, "error");
    showToast("这条反馈没记上，可以再试一次。", "error");
  }
}

function openRecommendation(item: Recommendation): void {
  void reportRecommendationClick({
    recommendation_id: item.recommendation_id || item.id,
    bvid: item.bvid,
    title: item.title,
    topic_label: item.topic_label,
    up_name: item.up_name,
  });
}

async function loadProfile(options: { force?: boolean } = {}): Promise<void> {
  if (!options.force && store.getState().profile) return;
  await withBusy("profile", async () => {
    try {
      const profile = await fetchProfileSummary({ limit: 6 });
      store.setState({ profile, probes: probesFromProfile(profile) });
      clearError("profile");
    } catch (error) {
      setError("profile", compactReason(error, "画像读取失败。"));
    }
  });
}

async function loadMoreCognition(): Promise<void> {
  const current = store.getState().profile;
  if (!current?.has_more_cognition_updates || !current.next_cognition_cursor) return;
  await withBusy("cognition", async () => {
    try {
      const next = await fetchProfileSummary({ limit: 6, cursor: current.next_cognition_cursor });
      store.setState({
        profile: {
          ...current,
          recent_cognition_updates: [
            ...current.recent_cognition_updates,
            ...next.recent_cognition_updates,
          ],
          has_more_cognition_updates: next.has_more_cognition_updates,
          next_cognition_cursor: next.next_cognition_cursor,
        },
      });
    } catch (error) {
      setError("profile", compactReason(error, "加载更多认知更新失败。"));
    }
  });
}

function probesFromProfile(profile: { speculative_interests?: Array<{
  domain: string;
  reason: string;
  specifics?: Array<{ name: string }>;
}> }): InterestProbeMessage[] {
  return (profile.speculative_interests || []).map((item) => ({
    type: "interest.probe",
    domain: item.domain,
    reason: item.reason,
    specifics: (item.specifics || []).map((specific) => specific.name).filter(Boolean),
    message: item.reason,
    state: "pending",
  }));
}

async function loadChatTurns(): Promise<void> {
  await withBusy("chat", async () => {
    try {
      const chatTurns = await fetchChatTurns();
      store.setState({ chatTurns });
      clearError("chat");
    } catch (error) {
      setError("chat", compactReason(error, "聊天历史读取失败。"));
    }
  });
}

async function sendChatMessage(message: string): Promise<void> {
  await withBusy("sendChat", async () => {
    const tempTurn: ChatTurn = {
      turn_id: uid("local-turn"),
      session: "web",
      scope: "chat",
      subject_id: "",
      subject_title: "",
      message,
      reply: "",
      status: "pending",
      error: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.setState({ chatTurns: [...store.getState().chatTurns, tempTurn] });
    try {
      const turn = await startChatTurn(message);
      replaceTurn(tempTurn.turn_id, turn);
      await pollChatTurn(turn.turn_id);
    } catch (error) {
      replaceTurn(tempTurn.turn_id, {
        ...tempTurn,
        status: "failed",
        error: compactReason(error, "消息发送失败。"),
        updated_at: new Date().toISOString(),
      });
    }
  });
}

async function pollChatTurn(turnId: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180_000) {
    await wait(2000);
    const turn = await fetchChatTurn(turnId);
    replaceTurn(turnId, turn);
    if (turn.status !== "pending") {
      await Promise.allSettled([loadProfile({ force: true }), loadActivity()]);
      return;
    }
  }
  showToast("还在后台处理中，请稍后刷新聊天页。", "info");
}

function replaceTurn(localId: string, next: ChatTurn): void {
  store.update((state) => ({
    ...state,
    chatTurns: state.chatTurns.map((turn) =>
      turn.turn_id === localId || turn.turn_id === next.turn_id ? next : turn,
    ),
  }));
}

async function refreshMessages(): Promise<void> {
  await withBusy("messages", async () => {
    try {
      const batch = await fetchPendingDelightBatch(20);
      const currentProbeByDomain = new Map(store.getState().probes.map((probe) => [probe.domain, probe]));
      const profile = store.getState().profile;
      const probes = profile ? probesFromProfile(profile).map((probe) => ({
        ...probe,
        state: currentProbeByDomain.get(probe.domain)?.state || probe.state,
        reply: currentProbeByDomain.get(probe.domain)?.reply,
      })) : store.getState().probes;
      store.setState({ delights: batch.items, probes });
      clearError("messages");
    } catch (error) {
      setError("messages", compactReason(error, "消息读取失败。"));
    }
  });
}

async function respondToDelight(
  item: DelightCandidate,
  response: "view" | "like" | "dislike" | "chat",
  message = "",
): Promise<void> {
  await withBusy(`delight-${item.bvid}`, async () => {
    try {
      const result = await apiRespondToDelight(item.bvid, response, item.title, message);
      const stateMap: Record<typeof response, DelightCandidate["state"]> = {
        view: "viewed",
        like: "liked",
        dislike: "rejected",
        chat: "chatted",
      };
      updateDelight(item.bvid, {
        state: stateMap[response],
        response_message: result.message || responseMessage(response),
        chat_reply: result.reply || item.chat_reply,
      });
      if (response === "view") {
        window.open(item.content_url || buildContentUrl({ content_url: item.content_url, bvid: item.bvid }), "_blank", "noopener,noreferrer");
      }
      showToast(responseMessage(response), "success");
      await Promise.allSettled([loadProfile({ force: true }), loadActivity()]);
    } catch (error) {
      showToast(compactReason(error, "惊喜反馈失败。"), "error");
    }
  });
}

function responseMessage(response: "view" | "like" | "dislike" | "chat"): string {
  if (response === "view") return "已打开，阿B 会把这次点击当成强信号。";
  if (response === "like") return "好，这类多来点。";
  if (response === "dislike") return "记下了，这类惊喜先少来点。";
  return "这句已经记下。";
}

function updateDelight(bvid: string, patch: Partial<DelightCandidate>): void {
  store.update((state) => ({
    ...state,
    delights: state.delights.map((item) => (item.bvid === bvid ? { ...item, ...patch } : item)),
  }));
}

async function respondToProbe(
  domain: string,
  response: "confirm" | "reject" | "chat",
  message = "",
): Promise<void> {
  await withBusy(`probe-${domain}`, async () => {
    try {
      const result = await respondToInterestProbe(domain, response, message);
      const stateMap: Record<typeof response, InterestProbeMessage["state"]> = {
        confirm: "confirmed",
        reject: "rejected",
        chat: "chatted",
      };
      store.update((state) => ({
        ...state,
        probes: state.probes.map((probe) =>
          probe.domain === domain ? { ...probe, state: stateMap[response], reply: result.reply || probe.reply } : probe,
        ),
      }));
      showToast(probeMessage(domain, response), "success");
      await loadProfile({ force: true });
    } catch (error) {
      showToast(compactReason(error, "兴趣探针反馈失败。"), "error");
    }
  });
}

function probeMessage(domain: string, response: "confirm" | "reject" | "chat"): string {
  if (response === "confirm") return `已确认对「${domain}」的兴趣。`;
  if (response === "reject") return `已记录：暂时不推「${domain}」。`;
  return `关于「${domain}」的反馈已记下。`;
}

async function loadActivity(): Promise<void> {
  try {
    const activityFeed = await fetchActivityFeed();
    store.setState({ activityFeed });
  } catch {
    // Activity is secondary; leave the current panel untouched.
  }
}

async function loadSettings(): Promise<void> {
  await withBusy("settings", async () => {
    try {
      const config = await fetchConfigSummary();
      store.setState({ config });
    } catch {
      // Config is optional on the mobile web settings page.
    }
  });
}

function connectRuntimeStream(): void {
  const client = createRuntimeStreamClient({
    onConnect: () => {
      store.setState({ streamOnline: true });
    },
    onDisconnect: () => {
      store.setState({ streamOnline: false });
    },
    onEvent: handleRuntimeEvent,
  });
  client.connect();
}

function handleRuntimeEvent(event: RuntimeEvent): void {
  const nextStatus = mergeRuntimeStatus(store.getState().runtimeStatus, event);
  store.setState({ runtimeEvent: event, runtimeStatus: nextStatus });

  if (event.type === "refresh.pool_updated" || event.type === "recommendation.reshuffled") {
    void Promise.allSettled([refreshRecommendations(), refreshRuntime()]);
  }
  if (event.type === "activity.added") {
    void loadActivity();
  }
  if (event.type === "profile_updated" || event.type === "init_completed") {
    void Promise.allSettled([loadProfile({ force: true }), refreshRecommendations(), refreshRuntime()]);
  }
  if (event.type === "delight.candidate" && event.bvid) {
    const candidate = normalizeDelightCandidate({
      bvid: String(event.bvid),
      title: String(event.title || ""),
      delight_reason: String(event.delight_reason || ""),
      delight_score: typeof event.delight_score === "number" ? event.delight_score : 0,
      delight_hook: String(event.delight_hook || ""),
      cover_url: String(event.cover_url || ""),
      content_url: String(event.content_url || ""),
      source_platform: String(event.source_platform || "bilibili"),
    });
    store.update((state) => ({
      ...state,
      delights: mergeBy(state.delights, candidate, (item) => item.bvid),
    }));
  }
  if (event.type === "delight.refreshed") {
    void refreshMessages();
  }
  if (event.type === "interest.probe" && event.domain) {
    const probe: InterestProbeMessage = {
      type: "interest.probe",
      domain: String(event.domain),
      reason: String(event.reason || event.message || ""),
      category: String(event.category || ""),
      axis: String(event.axis || ""),
      specifics: Array.isArray(event.specifics) ? event.specifics.map(String) : [],
      message: String(event.message || ""),
      state: "pending",
    };
    store.update((state) => ({
      ...state,
      probes: mergeBy(state.probes, probe, (item) => item.domain),
    }));
  }
  if (event.message && event.type.startsWith("interest.")) {
    showToast(String(event.message), "success");
  }
}

function mergeRuntimeStatus(status: RuntimeStatus | null, event: RuntimeEvent): RuntimeStatus | null {
  if (!status) return status;
  return {
    ...status,
    pool_available_count:
      typeof event.pool_available_count === "number"
        ? event.pool_available_count
        : status.pool_available_count,
    pool_target_count:
      typeof event.pool_target_count === "number" ? event.pool_target_count : status.pool_target_count,
    last_replenished_count:
      typeof event.last_replenished_count === "number"
        ? event.last_replenished_count
        : status.last_replenished_count,
    last_discovered_count:
      typeof event.last_discovered_count === "number"
        ? event.last_discovered_count
        : status.last_discovered_count,
    recent_pool_topics: Array.isArray(event.recent_pool_topics)
      ? event.recent_pool_topics.map(String)
      : status.recent_pool_topics,
  };
}

function mergeBy<T>(items: T[], incoming: T, key: (item: T) => string): T[] {
  const incomingKey = key(incoming);
  const exists = items.some((item) => key(item) === incomingKey);
  if (!exists) return [incoming, ...items];
  return items.map((item) => (key(item) === incomingKey ? { ...item, ...incoming } : item));
}

function setFeedbackStatus(id: number, status: string): void {
  store.update((state) => ({
    ...state,
    feedbackStatus: { ...state.feedbackStatus, [id]: status },
  }));
}

function setBusy(key: string, value: boolean): void {
  store.update((state) => ({
    ...state,
    actionBusy: { ...state.actionBusy, [key]: value },
  }));
}

async function withBusy(key: string, action: () => Promise<void>): Promise<void> {
  setBusy(key, true);
  try {
    await action();
  } finally {
    setBusy(key, false);
  }
}

function setError(key: string, message: string): void {
  store.update((state) => ({
    ...state,
    errors: { ...state.errors, [key]: message },
  }));
}

function clearError(key: string): void {
  store.update((state) => {
    const errors = { ...state.errors };
    delete errors[key];
    return { ...state, errors };
  });
}

function showToast(message: string, tone: "info" | "success" | "error" = "info"): void {
  store.setState({ toast: { message, tone } });
  window.setTimeout(() => {
    if (store.getState().toast?.message === message) {
      store.setState({ toast: null });
    }
  }, 3800);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
