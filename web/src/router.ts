import type { RouteId } from "./types";

export const ROUTES: Array<{ id: RouteId; label: string; icon: string }> = [
  { id: "recommend", label: "推荐", icon: "spark" },
  { id: "profile", label: "画像", icon: "profile" },
  { id: "chat", label: "聊天", icon: "chat" },
  { id: "messages", label: "消息", icon: "bell" },
  { id: "settings", label: "设置", icon: "gear" },
];

const ROUTE_IDS = new Set<RouteId>(ROUTES.map((route) => route.id));

export function routeFromHash(hash = window.location.hash): RouteId {
  const raw = hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTE_IDS.has(raw as RouteId) ? (raw as RouteId) : "recommend";
}

export function navigate(route: RouteId): void {
  if (routeFromHash() === route) return;
  window.location.hash = `#/${route}`;
}

export function listenRouter(onRoute: (route: RouteId) => void): () => void {
  const handler = () => onRoute(routeFromHash());
  window.addEventListener("hashchange", handler);
  handler();
  return () => window.removeEventListener("hashchange", handler);
}
