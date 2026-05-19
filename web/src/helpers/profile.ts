import type {
  CognitionUpdate,
  ContextMode,
  InterestDomain,
  MBTIProfile,
  ProfileSummary,
  SpeculativeInterest,
  StylePreference,
} from "../types";
import { asNumber, asText, clamp01, normalizeList } from "./format";

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" ? (value as LooseRecord) : {};
}

function normalizeSpecifics(value: unknown): Array<{ name: string; weight: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: asText(item?.name),
      weight: clamp01(asNumber(item?.weight, 0.5)),
    }))
    .filter((item) => item.name);
}

function normalizeInterestDomains(value: unknown): InterestDomain[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      domain: asText(item?.domain),
      weight: clamp01(asNumber(item?.weight, 0.5)),
      specifics: normalizeSpecifics(item?.specifics),
    }))
    .filter((item) => item.domain);
}

function normalizeMbti(value: unknown): MBTIProfile {
  const record = asRecord(value);
  const dimensions: MBTIProfile["dimensions"] = {};
  const rawDimensions = record.dimensions;
  if (rawDimensions && typeof rawDimensions === "object") {
    for (const [key, raw] of Object.entries(rawDimensions)) {
      const item = asRecord(raw);
      dimensions[key] = {
        pole: asText(item.pole),
        strength: clamp01(asNumber(item.strength, 0.5)),
      };
    }
  }
  return {
    type: asText(record.type),
    dimensions,
    confidence: clamp01(asNumber(record.confidence, 0)),
  };
}

function normalizeStyle(value: unknown): StylePreference {
  const record = asRecord(value);
  return {
    preferred_duration: asText(record.preferred_duration),
    preferred_pace: asText(record.preferred_pace),
    quality_sensitivity: clamp01(asNumber(record.quality_sensitivity, 0.5)),
    humor_preference: clamp01(asNumber(record.humor_preference, 0.5)),
    depth_preference: clamp01(asNumber(record.depth_preference, 0.5)),
  };
}

function normalizeContext(value: unknown): ContextMode {
  const record = asRecord(value);
  return {
    weekday_patterns: asText(record.weekday_patterns),
    weekend_patterns: asText(record.weekend_patterns),
    time_of_day_patterns: asText(record.time_of_day_patterns),
    session_type: asText(record.session_type),
  };
}

function normalizeSpeculativeInterests(value: unknown): SpeculativeInterest[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      domain: asText(item?.domain),
      reason: asText(item?.reason),
      confidence: clamp01(asNumber(item?.confidence, 0)),
      confirmation_count: asNumber(item?.confirmation_count, 0),
      confirmation_threshold: asNumber(item?.confirmation_threshold, 3),
      status: asText(item?.status, "active"),
      specifics: Array.isArray(item?.specifics)
        ? item.specifics
            .map((specific: unknown) => ({
              name: asText(asRecord(specific).name),
              confirmation_count: asNumber(
                asRecord(specific).confirmation_count,
              ),
            }))
            .filter((specific: { name: string }) => specific.name)
        : [],
    }))
    .filter((item) => item.domain);
}

function normalizeCognitionUpdates(value: unknown): CognitionUpdate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      summary: asText(item?.summary),
      context_line: asText(item?.context_line),
      impact: asText(item?.impact),
      reasoning: asText(item?.reasoning),
      evidence: asText(item?.evidence),
      source: asText(item?.source),
      source_label: asText(item?.source_label),
      expand_hint: asText(item?.expand_hint, "summary_only"),
      created_at: asText(item?.created_at),
    }))
    .filter((item) => item.summary);
}

export function normalizeProfileSummary(summary: Partial<ProfileSummary> | null): ProfileSummary {
  return {
    initialized: Boolean(summary?.initialized),
    personality_portrait:
      asText(summary?.personality_portrait) || "画像还在慢慢攒，先多看一阵。",
    core_traits: normalizeList(summary?.core_traits),
    deep_needs: normalizeList(summary?.deep_needs),
    mbti: normalizeMbti(summary?.mbti),
    values: normalizeList(summary?.values),
    motivational_drivers: normalizeList(summary?.motivational_drivers),
    likes: normalizeInterestDomains(summary?.likes),
    dislikes: normalizeInterestDomains(summary?.dislikes),
    favorite_up_users: normalizeList(summary?.favorite_up_users),
    life_stage: asText(summary?.life_stage),
    current_phase: asText(summary?.current_phase),
    cognitive_style: normalizeList(summary?.cognitive_style),
    style: normalizeStyle(summary?.style),
    context: normalizeContext(summary?.context),
    exploration_openness: clamp01(asNumber(summary?.exploration_openness, 0.5)),
    speculative_interests: normalizeSpeculativeInterests(summary?.speculative_interests),
    recent_cognition_updates: normalizeCognitionUpdates(summary?.recent_cognition_updates),
    has_more_cognition_updates: Boolean(summary?.has_more_cognition_updates),
    next_cognition_cursor: asText(summary?.next_cognition_cursor),
    active_insights: Array.isArray(summary?.active_insights)
      ? summary.active_insights
          .map((item) => ({
            hypothesis: asText(item?.hypothesis),
            evidence: normalizeList(item?.evidence),
            confidence: clamp01(asNumber(item?.confidence, 0.5)),
            validated: Boolean(item?.validated),
            created_at: asText(item?.created_at),
          }))
          .filter((item) => item.hypothesis)
      : [],
    recent_awareness: Array.isArray(summary?.recent_awareness)
      ? summary.recent_awareness
          .map((item) => ({
            date: asText(item?.date),
            observation: asText(item?.observation),
            trend: asText(item?.trend),
            emotion_guess: asText(item?.emotion_guess),
          }))
          .filter((item) => item.observation)
      : [],
  };
}
