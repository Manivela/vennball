import { createServer } from "http";
import { WebSocketServer } from "ws";
import {
  PITCH_WIDTH, PITCH_HEIGHT, PLAYER_RADIUS, BALL_RADIUS, PLAYER_ACCEL,
  PLAYER_FRICTION, GOAL_TOP, GOAL_BOT, GOAL_DEPTH, COLLISION_RESTITUTION,
  CHARGE_MAX, KICK_MIN_MULT, KICK_MAX_MULT, KICK_RANGE,
  clamp, resetBall, playerBallCollision, resolveCircleCollision, tickBall,
} from "../shared/physics.js";

const PORT = process.env.PORT || 4444;
const TICK_MS = 1000 / 60;     // 60 fps physics
const BROADCAST_MS = 50;       // 20 Hz snapshots to clients

// HTTP server for Fly.io health checks + WebSocket upgrade
const server = createServer((req, res) => {
  res.writeHead(200); res.end("ok");
});
const wss = new WebSocketServer({ server });
const rooms = new Map();

// ── Room state ──────────────────────────────────────────────────

function createRoom(roomId) {
  return {
    id: roomId,
    players: new Map(),  // id -> player state
    ball: resetBall(),
    score: { red: 0, blue: 0 },
    timeLeft: 300,
    half: 1,
    swapped: false,
    kickedOff: false,
    gameOver: false,
    goalCooldown: 0,
    goalFlash: 0,
    lastGoalTeam: null,
    pendingReset: false,
    halftimeFlash: 0,
    tickInterval: null,
    broadcastInterval: null,
  };
}

function spawnPos(team, swapped) {
  const leftTeam = swapped ? "blue" : "red";
  return {
    x: team === leftTeam ? PITCH_WIDTH * 0.25 : PITCH_WIDTH * 0.75,
    y: PITCH_HEIGHT / 2 + (Math.random() - 0.5) * 80,
  };
}

// ── Physics tick (runs at 60fps on server) ──────────────────────

