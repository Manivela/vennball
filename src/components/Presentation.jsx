import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/* --- Turkey / World Cup palette --- */
const C = {
  red: "#E30A17",       // Turkish flag red
  white: "#FFFFFF",
  gold: "#D4AF37",      // World Cup gold
  goldLight: "#F4D03F",
  dark: "#1a0a0a",      // deep dark red-black
  darkCard: "rgba(227,10,23,0.08)",
  cardBorder: "rgba(212,175,55,0.25)",
  muted: "#c4a882",     // warm muted text
  bg: "linear-gradient(160deg, #1a0a0a 0%, #2d0e10 40%, #1a0a0a 100%)",
};

const slides = [
  {
    type: "title",
    title: "Vennball",
    subtitle:
      "Multiplayer football in your browser.\nNo downloads. No sign-ups. Just share a link and play.",
    features: [
      {
        icon: "\u26BD",
        title: "Real-time Football",
        desc: "Fast-paced matches with smooth ball physics, kicks, and goals",
      },
      {
        icon: "\uD83C\uDF10",
        title: "Play with Anyone",
        desc: "Send a link to your friends and start playing instantly",
      },
      {
        icon: "\uD83D\uDCF1",
        title: "Phone or PC",
        desc: "Touch controls on mobile, keyboard on desktop. Works everywhere",
      },
    ],
  },
  {
    type: "screenshot",
    title: "Jump Right In",
    subtitle:
      "Pick a name and jump into a match. No account needed.",
    img: "/slides/01_login_screen.png",
  },
  {
    type: "modes",
    title: "So Many Ways to Play",
    subtitle: "One game, every setup.",
    modes: [
      {
        icon: "\uD83D\uDDA5\uFE0F",
        title: "Local 1v1 — Desktop",
        desc: "Two players, one keyboard. Player 1 uses WASD + Space, Player 2 uses Arrow keys + Enter.",
      },
      {
        icon: "\uD83D\uDCF1",
        title: "Local 1v1 — Mobile",
        desc: "Two players, one phone. Each player gets their own joystick and kick button on the screen.",
      },
      {
        icon: "\uD83C\uDF10",
        title: "Online — Private Room",
        desc: "Create a room and share the link. Each player joins on their own phone or computer.",
      },
      {
        icon: "\u26A1",
        title: "Online — Quick Play",
        desc: "Instant private room with a random code. Share the URL and you're in a match in seconds.",
      },
      {
        icon: "\uD83C\uDFC6",
        title: "Hackathon Lobby",
        desc: "One big shared room for everyone. Jump in and join whichever team needs players.",
      },
    ],
  },
  {
    type: "screenshot",
    title: "Pick Your Team",
    subtitle:
      "Join Red or Blue. See your teammates appear in real-time. Share the invite link to bring friends into the match.",
    img: "/slides/03_team_selection.png",
  },
  {
    type: "screenshot",
    title: "Kick Off!",
    subtitle:
      "A full football pitch with goals, penalty areas, and a center circle. The timer starts when you make your first kick.",
    img: "/slides/04_local_1v1_kickoff.png",
  },
  {
    type: "screenshot",
    title: "In the Action",
    subtitle:
      "Move your player, chase the ball, and kick it toward the goal. Simple controls, exciting matches.",
    img: "/slides/05_gameplay_action.png",
  },
  {
    type: "screenshot",
    title: "Realistic Ball Movement",
    subtitle:
      "The ball bounces off walls and players, slows down naturally, and reacts to every kick. Position yourself well to take the perfect shot.",
    img: "/slides/06_gameplay_midfield.png",
  },
  {
    type: "screenshot",
    title: "Goal!",
    subtitle:
      "The scoreboard updates instantly. After every goal, players reset to their starting positions for a fresh kickoff.",
    img: "/slides/07_goal_scored.png",
  },
  {
    type: "mobile",
    title: "Play on Your Phone",
    subtitle:
      "On-screen joystick to move, KICK button to shoot. In local mode, the pitch rotates and both players get their own controls.",
    imgOnline: "/slides/11_mobile_online.png",
    imgLocal: "/slides/09_mobile_portrait.png",
  },
  {
    type: "screenshot",
    title: "Full Time!",
    subtitle:
      'When the clock runs out, see the final score and the winning team. Hit "Play Again" for an instant rematch.',
    img: "/slides/10_full_time.png",
  },
  {
    type: "built",
  },
  {
    type: "tryit",
  },
  {
    type: "goodluck",
  },
];

