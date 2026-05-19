import type {
  ActivityFeed,
  ApiError,
  ChatTurn,
  ChatTurnListResponse,
  ConfigSummary,
  HealthResponse,
  PendingDelightBatchResponse,
  ProfileSummary,
  Recommendation,
  RecommendationListResponse,
  RecommendationRefreshResponse,
  RuntimeStatus,
} from "./types";
import { normalizeDelightCandidate, normalizeRecommendation } from "./helpers/recommendation";
import { normalizeProfileSummary } from "./helpers/profile";

const RAW_API_BASE = import.meta.env.VITE_API_BASE || "/api";
export const API_BASE = String(RAW_API_BASE).replace(/\/$/, "");

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let details: unknown = null;
    try {
      details = await response.json();
    } catch {
      details = null;
    }
    const error = new Error(`${path} failed: ${response.status}`) as ApiError;
    error.status = response.status;
    error.details = details;
    throw error;
  }
  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health");
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatus> {
  return requestJson<RuntimeStatus>("/runtime-status");
}

export async function fetchRecommendations(): Promise<Recommendation[]> {
  const payload = await requestJson<RecommendationListResponse>("/recommendations");
  return Array.isArray(payload.items) ? payload.items.map(normalizeRecommendation) : [];
}

export async function reshuffleRecommendations(): Promise<Recommendation[]> {
  const payload = await requestJson<RecommendationListResponse>("/recommendations/reshuffle", {
    method: "POST",
  });
  return Array.isArray(payload.items) ? payload.items.map(normalizeRecommendation) : [];
}

export async function appendRecommendations(excludedBvids: string[]): Promise<Recommendation[]> {
  const payload = await requestJson<RecommendationListResponse>("/recommendations/append", {
    method: "POST",
    body: JSON.stringify({ excluded_bvids: excludedBvids }),
  });
  return Array.isArray(payload.items) ? payload.items.map(normalizeRecommendation) : [];
}

export async function refreshRecommendations(): Promise<RecommendationRefreshResponse> {
  return requestJson<RecommendationRefreshResponse>("/recommendations/refresh", {
    method: "POST",
  });
}

export async function submitFeedback(
  recommendationId: number,
  feedbackType: "like" | "dislike" | "comment",
  note = "",
): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>("/feedback", {
    method: "POST",
    body: JSON.stringify({
      recommendation_id: recommendationId,
      feedback_type: feedbackType,
      note,
    }),
  });
}

export async function reportRecommendationClick(payload: {
  recommendation_id?: number;
  bvid: string;
  title?: string;
  topic_label?: string;
  up_name?: string;
}): Promise<boolean> {
  try {
    await requestJson<{ ok: boolean }>("/recommendation-click", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

export async function fetchProfileSummary(options: {
  limit?: number;
  cursor?: string;
} = {}): Promise<ProfileSummary> {
  const params = new URLSearchParams();
  if (typeof options.limit === "number") params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  const payload = await requestJson<ProfileSummary>(`/profile-summary${query ? `?${query}` : ""}`);
  return normalizeProfileSummary(payload);
}

export async function fetchChatTurns(): Promise<ChatTurn[]> {
  const payload = await requestJson<ChatTurnListResponse>("/chat/turns?session=web&limit=50");
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function startChatTurn(message: string): Promise<ChatTurn> {
  return requestJson<ChatTurn>("/chat/turns", {
    method: "POST",
    body: JSON.stringify({
      session: "web",
      scope: "chat",
      message,
    }),
  });
}

export async function fetchChatTurn(turnId: string): Promise<ChatTurn> {
  return requestJson<ChatTurn>(`/chat/turns/${encodeURIComponent(turnId)}`);
}

export async function fetchPendingDelightBatch(limit = 20): Promise<PendingDelightBatchResponse> {
  const payload = await requestJson<PendingDelightBatchResponse>(
    `/delight/pending-batch?limit=${limit}`,
  );
  return {
    items: Array.isArray(payload.items) ? payload.items.map(normalizeDelightCandidate) : [],
  };
}

export async function respondToDelight(
  bvid: string,
  response: "view" | "like" | "dislike" | "chat",
  title = "",
  message = "",
): Promise<{ ok: boolean; action: string; reply?: string; message?: string }> {
  return requestJson<{ ok: boolean; action: string; reply?: string; message?: string }>(
    "/delight/respond",
    {
      method: "POST",
      body: JSON.stringify({ bvid, title, response, message }),
    },
  );
}

export async function respondToInterestProbe(
  domain: string,
  response: "confirm" | "reject" | "chat",
  message = "",
): Promise<{ ok: boolean; action: string; domain: string; reply?: string }> {
  return requestJson<{ ok: boolean; action: string; domain: string; reply?: string }>(
    "/interest-probes/respond",
    {
      method: "POST",
      body: JSON.stringify({ domain, response, message }),
    },
  );
}

export async function fetchActivityFeed(): Promise<ActivityFeed> {
  return requestJson<ActivityFeed>("/activity-feed?limit=8");
}

export async function fetchConfigSummary(): Promise<ConfigSummary> {
  return requestJson<ConfigSummary>("/config");
}
