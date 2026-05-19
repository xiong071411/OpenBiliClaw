import type {
  ActivityFeed,
  ChatTurn,
  ConfigSummary,
  DelightCandidate,
  HealthResponse,
  InterestProbeMessage,
  ProfileSummary,
  Recommendation,
  RouteId,
  RuntimeEvent,
  RuntimeStatus,
} from "./types";
import { routeFromHash } from "./router";

export interface ToastState {
  message: string;
  tone: "info" | "success" | "error";
}

export interface AppState {
  route: RouteId;
  online: boolean;
  streamOnline: boolean;
  booted: boolean;
  health: HealthResponse | null;
  runtimeStatus: RuntimeStatus | null;
  runtimeEvent: RuntimeEvent | null;
  recommendations: Recommendation[];
  profile: ProfileSummary | null;
  chatTurns: ChatTurn[];
  delights: DelightCandidate[];
  probes: InterestProbeMessage[];
  activityFeed: ActivityFeed | null;
  config: ConfigSummary | null;
  feedbackStatus: Record<number, string>;
  actionBusy: Record<string, boolean>;
  errors: Record<string, string>;
  toast: ToastState | null;
}

const initialState: AppState = {
  route: routeFromHash(),
  online: false,
  streamOnline: false,
  booted: false,
  health: null,
  runtimeStatus: null,
  runtimeEvent: null,
  recommendations: [],
  profile: null,
  chatTurns: [],
  delights: [],
  probes: [],
  activityFeed: null,
  config: null,
  feedbackStatus: {},
  actionBusy: {},
  errors: {},
  toast: null,
};

type Listener = (state: AppState) => void;

export class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();

  getState(): AppState {
    return this.state;
  }

  setState(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  update(updater: (state: AppState) => AppState): void {
    this.state = updater(this.state);
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

export const store = new Store();