/* ---- Turkish crescent + star SVG (used as bg decoration) ---- */
function Crescent({ style }) {
  return (
    <svg
      viewBox="0 0 200 200"
      style={{
        position: "absolute",
        opacity: 0.03,
        pointerEvents: "none",
        ...style,
      }}
    >
      <circle cx="90" cy="100" r="70" fill={C.white} />
      <circle cx="110" cy="100" r="55" fill={C.dark} />
      <polygon
        points="155,100 170,90 163,105 178,112 162,112 155,128 152,112 136,110 150,103 148,88"
        fill={C.white}
      />
    </svg>
  );
}

/* ---- Gold trophy divider ---- */
function TrophyDivider() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "8px 0 4px",
        opacity: 0.5,
      }}
    >
      <div
        style={{
          width: 60,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${C.gold})`,
        }}
      />
      <span style={{ fontSize: 18, color: C.gold }}>{"\uD83C\uDFC6"}</span>
      <div
        style={{
          width: 60,
          height: 1,
          background: `linear-gradient(90deg, ${C.gold}, transparent)`,
        }}
      />
    </div>
  );
}

const s = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: C.bg,
    color: C.white,
    fontFamily: "system-ui, -apple-system, sans-serif",
    overflow: "hidden",
  },
  slide: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    padding: "40px 24px",
    animation: "vb-fade .4s ease",
    position: "relative",
    zIndex: 1,
  },
  h1: {
    fontSize: 64,
    fontWeight: 900,
    marginBottom: 4,
    background: `linear-gradient(135deg, ${C.red}, ${C.goldLight})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: -1,
  },
  h2: {
    fontSize: 38,
    fontWeight: 700,
    marginBottom: 12,
    textAlign: "center",
    background: `linear-gradient(135deg, ${C.white}, ${C.gold})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  sub: {
    fontSize: 20,
    color: C.muted,
    marginBottom: 32,
    textAlign: "center",
    maxWidth: 700,
    lineHeight: 1.5,
    whiteSpace: "pre-line",
  },
  img: {
    maxWidth: "85%",
    maxHeight: "55vh",
    borderRadius: 12,
    boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${C.red}22, 0 0 80px ${C.red}11`,
    border: `2px solid ${C.gold}30`,
  },
  cards: {
    display: "flex",
    gap: 32,
    marginTop: 32,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  card: {
    background: C.darkCard,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 12,
    padding: "20px 28px",
    maxWidth: 260,
    textAlign: "center",
    backdropFilter: "blur(4px)",
  },
  cardIcon: { fontSize: 32, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: 700, marginBottom: 6, color: C.gold },
  cardDesc: { fontSize: 14, color: C.muted, lineHeight: 1.4 },
  nav: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 16,
    zIndex: 100,
  },
  btn: {
    background: `${C.red}33`,
    border: `1px solid ${C.red}55`,
    color: C.white,
    width: 44,
    height: 44,
    borderRadius: "50%",
    fontSize: 18,
    cursor: "pointer",
    transition: "background .2s",
  },
  dots: {
    position: "fixed",
    bottom: 80,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 8,
    zIndex: 100,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.15)",
    cursor: "pointer",
    transition: "all .2s",
  },
  dotActive: {
    width: 24,
    height: 8,
    borderRadius: 4,
    background: C.red,
    cursor: "pointer",
    transition: "all .2s",
  },
  back: {
    position: "fixed",
    top: 16,
    left: 20,
    background: `${C.red}33`,
    border: `1px solid ${C.red}55`,
    color: C.white,
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    zIndex: 100,
    transition: "background .2s",
  },
  /* top red accent bar */
  topBar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: `linear-gradient(90deg, ${C.red}, ${C.gold}, ${C.red})`,
    zIndex: 200,
  },
};

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={s.card}>
      <div style={s.cardIcon}>{icon}</div>
      <div style={s.cardTitle}>{title}</div>
      <div style={s.cardDesc}>{desc}</div>
    </div>
  );
}

