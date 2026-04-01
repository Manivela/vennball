import { useRef, useEffect } from "react";

/**
 * Connects to the authoritative game server. Replaces y-webrtc entirely.
 * - Client sends inputs (direction + kick) every frame
 * - Server runs physics at 60fps, sends snapshots at 20Hz
 * - Client just renders the snapshot (with interpolation for smoothness)
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "wss://vennball-server.fly.dev";

const cache = new Map();

function createConnection(roomId) {
  let ws = null;
  let myId = null;
  let closed = false;
  let reconnectTimer = null;
  const listeners = new Set();
  const states = new Map();

  function fire() { listeners.forEach(fn => fn()); }

  function connect() {
    if (closed) return;
    ws = new WebSocket(`${SERVER_URL}?room=${encodeURIComponent(roomId)}`);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "welcome") {
          myId = msg.id;
          return;
        }
        if (msg.type === "snapshot") {
          // Store as a special "server" state — Game.jsx reads this
          states.set("__snapshot", msg);
          fire();
          return;
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      if (!closed) reconnectTimer = setTimeout(connect, 1000);
    };
    ws.onerror = () => ws.close();
  }

  connect();

  return {
    get clientID() { return myId; },
    get ws() { return ws; },
    states,
    send(obj) {
      if (ws?.readyState === 1) ws.send(JSON.stringify(obj));
    },
    on(event, fn) { if (event === "change") listeners.add(fn); },
    off(event, fn) { if (event === "change") listeners.delete(fn); },
    destroy() {
      closed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

export function useGameServer(roomId) {
  const ref = useRef(null);

  if (!ref.current && roomId) {
    if (cache.has(roomId)) {
      ref.current = cache.get(roomId);
    } else {
      const conn = createConnection(roomId);
      cache.set(roomId, conn);
      ref.current = conn;
    }
  }

  useEffect(() => () => {}, []);

  return ref.current;
}
