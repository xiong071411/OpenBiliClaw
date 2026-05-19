export function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function percent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export function normalizeList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asText(item)).filter(Boolean) : [];
}

export function formatRelativeTime(isoString: string, now = Date.now()): string {
  const text = asText(isoString);
  if (!text) return "";
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return "";
  const diffMs = now - parsed;
  if (diffMs < 60_000) return "刚刚";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export function sourceLabel(source: string): string {
  const normalized = asText(source).toLowerCase();
  if (normalized.includes("xhs") || normalized.includes("xiaohongshu")) return "小红书";
  if (normalized.includes("douyin") || normalized.includes("dy-")) return "抖音";
  if (normalized.includes("youtube") || normalized.includes("yt_")) return "YouTube";
  if (normalized.includes("web")) return "Web";
  return "B 站";
}

export function compactReason(error: unknown, fallback = "请求失败，稍后再试。"): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
