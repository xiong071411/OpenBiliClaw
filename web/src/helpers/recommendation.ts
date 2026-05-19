import type { DelightCandidate, Recommendation } from "../types";
import { asNumber, asText } from "./format";

const DEFAULT_TITLE = "这条标题还没对上号";
const DEFAULT_UP_NAME = "这位 UP 还没认出来";

export function normalizeCoverUrl(value: unknown): string {
  const text = asText(value);
  if (!text) return "";
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("http://")) return `https://${text.slice("http://".length)}`;
  return text;
}

export function buildVideoUrl(bvid: string): string {
  return `https://www.bilibili.com/video/${encodeURIComponent(asText(bvid))}`;
}

export function buildContentUrl(item: Pick<Recommendation, "content_url" | "bvid">): string {
  const contentUrl = asText(item.content_url);
  if (contentUrl) return contentUrl;
  const bvid = asText(item.bvid);
  return bvid ? buildVideoUrl(bvid) : "";
}

export function normalizeRecommendation(item: Partial<Recommendation>): Recommendation {
  const id = asNumber(item.recommendation_id ?? item.id, 0);
  const bvid = asText(item.bvid);
  return {
    recommendation_id: id,
    id,
    bvid,
    title: asText(item.title, DEFAULT_TITLE),
    up_name: asText(item.up_name, DEFAULT_UP_NAME),
    cover_url: normalizeCoverUrl(item.cover_url),
    expression: asText(item.expression),
    topic_label: asText(item.topic_label),
    presented: Boolean(item.presented),
    content_id: asText(item.content_id, bvid),
    content_url: asText(item.content_url),
    source_platform: asText(item.source_platform, "bilibili"),
  };
}

export function normalizeDelightCandidate(item: Partial<DelightCandidate>): DelightCandidate {
  const bvid = asText(item.bvid);
  return {
    bvid,
    title: asText(item.title, "这条惊喜推荐还没起好标题"),
    delight_reason: asText(item.delight_reason, "这条可能会给你一点意外之喜。"),
    delight_score: asNumber(item.delight_score, 0),
    delight_hook: asText(item.delight_hook),
    cover_url: normalizeCoverUrl(item.cover_url),
    content_url: asText(item.content_url) || (bvid ? buildVideoUrl(bvid) : ""),
    source_platform: asText(item.source_platform, "bilibili"),
    state: item.state || "pending",
    response_message: asText(item.response_message),
    chat_reply: asText(item.chat_reply),
  };
}