function tick(room) {
  const { ball, players } = room;

  // Apply each player's input
  players.forEach((p) => {
    if (p.team === "spectator") return;
    let { ax, ay } = p.input;
    const mag = Math.hypot(ax, ay);
    if (mag > 1) { ax /= mag; ay /= mag; }

    // Charge-to-kick
    const kickHeld = p.input.kick;
    if (kickHeld) {
      p.charge = Math.min((p.charge || 0) + 1, CHARGE_MAX);
      p.kickBuffer = 0;
    }
    if (!kickHeld && p.wasKicking) {
      const t = Math.min(p.charge / CHARGE_MAX, 1);
      p.kickReleasePower = KICK_MIN_MULT + t * (KICK_MAX_MULT - KICK_MIN_MULT);
      p.kickBuffer = 14;
      p.charge = 0;
    }
    let kickPower = 0;
    if (p.kickBuffer > 0) {
      kickPower = p.kickReleasePower;
      p.kickBuffer--;
    } else if (!kickHeld) {
      p.charge = 0;
      p.kickReleasePower = 0;
    }
    p.wasKicking = kickHeld;
    p.kicking = kickPower;
    p.charging = kickHeld ? (p.charge || 0) / CHARGE_MAX : 0;

    // Movement with ball proximity slowdown
    const distToBall = Math.hypot(p.x - ball.x, p.y - ball.y);
    const ballProximity = Math.max(0, 1 - (distToBall - KICK_RANGE) / (KICK_RANGE * 2.5));
    const accel = PLAYER_ACCEL * (1 - ballProximity * 0.45);
    p.vx = (p.vx + ax * accel) * PLAYER_FRICTION;
    p.vy = (p.vy + ay * accel) * PLAYER_FRICTION;
    p.x += p.vx;
    p.y += p.vy;
    p.x = clamp(p.x, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS);
    p.y = clamp(p.y, PLAYER_RADIUS, PITCH_HEIGHT - PLAYER_RADIUS);
  });

  // Goal cooldown / celebration
  if (room.goalCooldown > 0) {
    room.goalCooldown--;
    if (room.goalFlash > 0) room.goalFlash--;
    if (room.goalCooldown === 0 && room.pendingReset) {
      room.pendingReset = false;
      Object.assign(ball, resetBall());
      players.forEach((p) => {
        if (p.team === "spectator") return;
        const sp = spawnPos(p.team, room.swapped);
        p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0;
      });
    }
    if (room.pendingReset) {
      ball.vx *= 0.97; ball.vy *= 0.97;
      ball.x += ball.vx; ball.y += ball.vy;
      // Bounce in net
      if (room.lastGoalTeam === "blue") {
        if (ball.x - BALL_RADIUS < -GOAL_DEPTH) { ball.x = -GOAL_DEPTH + BALL_RADIUS; ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION; }
        if (ball.x + BALL_RADIUS > 0) { ball.x = -BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION; }
        if (ball.y - BALL_RADIUS < GOAL_TOP) { ball.y = GOAL_TOP + BALL_RADIUS; ball.vy = Math.abs(ball.vy) * COLLISION_RESTITUTION; }
        if (ball.y + BALL_RADIUS > GOAL_BOT) { ball.y = GOAL_BOT - BALL_RADIUS; ball.vy = -Math.abs(ball.vy) * COLLISION_RESTITUTION; }
      } else if (room.lastGoalTeam === "red") {
        if (ball.x + BALL_RADIUS > PITCH_WIDTH + GOAL_DEPTH) { ball.x = PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION; }
        if (ball.x - BALL_RADIUS < PITCH_WIDTH) { ball.x = PITCH_WIDTH + BALL_RADIUS; ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION; }
        if (ball.y - BALL_RADIUS < GOAL_TOP) { ball.y = GOAL_TOP + BALL_RADIUS; ball.vy = Math.abs(ball.vy) * COLLISION_RESTITUTION; }
        if (ball.y + BALL_RADIUS > GOAL_BOT) { ball.y = GOAL_BOT - BALL_RADIUS; ball.vy = -Math.abs(ball.vy) * COLLISION_RESTITUTION; }
      }
    }
    return;
  }

  // Ball-player collisions
  const allPlayers = [...players.values()].filter(p => p.team !== "spectator");
  const getTeammates = (pl) => allPlayers.filter(o => o !== pl && o.team === pl.team);

  for (const p of allPlayers) {
    playerBallCollision(p, ball, p.kicking, getTeammates(p));
  }

  // Player-player collisions
  for (let i = 0; i < allPlayers.length; i++) {
    for (let j = i + 1; j < allPlayers.length; j++) {
      resolveCircleCollision(allPlayers[i], PLAYER_RADIUS, allPlayers[j], PLAYER_RADIUS);
    }
  }

  // Ball physics
  const goal = tickBall(ball);

  // Clamp ball
  const inLeftGoal = ball.x < 0 && ball.y > GOAL_TOP && ball.y < GOAL_BOT;
  const inRightGoal = ball.x > PITCH_WIDTH && ball.y > GOAL_TOP && ball.y < GOAL_BOT;
  if (!inLeftGoal && !inRightGoal) {
    ball.x = clamp(ball.x, BALL_RADIUS, PITCH_WIDTH - BALL_RADIUS);
  }
  ball.y = clamp(ball.y, BALL_RADIUS, PITCH_HEIGHT - BALL_RADIUS);

  // Kick-off detection
  if (!room.kickedOff && Math.hypot(ball.vx, ball.vy) > 0.1) room.kickedOff = true;

  // Timer
  if (!room.gameOver && room.kickedOff && !room.pendingReset) {
    room.timeLeft = Math.max(0, room.timeLeft - 1 / 60);
    if (room.half === 1 && room.timeLeft <= 150) {
      room.half = 2;
      room.swapped = true;
      room.halftimeFlash = 180;
      room.goalCooldown = 180;
      room.kickedOff = false;
      Object.assign(ball, resetBall());
      players.forEach((p) => {
        if (p.team === "spectator") return;
        const sp = spawnPos(p.team, true);
        p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0;
      });
    }
    if (room.timeLeft === 0 && !room.gameOver) {
      room.gameOver = true;
    }
  }
  if (room.halftimeFlash > 0) room.halftimeFlash--;

  // Goal scoring
  if (goal && !room.pendingReset) {
    const scorer = room.swapped ? (goal === "red" ? "blue" : "red") : goal;
    room.score[scorer]++;
    room.kickedOff = false;
    room.goalCooldown = 180;
    room.goalFlash = 60;
    room.lastGoalTeam = goal;
    room.pendingReset = true;
  }
}

