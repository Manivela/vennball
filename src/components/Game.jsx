import { useRef, useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useWebRtcProvider } from "../hooks/useWebRtc";
import TouchControls from "./TouchControls";
import { useAuthStore } from "../hooks/useStore";
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  GOAL_HEIGHT,
  GOAL_DEPTH,
  PLAYER_RADIUS,
  BALL_RADIUS,
  PLAYER_ACCEL,
  PLAYER_ACCEL_MOBILE,
  PLAYER_FRICTION,
  BALL_FRICTION,
  KICK_FORCE,
  KICK_RANGE,
  BALL_MAX_SPEED,
  COLLISION_RESTITUTION,
  BROADCAST_INTERVAL,
} from "../constants";
import {
  playKick, playDribble, playGoal, playWhistle,
  hapticKick, hapticGoal,
  isMuted, setMuted,
} from "../utils/audio";

const RED = "#e74c3c";
const BLUE = "#3498db";
const PITCH_GREEN = "#2d8a4e";
const PITCH_DARK = "#267a43";

// ── Helpers ──────────────────────────────────────────────────────

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resetBall() {
  return {
    x: PITCH_WIDTH / 2,
    y: PITCH_HEIGHT / 2,
    vx: 0,
    vy: 0,
  };
}

function spawnPos(team, swapped = false) {
  const leftTeam = swapped ? "blue" : "red";
  return {
    x: team === leftTeam ? PITCH_WIDTH * 0.25 : PITCH_WIDTH * 0.75,
    y: PITCH_HEIGHT / 2 + (Math.random() - 0.5) * 80,
  };
}

const GOAL_TOP = (PITCH_HEIGHT - GOAL_HEIGHT) / 2;
const GOAL_BOT = (PITCH_HEIGHT + GOAL_HEIGHT) / 2;

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Client ids on this team, sorted — always includes localId (for spawn at join). */
function teamSortedIds(awareness, team, localId) {
  const set = new Set();
  awareness.getStates().forEach((state, id) => {
    if (state?.team === team) set.add(id);
  });
  set.add(localId);
  return [...set].sort((a, b) => a - b);
}

/** Synced across peers — changes every goal (score) and at half-time. */
function onlineSpawnRoundSalt(g) {
  return `${g.score.red}-${g.score.blue}-${g.half}-${g.swapped}`;
}

/** Deterministic [0, 1) from strings (same inputs → same float on every client). */
function hashUnit(s, key) {
  return (hashStr(`${s}\0${key}`) >>> 0) / 0xffffffff;
}

/**
 * Online spawn: near defending goal; one goalie per team; layout + roles re-roll
 * whenever `roundSalt` changes (new salt after each goal / half).
 */
function spawnPosOnline(team, swapped, roomId, awareness, roundSalt) {
  if (!awareness) return spawnPos(team, swapped);
  const localId = awareness.clientID;
  const sorted = teamSortedIds(awareness, team, localId);
  const n = sorted.length;
  const myIndex = sorted.indexOf(localId);
  if (myIndex < 0 || n === 0) return spawnPos(team, swapped);

  const room = String(roomId ?? "");
  const salt = roundSalt ?? "0-0-1-false";
  const goalieIdx = hashStr(`${room}\0${team}\0${salt}`) % n;
  const leftTeam = swapped ? "blue" : "red";
  const defendLeft = team === leftTeam;

  const mouthX = defendLeft
    ? GOAL_DEPTH + PLAYER_RADIUS + 12
    : PITCH_WIDTH - GOAL_DEPTH - PLAYER_RADIUS - 12;

  if (myIndex === goalieIdx) {
    const gid = sorted[goalieIdx];
    const jy = (hashUnit(`${room}\0${team}\0${salt}\0gk`, String(gid)) - 0.5) * 56;
    const y = clamp(
      PITCH_HEIGHT / 2 + jy,
      GOAL_TOP + PLAYER_RADIUS + 6,
      GOAL_BOT - PLAYER_RADIUS - 6,
    );
    return { x: mouthX, y };
  }

  const outfield = sorted.filter((_, idx) => idx !== goalieIdx);
  const rank = outfield.indexOf(localId);
  const oc = outfield.length;
  if (rank < 0 || oc === 0) return spawnPos(team, swapped);

  const yLo = GOAL_TOP + PLAYER_RADIUS * 2 + 12;
  const yHi = GOAL_BOT - PLAYER_RADIUS * 2 - 12;
  const t = oc === 1 ? 0.5 : rank / (oc - 1);
  let y = yLo + t * (yHi - yLo);

  const cols = Math.min(3, Math.max(1, oc));
  const col = rank % cols;
  const row = Math.floor(rank / cols);
  const depthBase = 58 + row * 42;
  const depthJ = (hashUnit(`${room}\0${team}\0${salt}\0d`, String(localId)) - 0.5) * 28;
  const depth = depthBase + depthJ;
  const xSpread = col * (PLAYER_RADIUS * 2 + 20);
  let x = defendLeft ? mouthX + depth + xSpread : mouthX - depth - xSpread;

  y = clamp(y + (col - (cols - 1) / 2) * 12, yLo, yHi);
  const jx = (hashUnit(`${room}\0${team}\0${salt}\0jx`, String(localId)) - 0.5) * 40;
  const jy = (hashUnit(`${room}\0${team}\0${salt}\0jy`, String(localId)) - 0.5) * 36;
  x += jx;
  y = clamp(y + jy, yLo, yHi);

  return {
    x: clamp(x, PLAYER_RADIUS + 2, PITCH_WIDTH - PLAYER_RADIUS - 2),
    y: clamp(y, PLAYER_RADIUS + 2, PITCH_HEIGHT - PLAYER_RADIUS - 2),
  };
}

// ── Particles ────────────────────────────────────────────────────

function spawnGoalParticles(particles, x, y, teamColor) {
  const colors = teamColor === "red"
    ? ["#e74c3c", "#f39c12", "#fff", "#ff6b6b"]
    : ["#3498db", "#2ecc71", "#fff", "#74b9ff"];
  for (let i = 0; i < 36; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 40 + Math.random() * 30,
      maxLife: 40 + Math.random() * 30,
      size: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

function tickParticles(particles) {
  // Swap-and-pop removal — O(n) instead of O(n²) from splice
  let i = 0;
  while (i < particles.length) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.vy += 0.04;
    p.life--;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
    } else {
      i++;
    }
  }
}

// ── Physics ──────────────────────────────────────────────────────

function resolveCircleCollision(a, aRadius, b, bRadius) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minDist = aRadius + bRadius;
  if (d >= minDist || d === 0) return false;

  const nx = dx / d;
  const ny = dy / d;
  const overlap = minDist - d;

  // Separate
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;

  // Elastic-ish bounce
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const dot = dvx * nx + dvy * ny;
  if (dot <= 0) return true;

  a.vx -= dot * nx * COLLISION_RESTITUTION;
  a.vy -= dot * ny * COLLISION_RESTITUTION;
  b.vx += dot * nx * COLLISION_RESTITUTION;
  b.vy += dot * ny * COLLISION_RESTITUTION;
  return true;
}

const PASS_MAGNET = 0.35;
const PASS_CONE = Math.cos(Math.PI / 4);
const CHARGE_MAX = 30;
const KICK_MIN_MULT = 0.4;
const KICK_MAX_MULT = 1.8;

function assistDir(player, ball, nx, ny, teammates) {
  if (!teammates || teammates.length === 0) return { nx, ny };
  let bestDot = -1, bestTx = nx, bestTy = ny;
  for (const tm of teammates) {
    const tdx = tm.x - ball.x, tdy = tm.y - ball.y;
    const td = Math.hypot(tdx, tdy);
    if (td < 30) continue;
    const tnx = tdx / td, tny = tdy / td;
    const d = nx * tnx + ny * tny;
    if (d > PASS_CONE && d > bestDot) { bestDot = d; bestTx = tnx; bestTy = tny; }
  }
  if (bestDot <= PASS_CONE) return { nx, ny };
  const bx = nx + (bestTx - nx) * PASS_MAGNET;
  const by = ny + (bestTy - ny) * PASS_MAGNET;
  const bm = Math.hypot(bx, by) || 1;
  return { nx: bx / bm, ny: by / bm };
}

