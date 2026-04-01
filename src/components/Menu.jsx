import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/useStore";
import { customNanoid } from "../utils/nanoid";

const HACKATHON_ROOM = "hackathon";

const cardStyle = (accent) => ({
  background: "#1a1a2e",
  border: `2px solid ${accent}`,
  borderRadius: 14,
  padding: "24px 32px",
  cursor: "pointer",
  textAlign: "left",
  color: "#fff",
  width: 260,
  transition: "transform 0.1s, box-shadow 0.1s",
});

export default function Menu() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const setName = useAuthStore((s) => s.setName);
  const [privateRoom, setPrivateRoom] = useState("");
  const [hovered, setHovered] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  if (!currentUser) {
    navigate("/", { replace: true });
    return null;
  }

  const go = (roomId, team) => {
    const dest = team ? `/${roomId}?team=${team}` : `/${roomId}`;
    navigate(dest);
  };

  const handlePrivate = (e) => {
    e.preventDefault();
    const room = privateRoom.trim() || customNanoid(6);
    go(room);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        color: "#fff",
        gap: 32,
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 52, fontWeight: 800, margin: 0 }}>Vennball</h1>
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = nameInput.trim();
              if (n) setName(n);
              setEditingName(false);
            }}
            style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}
          >
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "1px solid #333",
                background: "#1a1a2e", color: "#fff", fontSize: 14, outline: "none",
              }}
            />
            <button type="submit" style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#2d8a4e", color: "#fff", cursor: "pointer" }}>Save</button>
            <button type="button" onClick={() => setEditingName(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#333", color: "#aaa", cursor: "pointer" }}>✕</button>
          </form>
        ) : (
          <p style={{ color: "#666", margin: "6px 0 0" }}>
            Welcome,{" "}
            <span style={{ color: "#aaa" }}>{currentUser.name}</span>
            <button
              onClick={() => { setNameInput(currentUser.name); setEditingName(true); }}
              style={{ marginLeft: 8, background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 12 }}
            >
              ✎ rename
            </button>
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>

        {/* Hackathon Lobby */}
        <button
          style={{
            ...cardStyle("#f39c12"),
            background: hovered === "hackathon" ? "#1f1f3a" : "#1a1a2e",
            boxShadow: hovered === "hackathon" ? "0 4px 24px rgba(243,156,18,0.25)" : "none",
            transform: hovered === "hackathon" ? "translateY(-2px)" : "none",
            width: 300,
          }}
          onMouseEnter={() => setHovered("hackathon")}
          onMouseLeave={() => setHovered(null)}
          onClick={() => go(HACKATHON_ROOM)}
        >
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            🏆 Hackathon Lobby
          </div>
          <div style={{ fontSize: 13, color: "#999" }}>
            Everyone at the hackathon plays here
          </div>
        </button>

        {/* Quick Play */}
        <button
          style={{
            ...cardStyle("#2d8a4e"),
            background: hovered === "quick" ? "#1a2a1f" : "#1a1a2e",
            boxShadow: hovered === "quick" ? "0 4px 24px rgba(45,138,78,0.25)" : "none",
            transform: hovered === "quick" ? "translateY(-2px)" : "none",
            width: 300,
          }}
          onMouseEnter={() => setHovered("quick")}
          onMouseLeave={() => setHovered(null)}
          onClick={() => go(customNanoid(6))}
        >
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            ⚡ Quick Play
          </div>
          <div style={{ fontSize: 13, color: "#999" }}>
            New private room — share URL to invite friends
          </div>
        </button>

        {/* Local 1v1 */}
        <button
          style={{
            ...cardStyle("#9b59b6"),
            background: hovered === "local" ? "#1f1a2a" : "#1a1a2e",
            boxShadow: hovered === "local" ? "0 4px 24px rgba(155,89,182,0.25)" : "none",
            transform: hovered === "local" ? "translateY(-2px)" : "none",
            width: 300,
          }}
          onMouseEnter={() => setHovered("local")}
          onMouseLeave={() => setHovered(null)}
          onClick={() => navigate("/local")}
        >
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            🎮 Local 1v1
          </div>
          <div style={{ fontSize: 13, color: "#999" }}>
            Same keyboard — WASD vs Arrow keys
          </div>
        </button>

        {/* Private Room */}
        <form
          onSubmit={handlePrivate}
          style={{
            ...cardStyle("#3498db"),
            background: hovered === "private" ? "#1a1f2a" : "#1a1a2e",
            width: 300,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
          onMouseEnter={() => setHovered("private")}
          onMouseLeave={() => setHovered(null)}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>🔒 Private Room</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={privateRoom}
              onChange={(e) => setPrivateRoom(e.target.value)}
              placeholder="Room name…"
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #333",
                background: "#0f1923",
                color: "#fff",
                fontSize: 14,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#3498db",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Join
            </button>
          </div>
        </form>
      </div>

      <button
        onClick={() => { logout(); navigate("/"); }}
        style={{
          background: "none",
          border: "none",
          color: "#555",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Log out
      </button>
    </div>
  );
}
