import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../hooks/useStore";
import { customNanoid } from "../utils/nanoid";

const HACKATHON_ROOM = "hackathon";

const cardStyle = (accent) => ({
  background: "#1a1a2e",
  border: `2px solid ${accent}`,
  borderRadius: 14,
  padding: "24px 32px",
  boxSizing: "border-box",
  cursor: "pointer",
  textAlign: "left",
  color: "#fff",
  width: 260,
  transition: "transform 0.1s, box-shadow 0.1s",
});

const privateRoomPanelStyle = {
  background: "#1a1a2e",
  border: "2px solid #3498db",
  borderRadius: 14,
  padding: "24px 32px",
  boxSizing: "border-box",
  cursor: "default",
  textAlign: "left",
  color: "#fff",
  width: 300,
  maxWidth: "100%",
};

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const setName = useAuthStore((s) => s.setName);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [privateRoom, setPrivateRoom] = useState("");
  const [hovered, setHovered] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const paramName = searchParams.get("name");
  const paramRoom = searchParams.get("room");
  const paramTeam = searchParams.get("team");

  // Auto-login from ?name=X&room=Y&team=Z
  useEffect(() => {
    if (!paramName) return;
    login({ id: customNanoid(), name: paramName });
    const room = paramRoom || customNanoid(6);
    const dest = paramTeam ? `/${room}?team=${paramTeam}` : `/${room}`;
    navigate(dest, { replace: true });
  }, []); // eslint-disable-line

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = e.target.username.value.trim();
    if (!name) return;
    login({ id: customNanoid(), name });
  };

  const go = (roomId, team) => {
    const dest = team ? `/${roomId}?team=${team}` : `/${roomId}`;
    navigate(dest);
  };

  const handlePrivate = (e) => {
    e.preventDefault();
    const room = privateRoom.trim() || customNanoid(6);
    go(room);
  };

  // ── Menu (logged in) ─────────────────────────────────────────────
  if (currentUser) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          boxSizing: "border-box",
          height: "100dvh",
          maxHeight: "100dvh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          color: "#fff",
          gap: 32,
          padding: 24,
          paddingTop: "max(24px, env(safe-area-inset-top))",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
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
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🏆 Hackathon Lobby</div>
            <div style={{ fontSize: 13, color: "#999" }}>Everyone at the hackathon plays here</div>
          </button>

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
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>⚡ Quick Play</div>
            <div style={{ fontSize: 13, color: "#999" }}>New private room — share URL to invite friends</div>
          </button>

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
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🎮 Local 1v1</div>
            <div style={{ fontSize: 13, color: "#999" }}>
              One keyboard — WASD vs arrows; on mobile use touch + kick
            </div>
          </button>

          <div style={privateRoomPanelStyle}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>🔒 Private Room</div>
            <form
              onSubmit={handlePrivate}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: "100%",
              }}
            >
              <input
                value={privateRoom}
                onChange={(e) => setPrivateRoom(e.target.value)}
                placeholder="Room name…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
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
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 16px",
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
            </form>
          </div>
        </div>

        <button
          onClick={() => { logout(); }}
          style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 13 }}
        >
          Log out
        </button>
      </div>
    );
  }

  // ── Login ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: "#fff",
        gap: 24,
      }}
    >
      <h1 style={{ fontSize: 48, fontWeight: 800 }}>Vennball</h1>
      <p style={{ color: "#888" }}>P2P Football</p>
      <button
        type="button"
        onClick={() => navigate("/local")}
        style={{
          ...cardStyle("#9b59b6"),
          background: hovered === "local" ? "#1f1a2a" : "#1a1a2e",
          boxShadow: hovered === "local" ? "0 4px 24px rgba(155,89,182,0.25)" : "none",
          transform: hovered === "local" ? "translateY(-2px)" : "none",
          width: 300,
        }}
        onMouseEnter={() => setHovered("local")}
        onMouseLeave={() => setHovered(null)}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🎮 Local 1v1</div>
        <div style={{ fontSize: 13, color: "#999" }}>
          One keyboard — WASD vs arrows; on mobile use touch + kick
        </div>
      </button>
      <div style={{ color: "#444", fontSize: 13 }}>— or enter a name for online play —</div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          name="username"
          placeholder="Your name"
          required
          autoFocus
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "#1a1a2e",
            color: "#fff",
            fontSize: 16,
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: "#2d8a4e",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Play
        </button>
      </form>
    </div>
  );
}