// kickPower: 0 = not kicking, >0 = force multiplier (KICK_MIN_MULT..KICK_MAX_MULT)
// Returns: 0 = no contact, 1 = body contact (dribble), 2 = kick
function playerBallCollision(player, ball, kickPower, teammates) {
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const d = Math.hypot(dx, dy);
  const minDist = PLAYER_RADIUS + BALL_RADIUS;

  if (d >= minDist || d === 0) {
    if (kickPower > 0 && d < KICK_RANGE && d > 0) {
      let nx = dx / d, ny = dy / d;
      ({ nx, ny } = assistDir(player, ball, nx, ny, teammates));
      ball.vx += nx * KICK_FORCE * kickPower;
      ball.vy += ny * KICK_FORCE * kickPower;
      return 2;
    }
    return 0;
  }

  const nx = dx / d;
  const ny = dy / d;
  const overlap = minDist - d;

  ball.x += nx * (overlap + 1.5);
  ball.y += ny * (overlap + 1.5);

  const relVx = player.vx - ball.vx;
  const relVy = player.vy - ball.vy;
  const dot = relVx * nx + relVy * ny;
  if (dot > 0) {
    ball.vx += nx * dot * 1.3;
    ball.vy += ny * dot * 1.3;
  }

  const ballSpd = ball.vx * nx + ball.vy * ny;
  if (ballSpd < 1.8) {
    ball.vx += nx * (1.8 - ballSpd);
    ball.vy += ny * (1.8 - ballSpd);
  }

  if (kickPower > 0) {
    let knx = nx, kny = ny;
    ({ nx: knx, ny: kny } = assistDir(player, ball, nx, ny, teammates));
    ball.vx += knx * KICK_FORCE * kickPower;
    ball.vy += kny * KICK_FORCE * kickPower;
    return 2;
  }

  return 1;
}

function tickBall(ball) {
  ball.vx *= BALL_FRICTION;
  ball.vy *= BALL_FRICTION;

  // Stop if very slow
  if (Math.abs(ball.vx) < 0.01) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.01) ball.vy = 0;

  // Clamp speed
  const spd = Math.hypot(ball.vx, ball.vy);
  if (spd > BALL_MAX_SPEED) {
    ball.vx = (ball.vx / spd) * BALL_MAX_SPEED;
    ball.vy = (ball.vy / spd) * BALL_MAX_SPEED;
  }

  ball.x += ball.vx;
  ball.y += ball.vy;

  // Top / bottom walls
  if (ball.y - BALL_RADIUS < 0) {
    ball.y = BALL_RADIUS;
    ball.vy = Math.abs(ball.vy) * COLLISION_RESTITUTION;
  }
  if (ball.y + BALL_RADIUS > PITCH_HEIGHT) {
    ball.y = PITCH_HEIGHT - BALL_RADIUS;
    ball.vy = -Math.abs(ball.vy) * COLLISION_RESTITUTION;
  }

  // Left wall / goal
  if (ball.x - BALL_RADIUS < 0) {
    if (ball.y > GOAL_TOP && ball.y < GOAL_BOT) {
      // Ball in left net — let it travel in, bounce off back wall
      if (ball.x - BALL_RADIUS < -GOAL_DEPTH) {
        ball.x = -GOAL_DEPTH + BALL_RADIUS;
        ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION;
      }
      return "blue";
    }
    ball.x = BALL_RADIUS;
    ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION;
  }

  // Right wall / goal
  if (ball.x + BALL_RADIUS > PITCH_WIDTH) {
    if (ball.y > GOAL_TOP && ball.y < GOAL_BOT) {
      // Ball in right net — let it travel in, bounce off back wall
      if (ball.x + BALL_RADIUS > PITCH_WIDTH + GOAL_DEPTH) {
        ball.x = PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS;
        ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION;
      }
      return "red";
    }
    ball.x = PITCH_WIDTH - BALL_RADIUS;
    ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION;
  }

  return null;
}

// ── Renderer ─────────────────────────────────────────────────────

