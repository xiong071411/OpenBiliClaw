import { API_BASE } from "./api";
import type { RuntimeEvent } from "./types";

export function createRuntimeStreamUrl(apiBase = API_BASE): string {
  const normalized = apiBase.replace(/\/$/, "");
  let url: URL;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    url = new URL(`${normalized}/runtime-stream`);
  } else {
    url = new URL(`${normalized}/runtime-stream`, window.location.origin);
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("client", "web");
  return url.toString();
}

export function createRuntimeStreamClient({
  WebSocketImpl = window.WebSocket,
  reconnectDelayMs = 2000,
  maxReconnectDelayMs = 30_000,
  onEvent,
  onConnect,
  onDisconnect,
}: {
  WebSocketImpl?: typeof WebSocket;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onEvent: (event: RuntimeEvent) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let stopped = false;
  let currentDelay = reconnectDelayMs;
  let connected = false;

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer !== null) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, currentDelay);
    currentDelay = Math.min(currentDelay * 2, maxReconnectDelayMs);
  }

  function connect(): void {
    if (stopped || typeof WebSocketImpl !== "function") return;
    try {
      socket = new WebSocketImpl(createRuntimeStreamUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    socket.onopen = () => {
      connected = true;
      currentDelay = reconnectDelayMs;
      onConnect();
    };
    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(String(message.data)) as RuntimeEvent);
      } catch {
        // Ignore malformed stream events and keep the live connection.
      }
    };
    socket.onclose = () => {
      socket = null;
      if (connected) {
        connected = false;
        onDisconnect();
      }
      scheduleReconnect();
    };
    socket.onerror = () => {
      socket?.close();
    };
  }

  function disconnect(): void {
    stopped = true;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close();
    socket = null;
  }

  return { connect, disconnect };
}
