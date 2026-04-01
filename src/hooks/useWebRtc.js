import { useRef, useEffect } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { signalingServers, iceServers } from "../constants";

// Cache providers by room so multiple hooks in the same room share one connection
const providers = new Map();

export function useWebRtcProvider(roomId) {
  const ref = useRef(null);

  if (!ref.current && roomId) {
    if (providers.has(roomId)) {
      ref.current = providers.get(roomId);
    } else {
      const doc = new Y.Doc();
      const provider = new WebrtcProvider(roomId, doc, {
        signaling: signalingServers,
        peerOpts: { config: { iceServers } },
      });
      const entry = { doc, provider, awareness: provider.awareness };
      providers.set(roomId, entry);
      ref.current = entry;
    }
  }

  useEffect(() => {
    return () => {
      // Don't destroy on unmount — other components may share it
    };
  }, []);

  return ref.current;
}
