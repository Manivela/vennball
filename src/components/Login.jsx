import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../hooks/useStore";
import { customNanoid } from "../utils/nanoid";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const currentUser = useAuthStore((s) => s.currentUser);

  const paramName = searchParams.get("name");
  const paramRoom = searchParams.get("room");
  const paramTeam = searchParams.get("team");

  // Auto-login from ?name=X&room=Y&team=Z — takes priority over existing session
  useEffect(() => {
    if (!paramName) return;
    login({ id: customNanoid(), name: paramName });
    const room = paramRoom || customNanoid(6);
    const dest = paramTeam ? `/${room}?team=${paramTeam}` : `/${room}`;
    navigate(dest, { replace: true });
  }, []); // eslint-disable-line

  if (currentUser && !paramName) {
    setTimeout(() => navigate("/menu"), 0);
    return null;
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = e.target.username.value.trim();
    if (!name) return;
    login({ id: customNanoid(), name });
    navigate("/menu");
  };

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
          padding: "10px 24px",
          borderRadius: 8,
          border: "2px solid #9b59b6",
          background: "transparent",
          color: "#9b59b6",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        🎮 Local 1v1 (no login needed)
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
