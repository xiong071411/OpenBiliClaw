/**
 * Xiaohongshu (小红书) platform adapter. MVP scope: capture snapshot,
 * click, scroll, and search events. Like/collect/comment DOM is
 * unstable on xhs and left out of this phase.
 */

import type { ActionHint, PageType, PlatformAdapter } from "../types.js";

// 24-char hex note ids (e.g. "69dea966000000001a0280ad").
const NOTE_ID_PATTERN = /\/(?:explore|discovery\/item|search_result)\/([0-9a-f]{24})/i;

const CARD_SELECTOR = [
  'a[href*="/explore/"]',
  'a[href*="/discovery/item/"]',
  'a[href*="/search_result/"]',
  ".note-item",
  ".feeds-page .note-item",
].join(",");

const SEARCH_INPUT_SELECTOR =
  'input[placeholder*="搜索"], input[type="search"], .search-input input';

export function detectXiaohongshuPageType(url: string): PageType {
  if (url.includes("/search_result")) return "search";
  if (url.includes("/explore/") || url.includes("/discovery/item/")) return "note";
  if (url.includes("/user/profile/")) return "user";
  if (url.includes("/explore")) return "home";
  return "home";
}

export function extractNoteId(url: string): string | null {
  const match = url.match(NOTE_ID_PATTERN);
  return match ? match[1] : null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function inferXiaohongshuActionType(hint: ActionHint): string | null {
  // MVP: strong-signal actions (like/collect/comment) are intentionally
  // ignored on xhs because the DOM is unstable. Revisit when we add
  // per-platform DOM fixtures.
  const text = `${normalizeText(hint.text)} ${normalizeText(hint.ariaLabel)} ${hint.className}`
    .toLowerCase();
  if (!text) return null;
  return null;
}

export const xiaohongshuAdapter: PlatformAdapter = {
  sourcePlatform: "xiaohongshu",
  detectPageType: detectXiaohongshuPageType,
  extractContentId: extractNoteId,
  cardSelector: CARD_SELECTOR,
  searchInputSelector: SEARCH_INPUT_SELECTOR,
  videoSelector: null,
  inferActionType: inferXiaohongshuActionType,
  buildEventMetadata(url: string): Record<string, unknown> {
    return { note_id: extractNoteId(url) };
  },
};
