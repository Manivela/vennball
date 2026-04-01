import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 4444;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map(); // room -> Map<id, ws>

let nextId = 1;

wss.on("connection", (ws, req) => {
  const room = new URL(req.url, "http://x").searchParams.get("room");
  if (!room) { ws.close(4001, "missing ?room="); return; }

  const id = nextId++;
  if (!rooms.has(room)) rooms.set(room, new Map());
  const peers = rooms.get(room);
  peers.set(id, ws);

  // Tell this client its ID and current peer list
  ws.send(JSON.stringify({ type: "welcome", id, peers: [...peers.keys()].filter(k => k !== id) }));

  // Tell existing peers about the new joiner
  broadcast(peers, id, { type: "join", id });

  ws.on("message", (raw) => {
    // Fan out to all other peers in the room — O(n) total
    const msg = raw.toString();
    peers.forEach((peer, peerId) => {
      if (peerId !== id && peer.readyState === 1) peer.send(msg);
    });
  });

  ws.on("close", () => {
    peers.delete(id);
    broadcast(peers, id, { type: "leave", id });
    if (peers.size === 0) rooms.delete(room);
  });
});

function broadcast(peers, excludeId, obj) {
  const msg = JSON.stringify(obj);
  peers.forEach((peer, id) => {
    if (id !== excludeId && peer.readyState === 1) peer.send(msg);
  });
}

console.log(`Relay server on ws://localhost:${PORT}`);