function render(ctx, canvas, g, localTeam, rotated, dpr = 1) {
  const cw = canvas.width / dpr;
  const ch = canvas.height / dpr;

  if (g.shakeFrames > 0) {
    const intensity = g.shakeFrames * 0.6;
    ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
    g.shakeFrames--;
  }

  // In local mode the score/controls overlay the pitch — no reserved space.
  // In rotated (portrait) mode the HUD/hint land on the sides, not top/bottom,
  // so reserve horizontal space for them instead of vertical.
  const HUD_H = (rotated || g.localMode) ? 0 : Math.max(36, ch * 0.07);
  const HINT_H = (rotated || g.localMode) ? 0 : 22;
  const HINT_W = rotated ? 24 : 0;
  const HUD_W  = 0;

  const availW = cw - HUD_W - HINT_W;
  const availH = ch - HUD_H - HINT_H - (rotated ? 0 : 8);

  const sx = availW / (PITCH_WIDTH + GOAL_DEPTH * 2);
  const sy = availH / PITCH_HEIGHT;
  const scale = Math.min(sx, sy);

  const pitchRenderW = (PITCH_WIDTH + GOAL_DEPTH * 2) * scale;
  const pitchRenderH = PITCH_HEIGHT * scale;
  // Center within available area
  const ox = HINT_W + (availW - pitchRenderW) / 2 + GOAL_DEPTH * scale;
  const oy = HUD_H + (availH - pitchRenderH) / 2;

  const toS = (x, y) => [ox + x * scale, oy + y * scale];

  // Background
  ctx.fillStyle = "#0f1923";
  ctx.fillRect(0, 0, cw, ch);

  // Pitch
  ctx.fillStyle = PITCH_GREEN;
  const [px, py] = toS(0, 0);
  ctx.fillRect(px, py, PITCH_WIDTH * scale, PITCH_HEIGHT * scale);

  // Pitch stripes
  const stripeW = (PITCH_WIDTH / 12) * scale;
  for (let i = 0; i < 12; i += 2) {
    ctx.fillStyle = PITCH_DARK;
    ctx.fillRect(px + i * stripeW, py, stripeW, PITCH_HEIGHT * scale);
  }

  // Lines
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, PITCH_WIDTH * scale, PITCH_HEIGHT * scale);

  // Center line
  const [cx] = toS(PITCH_WIDTH / 2, 0);
  ctx.beginPath();
  ctx.moveTo(cx, py);
  ctx.lineTo(cx, py + PITCH_HEIGHT * scale);
  ctx.stroke();

  // Center circle
  const [ccx, ccy] = toS(PITCH_WIDTH / 2, PITCH_HEIGHT / 2);
  ctx.beginPath();
  ctx.arc(ccx, ccy, 55 * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(ccx, ccy, 4 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Penalty areas
  const penW = 70 * scale;
  const penH = 200 * scale;
  const penY = py + (PITCH_HEIGHT * scale - penH) / 2;
  ctx.strokeRect(px, penY, penW, penH);
  ctx.strokeRect(px + PITCH_WIDTH * scale - penW, penY, penW, penH);

  // Goals
  const [lgx, lgy] = toS(-GOAL_DEPTH, GOAL_TOP);
  const goalW = GOAL_DEPTH * scale;
  const goalH = GOAL_HEIGHT * scale;

  const leftColor = g.swapped ? BLUE : RED;
  const rightColor = g.swapped ? RED : BLUE;
  const leftFill = g.swapped ? "rgba(52,152,219,0.2)" : "rgba(231,76,60,0.2)";
  const rightFill = g.swapped ? "rgba(231,76,60,0.2)" : "rgba(52,152,219,0.2)";

  ctx.fillStyle = leftFill;
  ctx.fillRect(lgx, lgy, goalW, goalH);
  ctx.strokeStyle = leftColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(lgx, lgy, goalW, goalH);

  const [rgx, rgy] = toS(PITCH_WIDTH, GOAL_TOP);
  ctx.fillStyle = rightFill;
  ctx.fillRect(rgx, rgy, goalW, goalH);
  ctx.strokeStyle = rightColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(rgx, rgy, goalW, goalH);

  // Helper: draw text that reads correctly from each player's POV.
  // flipped=true for P2 in local mode (rotated 180° relative to P1).
  const drawLabel = (text, x, y, flipped = false) => {
    const fontSize = Math.round(Math.max(10, 11 * scale));
    if (rotated) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      // P1: counter-rotate -90° to undo CSS +90°. P2: +90° so they read it right-side up.
      ctx.rotate(flipped ? Math.PI / 2 : -Math.PI / 2);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${fontSize}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${fontSize}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(text, Math.round(x), Math.round(y));
    }
  };

  // Players
  const drawPlayer = (x, y, team, name, isLocal, kicking, flippedLabel = false, chargeRatio = 0) => {
    const [sx, sy] = toS(x, y);
    const r = PLAYER_RADIUS * scale;
    const color = team === "red" ? RED : BLUE;

    // Kick ring (pulse while charging)
    if (kicking || chargeRatio > 0) {
      const ringR = KICK_RANGE * scale * (chargeRatio > 0 ? 0.7 + chargeRatio * 0.3 : 1);
      ctx.strokeStyle = chargeRatio > 0 ? `rgba(255,255,255,${0.25 + chargeRatio * 0.35})` : "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    const highlight = isLocal && !g.localMode;
    ctx.strokeStyle = highlight ? "#fff" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = highlight ? 2.5 : 1.5;
    ctx.stroke();

    // Charge bar — "below" the player from their POV
    if (chargeRatio > 0.18) {
      const barW = r * 2.4;
      const barH = 4 * scale;
      let barX, barY;
      if (rotated) {
        // Rotated: "below" = +X for P1, -X for flipped P2
        const dir = flippedLabel ? -1 : 1;
        barX = sx + dir * (r + 5 * scale);
        barY = sy - barW / 2;
        // Draw vertical bar
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(barX, barY, barH, barW);
        const fill = chargeRatio >= 1 ? "#f1c40f" : chargeRatio > 0.6 ? "#e67e22" : "#2ecc71";
        ctx.fillStyle = fill;
        if (flippedLabel) {
          ctx.fillRect(barX, barY + barW * (1 - chargeRatio), barH, barW * chargeRatio);
        } else {
          ctx.fillRect(barX, barY, barH, barW * chargeRatio);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barH, barW);
      } else {
        barX = sx - barW / 2;
        barY = sy + r + 5 * scale;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(barX, barY, barW, barH);
        const fill = chargeRatio >= 1 ? "#f1c40f" : chargeRatio > 0.6 ? "#e67e22" : "#2ecc71";
        ctx.fillStyle = fill;
        ctx.fillRect(barX, barY, barW * chargeRatio, barH);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
      }
    }

    // Name tag
    if (name) {
      if (rotated) {
        const offset = flippedLabel ? r + 14 : -(r + 14);
        drawLabel(name, sx + offset, sy, flippedLabel);
      } else {
        drawLabel(name, sx, sy - r - 6);
      }
    }
  };

  // Draw local (skip in spectator mode)
  const lp = g.localPlayer;
  if (!g.spectator) {
    const localCharging = g.wasKicking ? (g.charge || 0) / CHARGE_MAX : 0;
    drawPlayer(lp.x, lp.y, localTeam, g.localMode ? "P1" : "You", true, false, false, localCharging);
  }

  // Draw remote
  g.remotePlayers.forEach((p, key) => {
    const isP2Local = g.localMode && key === "local2";
    drawPlayer(p.x, p.y, p.team, p.name, false, false, isP2Local, p.charging || 0);
  });

  // Ball shadow
  const [bx, by] = toS(g.ball.x, g.ball.y);
  const br = BALL_RADIUS * scale;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(bx + 1, by + 2, br, br * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Score + Timer HUD
  const mins = Math.floor(g.timeLeft / 60);
  const secs = Math.floor(g.timeLeft % 60);
  const timerStr = `${mins}:${String(secs).padStart(2, "0")}`;
  const timerUrgent = g.timeLeft <= 30 && Math.floor(g.timeLeft * 2) % 2 === 0;

  if (g.localMode || rotated) {
    // Compact overlay — pill centered on pitch, just below top edge
    const [pcxRaw, pcyRaw] = toS(PITCH_WIDTH / 2, 0);
    const sx = Math.round(pcxRaw), sy = Math.round(pcyRaw + 28 * scale);
    const gap = 26;
    const pillW = gap * 3.8, pillH = 28;

    // Fade out when ball is close to the score pill
    const ballSx = ox + g.ball.x * scale, ballSy = oy + g.ball.y * scale;
    const distToPill = Math.hypot(ballSx - sx, ballSy - sy);
    const scoreAlpha = Math.min(1, Math.max(0.15, (distToPill - 40) / 60));

    ctx.globalAlpha = scoreAlpha;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sx - pillW / 2, sy - pillH / 2 - 2, pillW, pillH + 14, 8);
    else ctx.rect(sx - pillW / 2, sy - pillH / 2 - 2, pillW, pillH + 14);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.font = `bold 18px system-ui`;
    ctx.fillStyle = RED; ctx.fillText(String(g.score.red), Math.round(sx - gap), sy + 4);
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillText("-", sx, sy + 4);
    ctx.fillStyle = BLUE; ctx.fillText(String(g.score.blue), Math.round(sx + gap), sy + 4);
    ctx.font = `11px system-ui`;
    ctx.fillStyle = timerUrgent ? "#e74c3c" : "rgba(255,255,255,0.55)";
    ctx.fillText(timerStr, sx, sy + 18);
    ctx.globalAlpha = 1;
  } else {
    const hudFontSize = Math.round(Math.min(HUD_H * 0.65, 38));
    const timerFontSize = Math.round(hudFontSize * 0.72);
    const hudY = HUD_H * 0.55;
    const gap = hudFontSize * 1.4;
    ctx.textAlign = "center";
    ctx.font = `bold ${hudFontSize}px system-ui`;
    ctx.fillStyle = RED;
    ctx.fillText(String(g.score.red), cw / 2 - gap, hudY);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("-", cw / 2, hudY);
    ctx.fillStyle = BLUE;
    ctx.fillText(String(g.score.blue), cw / 2 + gap, hudY);
    ctx.font = `${timerFontSize}px system-ui`;
    ctx.fillStyle = timerUrgent ? "#e74c3c" : "rgba(255,255,255,0.55)";
    ctx.fillText(timerStr, cw / 2, hudY + hudFontSize * 0.95);
  }

  // Particles
  for (const pt of g.particles) {
    const [ptx, pty] = toS(pt.x, pt.y);
    const alpha = pt.life / pt.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(ptx, pty, pt.size * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Connection quality indicator (top-right or rotated equivalent)
  if (!g.localMode && !g.spectator) {
    const label = g.connQuality === "ok" ? "P2P OK" : g.connQuality === "poor" ? "Poor" : "…";
    const qColor = g.connQuality === "ok" ? "rgba(46,204,113,0.6)" : g.connQuality === "poor" ? "rgba(231,76,60,0.6)" : "rgba(255,255,255,0.3)";
    ctx.fillStyle = qColor;
    ctx.font = "10px system-ui";
    if (rotated) {
      ctx.textAlign = "right";
      ctx.fillText(label, cw - 6, 14);
    } else {
      ctx.textAlign = "right";
      ctx.fillText(label, cw - 8, 14);
    }
  }

  // Goal flash
  if (g.goalFlash > 0) {
    const alpha = g.goalFlash / 60;
    ctx.fillStyle =
      g.lastGoalTeam === "red"
        ? `rgba(231,76,60,${alpha * 0.25})`
        : `rgba(52,152,219,${alpha * 0.25})`;
    ctx.fillRect(0, 0, cw, ch);

    ctx.globalAlpha = alpha;
    const golSize = Math.max(48, 64 * scale);
    if (rotated) {
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${golSize}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText("GOL!", 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${golSize}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText("GOL!", cw / 2, ch / 2);
    }
    ctx.globalAlpha = 1;
  }

  // Halftime overlay
  if (g.halftimeFlash > 0) {
    const alpha = Math.min(1, g.halftimeFlash / 40) * Math.min(1, (g.halftimeFlash - 20) / 20 + 1);
    ctx.globalAlpha = Math.max(0, alpha) * 0.82;
    ctx.fillStyle = "#0f1923";
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = Math.max(0, alpha);
    const htSize = Math.max(32, 52 * scale);
    if (rotated) {
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${htSize}px system-ui`;
      ctx.fillText("HALF TIME", 0, -htSize * 0.6);
      ctx.font = `${htSize * 0.55}px system-ui`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText("Teams switch sides", 0, htSize * 0.5);
      ctx.restore();
    } else {
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${htSize}px system-ui`;
      ctx.fillText("HALF TIME", cw / 2, ch / 2 - htSize * 0.6);
      ctx.font = `${htSize * 0.55}px system-ui`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText("Teams switch sides", cw / 2, ch / 2 + htSize * 0.5);
    }
    ctx.globalAlpha = 1;
  }

  // Kick-off prompt
  if (!g.kickedOff && !g.gameOver && g.halftimeFlash === 0) {
    const koSize = Math.max(11, 13 * scale);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#fff";
    ctx.font = `${koSize}px system-ui`;
    if (rotated) {
      // Draw at pill position + offset in canvas X (= portrait DOWN) — CSS rotate(90deg) makes it read sideways
      const [pcxR, pcyR] = toS(PITCH_WIDTH / 2, 0);
      const pillRight = Math.round(pcxR + 26 * 1.9 + 10);
      ctx.textAlign = "left";
      ctx.fillText("Kick off to start the timer!", pillRight, Math.round(pcyR + 28 * scale));
    } else {
      ctx.textAlign = "center";
      ctx.fillText("Kick the ball to start!", cw / 2, oy + PITCH_HEIGHT * scale + koSize * 1.5);
    }
    ctx.globalAlpha = 1;
  }

  // Controls hint (desktop only — mobile has touch controls)
  if (!rotated) {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    const hint = g.localMode
      ? "P1: WASD + Space  |  P2: Arrow keys + Enter  |  M to mute  |  Esc×2 to menu"
      : "WASD / Arrows to move  |  Space to kick  |  M to mute  |  Esc×2 to menu";
    ctx.fillText(hint, cw / 2, ch - 7);
  }
}

function UrlCopiedToast({ show }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        fontSize: 13,
        padding: "8px 16px",
        borderRadius: 8,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      URL copied!
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────

export default function Game({ localMode = false }) {
  const canvasRef = useRef(null);
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [team, setTeam] = useState(localMode ? "red" : null);
  const [rotated, setRotated] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [teamRoster, setTeamRoster] = useState({ red: [], blue: [] });
  const [shareLinkHover, setShareLinkHover] = useState(false);
  const gameOverSetterRef = useRef(null);
  gameOverSetterRef.current = setGameOver;

  const copyShareUrl = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Redirect to login if no user (local mode doesn't need auth)
  useEffect(() => {
    if (!localMode && !currentUser) navigate("/");
  }, [currentUser, navigate]); // eslint-disable-line

  const rtc = useWebRtcProvider(localMode ? null : roomId);
  const mockAwareness = useRef({
    clientID: 1,
    getStates: () => new Map(),
    setLocalState: () => {},
    on: () => {},
    off: () => {},
  });
  const awareness = localMode ? mockAwareness.current : rtc?.awareness;

  // Mutable game state (not React state — too slow for 60fps)
  const gs = useRef({
    localPlayer: localMode ? { ...spawnPos("red", false), vx: 0, vy: 0 } : { x: 0, y: 0, vx: 0, vy: 0 },
    ball: resetBall(),
    localPlayer2: localMode
      ? { ...spawnPos("blue", false), vx: 0, vy: 0, team: "blue", name: "P2", kicking: false }
      : null,
    score: { red: 0, blue: 0 },
    keys: new Set(),
    remotePlayers: new Map(),
    lastBroadcast: 0,
    goalFlash: 0,
    lastGoalTeam: null,
    goalCooldown: 0,
    joystick: null,
    touchKick: false,
    joystick2: null,
    touchKick2: false,
    rotated: false,
    timeLeft: 300,
    half: 1,
    swapped: false,
    halftimeFlash: 0,
    gameOver: false,
    localMode: false,
    kickedOff: false,
    particles: [],
    shakeFrames: 0,
    slowMoFrames: 0,
    lastKickFrame: 0,
    connQuality: "ok",
    cachedHostID: null,
    spectator: false,
    charge: 0,
    wasKicking: false,
    kickReleasePower: 0,
    charge2: 0,
    wasKicking2: false,
    kickReleasePower2: 0,
  });

  const joinTeam = (t) => {
    if (t === "spectator") {
      gs.current.spectator = true;
      gs.current.localPlayer.x = PITCH_WIDTH / 2;
      gs.current.localPlayer.y = PITCH_HEIGHT / 2;
      gs.current.localPlayer.vx = 0;
      gs.current.localPlayer.vy = 0;
      setTeam("spectator");
      return;
    }
    const pos = localMode
      ? spawnPos(t, gs.current.swapped)
      : awareness
        ? spawnPosOnline(t, gs.current.swapped, roomId, awareness, onlineSpawnRoundSalt(gs.current))
        : spawnPos(t, gs.current.swapped);
    gs.current.localPlayer.x = pos.x;
    gs.current.localPlayer.y = pos.y;
    gs.current.localPlayer.vx = 0;
    gs.current.localPlayer.vy = 0;
    setTeam(t);
  };

  // Auto-join from ?team=red/blue URL param
  useEffect(() => {
    const paramTeam = searchParams.get("team");
    if (paramTeam === "red" || paramTeam === "blue") joinTeam(paramTeam);
  }, [searchParams]); // eslint-disable-line

gs.current.localMode = localMode;

  // Expose game state for testing
  useEffect(() => {
    window.__game = gs.current;
    return () => { delete window.__game; };
  }, []);

  // Keyboard
  useEffect(() => {
    let lastEsc = 0;
    const down = (e) => {
      if (e.code === "Escape") {
        const now = Date.now();
        if (now - lastEsc < 500) navigate("/");
        lastEsc = now;
        return;
      }
      if (e.code === "KeyM") {
        const next = !isMuted();
        setMuted(next);
        setMutedState(next);
        return;
      }
      gs.current.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    };
    const up = (e) => gs.current.keys.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [navigate]);

  // Awareness listener — remote players + ball reconciliation
  // Debounced: awareness fires per-peer, so with 10 players we'd get 10 events
  // in quick succession. Batching into one rAF pass avoids redundant work.
  useEffect(() => {
    if (!awareness || localMode) return;
    let pending = false;

    const flush = () => {
      pending = false;
      const states = awareness.getStates();
      const localID = awareness.clientID;
      const remote = gs.current.remotePlayers;

      // Track which IDs are still present so we can prune stale ones
      const seen = new Set();

      states.forEach((state, id) => {
        if (id === localID || !state?.team || state.team === "spectator" || state.spectator) return;
        seen.add(id);

        const existing = remote.get(id);
        if (existing) {
          existing.targetX = state.x;
          existing.targetY = state.y;
          existing.vx = state.vx || 0;
          existing.vy = state.vy || 0;
          existing.team = state.team;
          existing.name = state.name;
          existing.kicking = state.kicking;
          existing.charging = state.charging || 0;
        } else {
          remote.set(id, {
            x: state.x,
            y: state.y,
            targetX: state.x,
            targetY: state.y,
            vx: state.vx || 0,
            vy: state.vy || 0,
            team: state.team,
            name: state.name,
            kicking: state.kicking,
            charging: state.charging || 0,
          });
        }
      });

      // Remove players who left — iterate only when sizes differ
      if (remote.size !== seen.size) {
        remote.forEach((_, id) => { if (!seen.has(id)) remote.delete(id); });
      }

      // Cache host ID — detect host migration
      let hostID = localID;
      states.forEach((state, id) => {
        if (state?.team && state.team !== "spectator" && id < hostID) hostID = id;
      });
      const prevHost = gs.current.cachedHostID;
      gs.current.cachedHostID = hostID;

      // Host migration: we just became host (old host left or we're lowest ID now)
      if (hostID === localID && prevHost !== null && prevHost !== localID) {
        // Clear ballTarget so game loop switches from interpolation to running physics
        gs.current.ballTarget = null;
        // Force immediate broadcast so other clients pick up the new host
        gs.current.lastBroadcast = 0;
      }

      if (hostID !== localID) {
        const hostState = states.get(hostID);
        if (hostState?.ball) {
          const bt = gs.current.ballTarget;
          if (bt) {
            bt.x = hostState.ball.x; bt.y = hostState.ball.y;
            bt.vx = hostState.ball.vx; bt.vy = hostState.ball.vy;
          } else {
            gs.current.ballTarget = { x: hostState.ball.x, y: hostState.ball.y, vx: hostState.ball.vx, vy: hostState.ball.vy };
          }
        }
        if (hostState?.score) {
          gs.current.score.red = hostState.score.red;
          gs.current.score.blue = hostState.score.blue;
        }
        if (hostState?.timeLeft !== undefined) gs.current.timeLeft = hostState.timeLeft;
        if (hostState?.half !== undefined) gs.current.half = hostState.half;
        if (hostState?.swapped !== undefined) gs.current.swapped = hostState.swapped;
        if (hostState?.kickedOff !== undefined) gs.current.kickedOff = hostState.kickedOff;
        if (hostState?.gameOver && !gs.current.gameOver) {
          gs.current.gameOver = true;
          gameOverSetterRef.current?.(true);
        }
        if (hostState?.goalFlash > 0 && gs.current.goalFlash === 0) {
          gs.current.goalFlash = hostState.goalFlash;
          gs.current.lastGoalTeam = hostState.lastGoalTeam;
          gs.current.goalCooldown = hostState.goalCooldown || 180;
          gs.current.pendingReset = true;
          spawnGoalParticles(gs.current.particles, gs.current.ball.x, gs.current.ball.y, hostState.lastGoalTeam === "red" ? "blue" : "red");
          gs.current.shakeFrames = 14;
          gs.current.slowMoFrames = 18;
          playGoal();
          hapticGoal();
        }
      }

      // Latency sampling — check only a few peers, not all
      let maxAge = 0, sampled = 0;
      const now = Date.now();
      states.forEach((state, id) => {
        if (sampled >= 3) return; // sample up to 3 peers
        if (id === localID) return;
        if (state?._ts) { maxAge = Math.max(maxAge, now - state._ts); sampled++; }
      });
      if (sampled > 0) {
        gs.current.connQuality = maxAge < 350 ? "ok" : maxAge < 800 ? "poor" : "bad";
      }
    };

    const handle = () => {
      if (!pending) { pending = true; queueMicrotask(flush); }
    };

    awareness.on("change", handle);
    return () => awareness.off("change", handle);
  }, [awareness]);

  // Team pick screen: show who is already on each team (peers broadcast after joining)
  useEffect(() => {
    if (localMode || team || !awareness) return;

    const syncRoster = () => {
      const red = [];
      const blue = [];
      awareness.getStates().forEach((state, id) => {
        if (!state?.team) return;
        const name = (state.name && String(state.name).trim()) || `Player ${id}`;
        const row = { id, name };
        if (state.team === "red") red.push(row);
        else if (state.team === "blue") blue.push(row);
      });
      const byName = (a, b) => {
        const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        return String(a.id).localeCompare(String(b.id));
      };
      red.sort(byName);
      blue.sort(byName);
      setTeamRoster({ red, blue });
    };

    syncRoster();
    awareness.on("change", syncRoster);
    return () => awareness.off("change", syncRoster);
  }, [awareness, localMode, team]);

  // Canvas resize — runs after canvas mounts (when team is set)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const portrait = window.innerWidth < window.innerHeight;
      gs.current.rotated = portrait;
      setRotated(portrait);
      const dpr = window.devicePixelRatio || 1;
      gs.current.dpr = dpr;
      if (portrait) {
        // Render in landscape, rotate 90° via CSS to fill portrait screen
        canvas.width = window.innerHeight * dpr;
        canvas.height = window.innerWidth * dpr;
        canvas.style.width = window.innerHeight + "px";
        canvas.style.height = window.innerWidth + "px";
        canvas.style.position = "fixed";
        canvas.style.top = "50%";
        canvas.style.left = "50%";
        canvas.style.transform = "translate(-50%, -50%) rotate(90deg)";
      } else {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + "px";
        canvas.style.height = window.innerHeight + "px";
        canvas.style.position = "";
        canvas.style.top = "";
        canvas.style.left = "";
        canvas.style.transform = "";
      }
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [team]);

  // Game loop
  useEffect(() => {
    if (!team || !awareness) return;



    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    let slowSkip = false;

    const tick = () => {
      const g = gs.current;

      if (g.slowMoFrames > 0 && !slowSkip) {
        slowSkip = true;
        animId = requestAnimationFrame(tick);
        return;
      }
      slowSkip = false;
      const keys = g.keys;
      const p = g.localPlayer;
      const ball = g.ball;

      // ── Determine host (cached — updated by awareness listener) ──
      const localID = awareness.clientID;
      const hostID = g.cachedHostID ?? localID;
      const isHost = localMode || (localID === hostID && !g.spectator);
      const isSpectator = g.spectator;

      let ax = 0, ay = 0;
      const kickHeld = !isSpectator && (keys.has("Space") || keys.has("KeyX") || !!g.touchKick);

      // Charge-to-kick: accumulate while held, fire on release with buffer window
      if (kickHeld) {
        g.charge = Math.min((g.charge || 0) + 1, CHARGE_MAX);
        g.kickBuffer = 0;
      }
      let kickPower = 0;
      if (!kickHeld && g.wasKicking) {
        const t = Math.min(g.charge / CHARGE_MAX, 1);
        g.kickReleasePower = KICK_MIN_MULT + t * (KICK_MAX_MULT - KICK_MIN_MULT);
        g.kickBuffer = 14;
        g.charge = 0;
      }
      if (g.kickBuffer > 0) {
        kickPower = g.kickReleasePower;
        g.kickBuffer--;
      } else if (!kickHeld) {
        g.charge = 0;
        g.kickReleasePower = 0;
      }
      g.wasKicking = kickHeld;

      if (isSpectator) {
        // Spectator: skip all player input/physics; just interpolate + render
      } else {
      // ── Player 1 input ──
      if (g.rotated) {
        if (keys.has("KeyW"))  ax -= 1;
        if (keys.has("KeyS"))  ax += 1;
        if (keys.has("KeyA"))  ay += 1;
        if (keys.has("KeyD"))  ay -= 1;
        if (!localMode) {
          if (keys.has("ArrowUp"))    ax -= 1;
          if (keys.has("ArrowDown"))  ax += 1;
          if (keys.has("ArrowLeft"))  ay += 1;
          if (keys.has("ArrowRight")) ay -= 1;
        }
      } else {
        if (keys.has("KeyW"))  ay -= 1;
        if (keys.has("KeyS"))  ay += 1;
        if (keys.has("KeyA"))  ax -= 1;
        if (keys.has("KeyD"))  ax += 1;
        if (!localMode) {
          if (keys.has("ArrowUp"))    ay -= 1;
          if (keys.has("ArrowDown"))  ay += 1;
          if (keys.has("ArrowLeft"))  ax -= 1;
          if (keys.has("ArrowRight")) ax += 1;
        }
      }

      // Joystick input (mobile)
      if (g.joystick) {
        if (g.rotated) {
          ax += g.joystick.dy;
          ay += -g.joystick.dx;
        } else {
          ax += g.joystick.dx;
          ay += g.joystick.dy;
        }
      }

      const mag = Math.hypot(ax, ay);
      if (mag > 1) { ax /= mag; ay /= mag; }

      // ── Player 2 input + physics (local mode only) ──
      if (localMode && g.localPlayer2) {
        const p2 = g.localPlayer2;
        let ax2 = 0, ay2 = 0;
        if (keys.has("ArrowUp"))    ay2 -= 1;
        if (keys.has("ArrowDown"))  ay2 += 1;
        if (keys.has("ArrowLeft"))  ax2 -= 1;
        if (keys.has("ArrowRight")) ax2 += 1;
        // Touch joystick2 — controls are rotated 180° so dy/dx are negated vs P1
        if (g.joystick2) {
          if (g.rotated) {
            ax2 += g.joystick2.dy;
            ay2 += -g.joystick2.dx;
          } else {
            ax2 += -g.joystick2.dx;
            ay2 += -g.joystick2.dy;
          }
        }
        const mag2 = Math.hypot(ax2, ay2);
        if (mag2 > 1) { ax2 /= mag2; ay2 /= mag2; }
        const kick2Held = keys.has("Enter") || keys.has("NumpadEnter") || !!g.touchKick2;
        if (kick2Held) { g.charge2 = Math.min((g.charge2 || 0) + 1, CHARGE_MAX); g.kickBuffer2 = 0; }
        let kickPower2 = 0;
        if (!kick2Held && g.wasKicking2) {
          const t2 = Math.min(g.charge2 / CHARGE_MAX, 1);
          g.kickReleasePower2 = KICK_MIN_MULT + t2 * (KICK_MAX_MULT - KICK_MIN_MULT);
          g.kickBuffer2 = 14;
          g.charge2 = 0;
        }
        if (g.kickBuffer2 > 0) {
          kickPower2 = g.kickReleasePower2;
          g.kickBuffer2--;
        } else if (!kick2Held) {
          g.charge2 = 0;
          g.kickReleasePower2 = 0;
        }
        g.wasKicking2 = kick2Held;
        p2.kicking = kickPower2;
        p2.charging = kick2Held ? g.charge2 / CHARGE_MAX : 0;

        const dist2 = Math.hypot(p2.x - ball.x, p2.y - ball.y);
        const prox2 = Math.max(0, 1 - (dist2 - KICK_RANGE) / (KICK_RANGE * 2.5));
        const accel2 = PLAYER_ACCEL * (1 - prox2 * 0.45);
        p2.vx = (p2.vx + ax2 * accel2) * PLAYER_FRICTION;
        p2.vy = (p2.vy + ay2 * accel2) * PLAYER_FRICTION;
        p2.x += p2.vx;
        p2.y += p2.vy;
        p2.x = clamp(p2.x, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS);
        p2.y = clamp(p2.y, PLAYER_RADIUS, PITCH_HEIGHT - PLAYER_RADIUS);
        g.remotePlayers.set("local2", p2);
      }

      // ── Player physics ──
      const distToBall = Math.hypot(p.x - ball.x, p.y - ball.y);
      const ballProximity = Math.max(0, 1 - (distToBall - KICK_RANGE) / (KICK_RANGE * 2.5));
      const accelScale = 1 - ballProximity * 0.45;
      const accel = (g.rotated ? PLAYER_ACCEL_MOBILE : PLAYER_ACCEL) * accelScale;
      p.vx = (p.vx + ax * accel) * PLAYER_FRICTION;
      p.vy = (p.vy + ay * accel) * PLAYER_FRICTION;
      p.x += p.vx;
      p.y += p.vy;
      p.x = clamp(p.x, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS);
      p.y = clamp(p.y, PLAYER_RADIUS, PITCH_HEIGHT - PLAYER_RADIUS);
      } // end if (!isSpectator)

      // ── Interpolate remote players (online only — local mode players move directly) ──
      if (!localMode) {
        g.remotePlayers.forEach((rp) => {
          // Advance target by velocity (predicts position between broadcasts)
          rp.targetX += rp.vx;
          rp.targetY += rp.vy;
          rp.vx *= PLAYER_FRICTION;
          rp.vy *= PLAYER_FRICTION;
          // Clamp target to pitch bounds
          if (rp.targetX < PLAYER_RADIUS) rp.targetX = PLAYER_RADIUS;
          else if (rp.targetX > PITCH_WIDTH - PLAYER_RADIUS) rp.targetX = PITCH_WIDTH - PLAYER_RADIUS;
          if (rp.targetY < PLAYER_RADIUS) rp.targetY = PLAYER_RADIUS;
          else if (rp.targetY > PITCH_HEIGHT - PLAYER_RADIUS) rp.targetY = PITCH_HEIGHT - PLAYER_RADIUS;
          // Lerp toward predicted position
          rp.x += (rp.targetX - rp.x) * 0.3;
          rp.y += (rp.targetY - rp.y) * 0.3;
        });
      }

      // ── Kick-off detection ──
      if (!g.kickedOff && Math.hypot(ball.vx, ball.vy) > 0.1) g.kickedOff = true;

      // ── Timer (host authoritative, only after kick-off) ──
      if (isHost && !g.gameOver && g.kickedOff && !g.pendingReset) {
        g.timeLeft = Math.max(0, g.timeLeft - 1 / 60);

        // Halftime at 2:30 (no side-swap in local mode)
        if (g.half === 1 && g.timeLeft <= 150) {
          g.half = 2;
          if (!localMode) g.swapped = true;
          g.halftimeFlash = 180;
          g.goalCooldown = 180;
          g.kickedOff = false;
          playWhistle();
          Object.assign(ball, resetBall());
          const sp = localMode
            ? spawnPos(team, false)
            : spawnPosOnline(team, true, roomId, awareness, onlineSpawnRoundSalt(g));
          p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0;
          if (localMode && g.localPlayer2) {
            const sp2 = spawnPos("blue", false);
            g.localPlayer2.x = sp2.x; g.localPlayer2.y = sp2.y;
            g.localPlayer2.vx = 0; g.localPlayer2.vy = 0;
          }
        }

        // Full time
        if (g.timeLeft === 0 && !g.gameOver) {
          g.gameOver = true;
          gameOverSetterRef.current?.(true);
          playWhistle();
        }
      }
      if (g.halftimeFlash > 0) g.halftimeFlash--;

      // ── Ball physics (everyone runs locally, host is authoritative) ──
      if (g.goalCooldown > 0) {
        g.goalCooldown--;
        if (g.goalFlash > 0) g.goalFlash--;
        if (g.goalCooldown === 0 && g.pendingReset) {
          g.pendingReset = false;
          Object.assign(ball, resetBall());
          const sp = localMode
            ? spawnPos(team, g.swapped)
            : spawnPosOnline(team, g.swapped, roomId, awareness, onlineSpawnRoundSalt(g));
          p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0;
          if (localMode && g.localPlayer2) {
            const sp2 = spawnPos("blue", g.swapped);
            g.localPlayer2.x = sp2.x; g.localPlayer2.y = sp2.y;
            g.localPlayer2.vx = 0; g.localPlayer2.vy = 0;
          }
        }
        // Ball bounces inside the net during celebration (only while pendingReset is active)
        if (g.pendingReset) {
          ball.vx *= 0.97;
          ball.vy *= 0.97;
          ball.x += ball.vx;
          ball.y += ball.vy;
          if (g.lastGoalTeam === "blue") {
            if (ball.x - BALL_RADIUS < -GOAL_DEPTH) { ball.x = -GOAL_DEPTH + BALL_RADIUS; ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION; }
            if (ball.x + BALL_RADIUS > 0)            { ball.x = -BALL_RADIUS;              ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION; }
            if (ball.y - BALL_RADIUS < GOAL_TOP)     { ball.y = GOAL_TOP + BALL_RADIUS;    ball.vy = Math.abs(ball.vy) * COLLISION_RESTITUTION; }
            if (ball.y + BALL_RADIUS > GOAL_BOT)     { ball.y = GOAL_BOT - BALL_RADIUS;    ball.vy = -Math.abs(ball.vy) * COLLISION_RESTITUTION; }
          } else if (g.lastGoalTeam === "red") {
            if (ball.x + BALL_RADIUS > PITCH_WIDTH + GOAL_DEPTH) { ball.x = PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION; }
            if (ball.x - BALL_RADIUS < PITCH_WIDTH)               { ball.x = PITCH_WIDTH + BALL_RADIUS;              ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION; }
            if (ball.y - BALL_RADIUS < GOAL_TOP)                   { ball.y = GOAL_TOP + BALL_RADIUS;                 ball.vy = Math.abs(ball.vy) * COLLISION_RESTITUTION; }
            if (ball.y + BALL_RADIUS > GOAL_BOT)                   { ball.y = GOAL_BOT - BALL_RADIUS;                 ball.vy = -Math.abs(ball.vy) * COLLISION_RESTITUTION; }
          }
        }
      } else {
        // Build teammates list — reuse array to avoid GC pressure
        const allPlayers = g._allPlayersBuf || (g._allPlayersBuf = []);
        allPlayers.length = 0;
        allPlayers.push(p);
        g.remotePlayers.forEach((rp) => allPlayers.push(rp));

        const getTeammates = (pl, plTeam) =>
          allPlayers.filter((o) => o !== pl && (o.team || team) === plTeam);

        // Ball collisions: host is authoritative, but ALL clients run local player
        // collision for instant kick feedback (client-side prediction).
        g.lastKickFrame = (g.lastKickFrame || 0) + 1;
        g.lastDribbleFrame = (g.lastDribbleFrame || 0) + 1;
        const localRes = playerBallCollision(p, ball, kickPower, getTeammates(p, team));
        if (localRes === 2) { g.kickBuffer = 0; if (g.lastKickFrame > 8) { playKick(); hapticKick(); g.lastKickFrame = 0; } }
        else if (localRes === 1 && g.lastDribbleFrame > 12) { playDribble(); g.lastDribbleFrame = 0; }

        if (isHost) {
          // Host also processes remote player kicks
          g.remotePlayers.forEach((rp) => {
            const rpTeam = rp.team || team;
            const rpKickPower = typeof rp.kicking === "number" ? rp.kicking : (rp.kicking ? KICK_MIN_MULT : 0);
            const rk = playerBallCollision(rp, ball, rpKickPower, getTeammates(rp, rpTeam));
            if (rk === 2) { rp.kicking = 0; if (g.lastKickFrame > 8) { playKick(); hapticKick(); g.lastKickFrame = 0; } }
            else if (rk === 1 && g.lastDribbleFrame > 12) { playDribble(); g.lastDribbleFrame = 0; }
          });
        }

        // Player-player collision: host runs all pairs; clients only resolve local vs others
        if (isHost || localMode) {
          for (let i = 0; i < allPlayers.length; i++) {
            for (let j = i + 1; j < allPlayers.length; j++) {
              resolveCircleCollision(allPlayers[i], PLAYER_RADIUS, allPlayers[j], PLAYER_RADIUS);
            }
          }
        } else {
          for (let j = 1; j < allPlayers.length; j++) {
            resolveCircleCollision(p, PLAYER_RADIUS, allPlayers[j], PLAYER_RADIUS);
          }
        }

        if (isHost) {
          const goal = tickBall(ball);
          if (goal && !g.pendingReset) {
            const scorer = g.swapped ? (goal === "red" ? "blue" : "red") : goal;
            g.score[scorer]++;
            g.kickedOff = false;
            g.goalCooldown = 180;
            g.goalFlash = 60;
            g.lastGoalTeam = goal;
            g.pendingReset = true;
            spawnGoalParticles(g.particles, ball.x, ball.y, scorer);
            g.shakeFrames = 14;
            g.slowMoFrames = 18;
            playGoal();
            hapticGoal();
          }
        } else if (g.ballTarget) {
          // Client: run local ball physics (walls, friction) for prediction
          ball.vx *= BALL_FRICTION;
          ball.vy *= BALL_FRICTION;
          ball.x += ball.vx;
          ball.y += ball.vy;
          // Wall bounces
          if (ball.y - BALL_RADIUS < 0) { ball.y = BALL_RADIUS; ball.vy = Math.abs(ball.vy) * COLLISION_RESTITUTION; }
          if (ball.y + BALL_RADIUS > PITCH_HEIGHT) { ball.y = PITCH_HEIGHT - BALL_RADIUS; ball.vy = -Math.abs(ball.vy) * COLLISION_RESTITUTION; }
          if (ball.x - BALL_RADIUS < 0 && !(ball.y > GOAL_TOP && ball.y < GOAL_BOT)) { ball.x = BALL_RADIUS; ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION; }
          if (ball.x + BALL_RADIUS > PITCH_WIDTH && !(ball.y > GOAL_TOP && ball.y < GOAL_BOT)) { ball.x = PITCH_WIDTH - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION; }
          // Advance host target with same physics
          const t = g.ballTarget;
          t.x += t.vx;
          t.y += t.vy;
          t.vx *= BALL_FRICTION;
          t.vy *= BALL_FRICTION;
          if (t.y - BALL_RADIUS < 0) { t.y = BALL_RADIUS; t.vy = Math.abs(t.vy) * COLLISION_RESTITUTION; }
          if (t.y + BALL_RADIUS > PITCH_HEIGHT) { t.y = PITCH_HEIGHT - BALL_RADIUS; t.vy = -Math.abs(t.vy) * COLLISION_RESTITUTION; }
          if (t.x - BALL_RADIUS < 0 && !(t.y > GOAL_TOP && t.y < GOAL_BOT)) { t.x = BALL_RADIUS; t.vx = Math.abs(t.vx) * COLLISION_RESTITUTION; }
          if (t.x + BALL_RADIUS > PITCH_WIDTH && !(t.y > GOAL_TOP && t.y < GOAL_BOT)) { t.x = PITCH_WIDTH - BALL_RADIUS; t.vx = -Math.abs(t.vx) * COLLISION_RESTITUTION; }
          // Reconcile: pull local prediction toward host authority
          ball.x += (t.x - ball.x) * 0.15;
          ball.y += (t.y - ball.y) * 0.15;
          ball.vx += (t.vx - ball.vx) * 0.15;
          ball.vy += (t.vy - ball.vy) * 0.15;
        }
      }

      // ── Broadcast ──
      const now = Date.now();
      if (isSpectator && !localMode && now - g.lastBroadcast > 2000) {
        awareness.setLocalState({ spectator: true, _ts: now });
        g.lastBroadcast = now;
      }
      // Adaptive broadcast rate: more peers = less frequent to avoid mesh saturation
      const peerCount = g.remotePlayers.size;
      const interval = isHost
        ? BROADCAST_INTERVAL  // Host always broadcasts at full rate (ball authority)
        : peerCount > 8 ? 120 : peerCount > 4 ? 80 : BROADCAST_INTERVAL;
      if (!localMode && !isSpectator && now - g.lastBroadcast > interval) {
        // Reuse broadcast object to avoid allocation every interval
        const state = g._broadcastBuf || (g._broadcastBuf = {});
        state.x = p.x;
        state.y = p.y;
        state.vx = p.vx;
        state.vy = p.vy;
        state.team = team;
        state.name = currentUser?.name;
        state.kicking = kickPower;
        state.charging = kickHeld ? g.charge / CHARGE_MAX : 0;
        if (isHost) {
          if (!state.ball) state.ball = {};
          state.ball.x = ball.x; state.ball.y = ball.y;
          state.ball.vx = ball.vx; state.ball.vy = ball.vy;
          state.score = g.score;
          state.timeLeft = g.timeLeft;
          state.half = g.half;
          state.swapped = g.swapped;
          state.gameOver = g.gameOver;
          state.kickedOff = g.kickedOff;
          state.goalFlash = g.goalFlash;
          state.lastGoalTeam = g.lastGoalTeam;
          state.goalCooldown = g.goalCooldown;
        } else {
          // Clear host fields when not host (in case host changed)
          state.ball = undefined;
          state.score = undefined;
        }
        state._ts = Date.now();
        awareness.setLocalState(state);
        g.lastBroadcast = now;
      }

      // ── Particles ──
      tickParticles(g.particles);

      // ── Slow-mo: skip every other physics frame for brief dramatic pause ──
      if (g.slowMoFrames > 0) {
        g.slowMoFrames--;
      }

      // ── Render ──
      const dpr = gs.current.dpr || 1;
      ctx.save();
      ctx.scale(dpr, dpr);
      render(ctx, canvas, g, team || "spectator", gs.current.rotated, dpr);
      ctx.restore();

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animId); };
  }, [team, awareness, currentUser, roomId, localMode]);

  useEffect(() => {
    const inMatchView = localMode || !!team;
    if (!inMatchView) return;

    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;

    const prev = {
      htmlOverflow: htmlStyle.overflow,
      htmlOverscroll: htmlStyle.overscrollBehavior,
      bodyOverflow: bodyStyle.overflow,
      bodyOverscroll: bodyStyle.overscrollBehavior,
    };

    htmlStyle.overflow = "hidden";
    htmlStyle.overscrollBehavior = "none";
    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";

    return () => {
      htmlStyle.overflow = prev.htmlOverflow;
      htmlStyle.overscrollBehavior = prev.htmlOverscroll;
      bodyStyle.overflow = prev.bodyOverflow;
      bodyStyle.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [localMode, team]);

  if (!localMode && !currentUser) return null;

  if (!team && !localMode) {
    return (
      <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          boxSizing: "border-box",
          minHeight: "100dvh",
          maxHeight: "100dvh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          color: "#fff",
          gap: 24,
          padding: "24px 16px",
          paddingTop: "max(24px, env(safe-area-inset-top))",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", maxWidth: 560 }}>
          <button
            onClick={() => navigate("/")}
            style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 22, padding: 0 }}
          >
            ←
          </button>
          <h1 style={{ fontSize: 48, fontWeight: 800, margin: 0 }}>Vennball</h1>
        </div>
        <p style={{ color: "#888", marginBottom: 16 }}>
          Room: <code style={{ color: "#aaa" }}>{roomId}</code>
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            justifyContent: "center",
            alignItems: "flex-start",
            maxWidth: 560,
          }}
        >
          {["red", "blue"].map((side) => {
            const roster = teamRoster[side];
            const bg = side === "red" ? RED : BLUE;
            return (
              <div
                key={side}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 200,
                  maxWidth: 260,
                }}
              >
                <button
                  type="button"
                  onClick={() => joinTeam(side)}
                  style={{
                    padding: "16px 48px",
                    fontSize: 20,
                    fontWeight: 700,
                    borderRadius: 12,
                    border: "none",
                    background: bg,
                    color: "#fff",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  {side === "red" ? "Red Team" : "Blue Team"}
                </button>
                <div
                  style={{
                    width: "100%",
                    maxHeight: "min(40vh, 200px)",
                    overflowY: "auto",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    padding: "10px 12px",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>players:</div>
                  {roster.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#555" }}>No players yet</div>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {roster.map((p, i) => (
                        <li
                          key={p.id}
                          style={{
                            fontSize: 14,
                            color: "#ccc",
                            padding: "4px 0",
                            borderBottom:
                              i < roster.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                          }}
                        >
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={copyShareUrl}
          onMouseEnter={() => setShareLinkHover(true)}
          onMouseLeave={() => setShareLinkHover(false)}
          aria-label="Copy room link to clipboard"
          style={{
            marginTop: 12,
            padding: "14px 22px",
            width: "100%",
            maxWidth: 360,
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            background: shareLinkHover ? "#369556" : "#2d8a4e",
            color: "#fff",
            boxShadow: shareLinkHover
              ? "0 4px 20px rgba(45,138,78,0.45)"
              : "0 2px 14px rgba(45,138,78,0.35)",
            transform: shareLinkHover ? "translateY(-1px)" : "none",
            transition: "background 0.15s, box-shadow 0.15s, transform 0.15s",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700 }}>📋 Copy invite link</span>
          <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.92, lineHeight: 1.35 }}>
            Tap to copy — send it to friends so they join this room
          </span>
        </button>
        <button
          type="button"
          onClick={() => joinTeam("spectator")}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            color: "#888",
            background: "none",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          👁 Watch as spectator
        </button>
      </div>
      <UrlCopiedToast show={copied} />
      </>
    );
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          overscrollBehavior: "none",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            cursor: "none",
            touchAction: "none",
          }}
        />
      </div>
      {rotated && team !== "spectator" && <TouchControls gs={gs} localMode={localMode} />}
      <UrlCopiedToast show={copied} />
      {rotated && (
        <div style={{
          position: "fixed", left: 8, top: "50%", transform: "translateY(-50%)",
          zIndex: 20, display: "flex", flexDirection: "column", gap: 6,
        }}>
          <button
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
              else document.exitFullscreen?.();
            }}
            style={{
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6, color: "#fff", fontSize: 12, padding: "6px 8px", cursor: "pointer",
            }}
          >
            ⛶
          </button>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6, color: "#fff", fontSize: 16, padding: "6px 8px", cursor: "pointer",
            }}
          >
            ←
          </button>
          {!localMode && (
            <button
              onClick={copyShareUrl}
              style={{
                background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6, color: "#fff", fontSize: 16, padding: "6px 8px", cursor: "pointer",
              }}
            >
              📋
            </button>
          )}
          <button
            onClick={() => { setMuted(!muted); setMutedState(!muted); }}
            style={{
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6, color: "#fff", fontSize: 14, padding: "6px 8px", cursor: "pointer",
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      )}
      {gameOver && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 30,
          background: "rgba(0,0,0,0.85)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 16, color: "#fff",
        }}>
          <div style={{ fontSize: 48, fontWeight: 800 }}>FULL TIME</div>
          <div style={{ fontSize: 32, display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ color: "#e74c3c", fontWeight: 700 }}>{gs.current.score.red}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>-</span>
            <span style={{ color: "#3498db", fontWeight: 700 }}>{gs.current.score.blue}</span>
          </div>
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)" }}>
            {gs.current.score.red > gs.current.score.blue
              ? "Red wins!"
              : gs.current.score.blue > gs.current.score.red
              ? "Blue wins!"
              : "It's a draw!"}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16, padding: "12px 36px", fontSize: 18, fontWeight: 600,
              borderRadius: 10, border: "none", background: "#2d8a4e", color: "#fff", cursor: "pointer",
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </>
  );
}
