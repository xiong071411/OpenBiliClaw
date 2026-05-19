export type RouteId = "recommend" | "profile" | "chat" | "messages" | "settings";

export interface HealthResponse {
  status: string;
  service: string;
}

export interface Recommendation {
  recommendation_id: number;
  id: number;
  bvid: string;
  title: string;
  up_name: string;
  cover_url: string;
  expression: string;
  topic_label: string;
  presented: boolean;
  content_id: string;
  content_url: string;
  source_platform: string;
}

export interface RecommendationListResponse {
  items: Recommendation[];
}

export interface RecommendationRefreshResponse {
  ok: boolean;
  accepted: boolean;
  state: string;
  reason: string;
}

export interface RuntimeStatus {
  initialized: boolean;
  recommendation_count: number;
  pending_signal_events: number;
  last_refresh_at: string;
  last_notification_at: string;
  unread_count: number;
  pool_available_count: number;
  pool_target_count: number;
  last_discovered_count: number;
  last_replenished_count: number;
  recent_pool_topics: string[];
  manual_refresh_state: string;
  manual_refresh_message: string;
  last_account_sync_at: string;
  last_account_sync_error: string;
}

export interface ActivityFeedItem {
  id: string;
  kind: string;
  summary: string;
  detail: string;
  created_at: string;
  tone: "info" | "success" | "error" | string;
}

export interface ActivityFeed {
  live_summary: string;
  headline: string;
  items: ActivityFeedItem[];
  has_more: boolean;
  next_cursor: string;
}

export interface MBTIDimension {
  pole: string;
  strength: number;
}

export interface MBTIProfile {
  type: string;
  dimensions: Record<string, MBTIDimension>;
  confidence: number;
}

export interface InterestSpecific {
  name: string;
  weight: number;
  confirmation_count?: number;
}

export interface InterestDomain {
  domain: string;
  weight: number;
  specifics: InterestSpecific[];
}

export interface StylePreference {
  preferred_duration: string;
  preferred_pace: string;
  quality_sensitivity: number;
  humor_preference: number;
  depth_preference: number;
}

export interface ContextMode {
  weekday_patterns: string;
  weekend_patterns: string;
  time_of_day_patterns: string;
  session_type: string;
}

export interface SpeculativeInterest {
  domain: string;
  reason: string;
  confidence: number;
  confirmation_count: number;
  confirmation_threshold: number;
  status: string;
  specifics: Array<{ name: string; confirmation_count: number }>;
}

export interface CognitionUpdate {
  summary: string;
  context_line: string;
  impact: string;
  reasoning: string;
  evidence: string;
  source: string;
  source_label: string;
  expand_hint: string;
  created_at: string;
}

export interface InsightHypothesis {
  hypothesis: string;
  evidence: string[];
  confidence: number;
  validated: boolean;
  created_at: string;
}

export interface AwarenessNote {
  date: string;
  observation: string;
  trend: string;
  emotion_guess: string;
}

export interface ProfileSummary {
  initialized: boolean;
  personality_portrait: string;
  core_traits: string[];
  deep_needs: string[];
  mbti: MBTIProfile;
  values: string[];
  motivational_drivers: string[];
  likes: InterestDomain[];
  dislikes: InterestDomain[];
  favorite_up_users: string[];
  life_stage: string;
  current_phase: string;
  cognitive_style: string[];
  style: StylePreference;
  context: ContextMode;
  exploration_openness: number;
  speculative_interests: SpeculativeInterest[];
  recent_cognition_updates: CognitionUpdate[];
  has_more_cognition_updates: boolean;
  next_cognition_cursor: string;
  active_insights: InsightHypothesis[];
  recent_awareness: AwarenessNote[];
}

export type ChatTurnStatus = "pending" | "completed" | "failed" | string;

export interface ChatTurn {
  turn_id: string;
  session: string;
  scope: string;
  subject_id: string;
  subject_title: string;
  message: string;
  reply: string;
  status: ChatTurnStatus;
  error: string;
  created_at: string;
  updated_at: string;
}

export interface ChatTurnListResponse {
  items: ChatTurn[];
}

export interface DelightCandidate {
  bvid: string;
  title: string;
  delight_reason: string;
  delight_score: number;
  delight_hook: string;
  cover_url: string;
  content_url: string;
  source_platform: string;
  state?: "pending" | "viewed" | "liked" | "rejected" | "chatted" | string;
  response_message?: string;
  chat_reply?: string;
}

export interface PendingDelightBatchResponse {
  items: DelightCandidate[];
}

export interface InterestProbeMessage {
  type: "interest.probe";
  domain: string;
  reason: string;
  category?: string;
  axis?: string;
  specifics: string[];
  message: string;
  state?: "pending" | "confirmed" | "rejected" | "chatted" | string;
  reply?: string;
}

export interface RuntimeEvent {
  type: string;
  phase?: string;
  message?: string;
  bvid?: string;
  title?: string;
  delight_reason?: string;
  delight_score?: number;
  delight_hook?: string;
  cover_url?: string;
  content_url?: string;
  source_platform?: string;
  domain?: string;
  reason?: string;
  category?: string;
  axis?: string;
  specifics?: string[];
  pool_available_count?: number;
  pool_target_count?: number;
  last_replenished_count?: number;
  last_discovered_count?: number;
  recent_pool_topics?: string[];
  [key: string]: unknown;
}

export interface ConfigSummary {
  degraded: boolean;
  degraded_reason: string;
  llm?: {
    default_provider?: string;
    openai_compatible?: {
      model?: string;
      base_url?: string;
      api_key?: string;
    };
  };
  scheduler?: {
    enabled?: boolean;
    pool_target_count?: number;
    pause_on_extension_disconnect?: boolean;
  };
  sources?: {
    xiaohongshu?: { enabled?: boolean };
    douyin?: { enabled?: boolean };
    youtube?: { enabled?: boolean };
  };
  issues?: Array<{ field: string; message: string; severity: string }>;
}

export interface ApiError extends Error {
  status?: number;
  details?: unknown;
}
