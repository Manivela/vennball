import { useRef, useEffect } from "react";

/**
 * Drop-in replacement for useWebRtcProvider that routes through a WebSocket
 * relay server instead of a WebRTC mesh.  Exposes the same `awareness`-like
 * API so Game.jsx needs minimal changes.
 *
 * Traffic per client: 1 send + 1 receive per broadcast (O(n) total via server
 * fan-out), vs O(n²) in a mesh.
 */

const RELAY_URL = import.meta.env.VITE_RELAY_URL || "wss://vennball-relay.fly.dev";

// Cache per room so React strict-mode double-mounts don't double-connect
const relays = new Map();

function createRelay(roomId) {
  const states = new Map();     // peerId -> state
  const listeners = new Set();  // "change" callbacks
  let localId = null;
  let localState = null;
  let ws = null;
  let reconnectTimer = null;
  let closed = false;

  function fire() { listeners.forEach((fn) => fn()); }

  function connect() {
    if (closed) return;
    ws = new WebSocket(`${RELAY_URL}?room=${encodeURIComponent(roomId)}`);

    ws.onopen = () => {
      // Re-send local state on reconnect
      if (localState) ws.send(JSON.stringify({ type: "state", id: localId, state: localState }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "welcome") {
          localId = msg.id;
          awareness.clientID = localId;
          return;
        }
        if (msg.type === "leave") {
          states.delete(msg.id);
          fire();
          return;
        }
        if (msg.type === "state" && msg.id != null) {
          states.set(msg.id, msg.state);
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

  const awareness = {
    clientID: 0,

    getStates() {
      // Return a Map that includes both local and remote states (same as y-webrtc awareness)
      const all = new Map(states);
      if (localId != null && localState) all.set(localId, localState);
      return all;
    },

    setLocalState(state) {
      localState = state;
      if (localId != null) {
        states.set(localId, state);
      }
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: "state", id: localId, state }));
      }
    },

    on(event, fn) {
      if (event === "change") listeners.add(fn);
    },
    off(event, fn) {
      if (event === "change") listeners.delete(fn);
    },
  };

  connect();

  return {
    awareness,
    destroy() {
      closed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
      states.clear();
      listeners.clear();
    },
  };
}

export function useRelayProvider(roomId) {
  const ref = useRef(null);

  if (!ref.current && roomId) {
    if (relays.has(roomId)) {
      ref.current = relays.get(roomId);
    } else {
      const entry = createRelay(roomId);
      relays.set(roomId, entry);
      ref.current = entry;
    }
  }

  useEffect(() => {
    return () => {
      // Keep alive — other components may share
    };
  }, []);

  return ref.current ? { awareness: ref.current.awareness } : null;
}
