import type { Store } from "../state";
import type { DelightCandidate, Recommendation } from "../types";

export interface ViewContext {
  store: Store;
  refreshAll: () => Promise<void>;
  refreshRuntime: () => Promise<void>;
  refreshRecommendations: () => Promise<void>;
  reshuffle: () => Promise<void>;
  appendRecommendations: () => Promise<void>;
  manualRefreshPool: () => Promise<void>;
  submitRecommendationFeedback: (
    item: Recommendation,
    feedbackType: "like" | "dislike" | "comment",
    note?: string,
  ) => Promise<void>;
  openRecommendation: (item: Recommendation) => void;
  loadProfile: (options?: { force?: boolean }) => Promise<void>;
  loadMoreCognition: () => Promise<void>;
  sendChatMessage: (message: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  respondToDelight: (
    item: DelightCandidate,
    response: "view" | "like" | "dislike" | "chat",
    message?: string,
  ) => Promise<void>;
  respondToProbe: (
    domain: string,
    response: "confirm" | "reject" | "chat",
    message?: string,
  ) => Promise<void>;
  showToast: (message: string, tone?: "info" | "success" | "error") => void;
}
