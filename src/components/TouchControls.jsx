import { useEffect, useRef } from "react";

const JOYSTICK_R = 40;
const KNOB_R = 20;
const MAX_DIST = JOYSTICK_R - KNOB_R;
const KICK_R = 30;

function useJoystick(elRef, gs, stateKey) {
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const S = JOYSTICK_R * 2 + 4;
    el.width = S;
    el.height = S;
    const ctx = el.getContext("2d");
    const cx = S / 2, cy = S / 2;
    let touchId = null, tcx = 0, tcy = 0;

    const drawIdle = () => {
      ctx.clearRect(0, 0, S, S);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, JOYSTICK_R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath(); ctx.arc(cx, cy, KNOB_R, 0, Math.PI * 2); ctx.fill();
    };

    const drawKnob = (dx, dy) => {
      ctx.clearRect(0, 0, S, S);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, JOYSTICK_R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath(); ctx.arc(cx + dx, cy + dy, KNOB_R, 0, Math.PI * 2); ctx.fill();
    };

    const update = (tx, ty) => {
      let dx = tx - tcx, dy = ty - tcy;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_DIST) { dx = (dx / dist) * MAX_DIST; dy = (dy / dist) * MAX_DIST; }
      gs.current[stateKey] = { dx: dx / MAX_DIST, dy: dy / MAX_DIST };
      drawKnob(dx, dy);
    };

    const onStart = (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const r = el.getBoundingClientRect();
      touchId = t.identifier;
      tcx = r.left + r.width / 2;
      tcy = r.top + r.height / 2;
      update(t.clientX, t.clientY);
    };
    const onMove = (e) => {
      e.preventDefault();
      const t = Array.from(e.changedTouches).find(c => c.identifier === touchId);
      if (t) update(t.clientX, t.clientY);
    };
    const onEnd = (e) => {
      e.preventDefault();
      if (!Array.from(e.touches).find(c => c.identifier === touchId)) {
        touchId = null;
        gs.current[stateKey] = { dx: 0, dy: 0 };
        drawIdle();
      }
    };

    drawIdle();
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [gs, stateKey]); // eslint-disable-line
}

function useKickButton(elRef, gs, stateKey) {
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    el.width = KICK_R * 2 + 4;
    el.height = KICK_R * 2 + 4;
    const ctx = el.getContext("2d");
    const R = KICK_R;

    const draw = (active) => {
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.fillStyle = active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.arc(R + 2, R + 2, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = active ? "#fff" : "rgba(255,255,255,0.7)";
      ctx.font = `bold ${R * 0.55}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("KICK", R + 2, R + 2);
    };

    draw(false);
    const onStart = (e) => { e.preventDefault(); gs.current[stateKey] = true; draw(true); };
    const onEnd   = (e) => { e.preventDefault(); gs.current[stateKey] = false; draw(false); };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchend",   onEnd,   { passive: false });
    el.addEventListener("touchcancel",onEnd,   { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend",   onEnd);
      el.removeEventListener("touchcancel",onEnd);
    };
  }, [gs, stateKey]); // eslint-disable-line
}

const rowStyle = (pos) => ({
  position: "fixed",
  [pos]: 0,
  left: 0,
  width: "100%",
  height: "12vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 20px",
  pointerEvents: "none",
  zIndex: 10,
});

const canvasStyle = { pointerEvents: "auto", touchAction: "none" };

export default function TouchControls({ gs, localMode = false }) {
  const p1JoyRef  = useRef(null);
  const p1KickRef = useRef(null);
  const p2JoyRef  = useRef(null);
  const p2KickRef = useRef(null);

  useJoystick(p1JoyRef,  gs, "joystick");
  useKickButton(p1KickRef, gs, "touchKick");
  useJoystick(p2JoyRef,  gs, "joystick2");
  useKickButton(p2KickRef, gs, "touchKick2");

  if (localMode) {
    return (
      <>
        {/* P2 controls — top of screen, rotated 180° so it reads right for P2 */}
        <div style={{ ...rowStyle("top"), transform: "rotate(180deg)" }}>
          <canvas ref={p2JoyRef}  style={canvasStyle} />
          <canvas ref={p2KickRef} style={canvasStyle} />
        </div>
        {/* P1 controls — bottom of screen */}
        <div style={rowStyle("bottom")}>
          <canvas ref={p1JoyRef}  style={canvasStyle} />
          <canvas ref={p1KickRef} style={canvasStyle} />
        </div>
      </>
    );
  }

  return (
    <div style={rowStyle("bottom")}>
      <canvas ref={p1JoyRef}  style={canvasStyle} />
      <canvas ref={p1KickRef} style={canvasStyle} />
    </div>
  );
}