// ── Broadcast snapshot to all clients ───────────────────────────

function broadcast(room) {
  const playersArr = [];
  room.players.forEach((p, id) => {
    playersArr.push({
      id, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      team: p.team, name: p.name,
      kicking: p.kicking, charging: p.charging,
    });
  });

  const snapshot = JSON.stringify({
    type: "snapshot",
    ball: { x: room.ball.x, y: room.ball.y, vx: room.ball.vx, vy: room.ball.vy },
    players: playersArr,
    score: room.score,
    timeLeft: room.timeLeft,
    half: room.half,
    swapped: room.swapped,
    kickedOff: room.kickedOff,
    gameOver: room.gameOver,
    goalFlash: room.goalFlash,
    goalCooldown: room.goalCooldown,
    lastGoalTeam: room.lastGoalTeam,
    pendingReset: room.pendingReset,
    halftimeFlash: room.halftimeFlash,
  });

  room.players.forEach((p) => {
    if (p.ws.readyState === 1) p.ws.send(snapshot);
  });
}

function startRoom(room) {
  if (room.tickInterval) return;
  room.tickInterval = setInterval(() => tick(room), TICK_MS);
  room.broadcastInterval = setInterval(() => broadcast(room), BROADCAST_MS);
}

function stopRoom(room) {
  clearInterval(room.tickInterval);
  clearInterval(room.broadcastInterval);
  room.tickInterval = null;
  room.broadcastInterval = null;
}

// ── WebSocket handling ──────────────────────────────────────────

let nextId = 1;

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const roomId = url.searchParams.get("room");
  if (!roomId) { ws.close(4001, "missing ?room="); return; }

  const id = nextId++;

  if (!rooms.has(roomId)) rooms.set(roomId, createRoom(roomId));
  const room = rooms.get(roomId);

  // Send welcome with ID
  ws.send(JSON.stringify({ type: "welcome", id }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Join team
      if (msg.type === "join") {
        const sp = spawnPos(msg.team, room.swapped);
        room.players.set(id, {
          ws, x: sp.x, y: sp.y, vx: 0, vy: 0,
          team: msg.team, name: msg.name || `Player ${id}`,
          input: { ax: 0, ay: 0, kick: false },
          charge: 0, wasKicking: false, kickReleasePower: 0, kickBuffer: 0,
          kicking: 0, charging: 0,
        });
        startRoom(room);
        return;
      }

      // Input update (sent every frame by client)
      if (msg.type === "input") {
        const p = room.players.get(id);
        if (p) {
          p.input.ax = msg.ax || 0;
          p.input.ay = msg.ay || 0;
          p.input.kick = !!msg.kick;
        }
        return;
      }
    } catch (_) {}
  });

  ws.on("close", () => {
    room.players.delete(id);
    if (room.players.size === 0) {
      stopRoom(room);
      rooms.delete(roomId);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Game server on ws://0.0.0.0:${PORT} (60fps physics, ${BROADCAST_MS}ms snapshots)`);
});