export default function Presentation() {
  const [cur, setCur] = useState(0);
  const navigate = useNavigate();
  const total = slides.length;

  const go = useCallback(
    (dir) => setCur((c) => Math.max(0, Math.min(total - 1, c + dir))),
    [total]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const slide = slides[cur];

  return (
    <div style={s.wrap}>
      <style>{`
        @keyframes vb-fade{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Top accent bar */}
      <div style={s.topBar} />

      {/* Background crescent decorations */}
      <Crescent style={{ width: 500, top: -80, right: -120 }} />
      <Crescent style={{ width: 400, bottom: -60, left: -100 }} />

      <button style={s.back} onClick={() => navigate("/")}>
        &larr; Back
      </button>

      <div key={cur} style={s.slide}>
        {slide.type === "title" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{"\uD83C\uDFC6"}</div>
            <h1 style={s.h1}>{slide.title}</h1>
            <TrophyDivider />
            <div style={s.sub}>{slide.subtitle}</div>
            <div style={s.cards}>
              {slide.features.map((f) => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          </>
        )}

        {slide.type === "mobile" && (
          <>
            <h2 style={s.h2}>{slide.title}</h2>
            <TrophyDivider />
            <div style={s.sub}>{slide.subtitle}</div>
            <div style={{ display: "flex", gap: 32, alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <img src={slide.imgOnline} alt="Online mobile" style={{ ...s.img, maxHeight: "52vh", maxWidth: 220 }} />
                <div style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>Online</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <img src={slide.imgLocal} alt="Local mobile" style={{ ...s.img, maxHeight: "52vh", maxWidth: 220 }} />
                <div style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>Local 1v1</div>
              </div>
            </div>
          </>
        )}

        {slide.type === "modes" && (
          <>
            <h2 style={s.h2}>{slide.title}</h2>
            <TrophyDivider />
            <div style={{ ...s.sub, marginBottom: 24 }}>{slide.subtitle}</div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              maxWidth: 900,
              width: "100%",
            }}>
              {slide.modes.map((m) => (
                <div key={m.title} style={{
                  ...s.card,
                  maxWidth: "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{m.icon}</div>
                  <div style={{ ...s.cardTitle, fontSize: 16 }}>{m.title}</div>
                  <div style={{ ...s.cardDesc, fontSize: 13 }}>{m.desc}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {slide.type === "built" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{"\uD83D\uDEE0\uFE0F"}</div>
            <h2 style={s.h2}>Built at the Hackathon</h2>
            <TrophyDivider />
            <div style={{
              display: "flex",
              gap: 40,
              marginTop: 32,
              flexWrap: "wrap",
              justifyContent: "center",
            }}>
              {[
                { val: "1", label: "Developer" },
                { val: "3", label: "AI Agents" },
                { val: "4h", label: "Building" },
                { val: "4h", label: "Optimization" },
                { val: "~1500", label: "Lines of Code" },
                { val: "$80", label: "Total AI Cost" },
                { val: "0", label: "Servers Needed" },
              ].map((s2) => (
                <div key={s2.label} style={{ textAlign: "center", minWidth: 120 }}>
                  <div style={{ fontSize: 44, fontWeight: 900, color: C.gold }}>{s2.val}</div>
                  <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>{s2.label}</div>
                </div>
              ))}
            </div>
            <div style={{
              ...s.sub,
              marginTop: 40,
              fontSize: 18,
              maxWidth: 600,
            }}>
              Real-time multiplayer, ball physics, mobile controls, and online play — all from scratch in a single hackathon.
            </div>
          </>
        )}

        {slide.type === "tryit" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{"\uD83D\uDCF2"}</div>
            <h2 style={{
              ...s.h2,
              fontSize: 48,
              background: `linear-gradient(135deg, ${C.goldLight}, ${C.white})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Try It Now!
            </h2>
            <TrophyDivider />
            <div style={{ ...s.sub, fontSize: 22, marginBottom: 24 }}>
              Open this on your phone and join the Hackathon Lobby
            </div>
            <div style={{
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
            }}>
              <img
                src={"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://vennball.vercel.app/hackathon"}
                alt="QR Code"
                style={{ width: 200, height: 200, display: "block" }}
              />
            </div>
            <a
              href="https://vennball.vercel.app/hackathon"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 22,
                color: C.goldLight,
                fontWeight: 700,
                textDecoration: "none",
                borderBottom: `2px solid ${C.gold}55`,
                paddingBottom: 2,
              }}
            >
              vennball.vercel.app
            </a>
            <div style={{
              ...s.sub,
              marginTop: 24,
              fontSize: 16,
              opacity: 0.7,
            }}>
              Pick a name, choose a team, and let's play!
            </div>
          </>
        )}

        {slide.type === "goodluck" && (
          <>
            <Crescent style={{ width: 120, position: "relative", opacity: 0.6, marginBottom: 8 }} />
            <h2 style={{
              ...s.h2,
              fontSize: 48,
              background: `linear-gradient(135deg, ${C.red}, ${C.white}, ${C.red})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Good Luck T{"\u00FC"}rkiye!
            </h2>
            <TrophyDivider />
            <div style={{ ...s.sub, fontSize: 24, maxWidth: 600 }}>
              Wishing our national team all the best at the World Cup 2026
            </div>
            <div style={{ fontSize: 48, marginTop: 8 }}>
              {"\u26BD"} {"\uD83C\uDFC6"} {"\u26BD"}
            </div>
            <div style={{
              marginTop: 32,
              fontSize: 16,
              color: C.muted,
              opacity: 0.7,
            }}>
              Haydi T{"\u00FC"}rkiye! Bizim i{"\u00E7"}in oyna!
            </div>
          </>
        )}

        {slide.type === "screenshot" && (
          <>
            <h2 style={s.h2}>{slide.title}</h2>
            <TrophyDivider />
            <div style={s.sub}>{slide.subtitle}</div>
            <img
              src={slide.img}
              alt={slide.title}
              style={{
                ...s.img,
                ...(slide.tall ? { maxHeight: "60vh" } : {}),
              }}
            />
          </>
        )}
      </div>

      {/* Dots */}
      <div style={s.dots}>
        {slides.map((_, i) => (
          <div
            key={i}
            style={i === cur ? s.dotActive : s.dot}
            onClick={() => setCur(i)}
          />
        ))}
      </div>

      {/* Nav */}
      <div style={s.nav}>
        <button
          style={{ ...s.btn, opacity: cur === 0 ? 0.3 : 1 }}
          onClick={() => go(-1)}
          disabled={cur === 0}
        >
          &larr;
        </button>
        <span
          style={{
            fontSize: 14,
            color: C.muted,
            minWidth: 60,
            textAlign: "center",
          }}
        >
          {cur + 1} / {total}
        </span>
        <button
          style={{ ...s.btn, opacity: cur === total - 1 ? 0.3 : 1 }}
          onClick={() => go(1)}
          disabled={cur === total - 1}
        >
          &rarr;
        </button>
      </div>
    </div>
  );
}
