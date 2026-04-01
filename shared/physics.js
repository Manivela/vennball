// Shared physics — used by both server and client
export const PITCH_WIDTH = 1200;
export const PITCH_HEIGHT = 550;
export const GOAL_HEIGHT = 160;
export const GOAL_DEPTH = 36;
export const PLAYER_RADIUS = 16;
export const BALL_RADIUS = 10;
export const PLAYER_ACCEL = 0.42;
export const PLAYER_FRICTION = 0.88;
export const BALL_FRICTION = 0.986;
export const KICK_FORCE = 7;
export const KICK_RANGE = PLAYER_RADIUS + BALL_RADIUS + 18;
export const BALL_MAX_SPEED = 14;
export const COLLISION_RESTITUTION = 0.7;
export const PASS_MAGNET = 0.35;
export const PASS_CONE = Math.cos(Math.PI / 4);
export const CHARGE_MAX = 30;
export const KICK_MIN_MULT = 0.4;
export const KICK_MAX_MULT = 1.8;

export const GOAL_TOP = (PITCH_HEIGHT - GOAL_HEIGHT) / 2;
export const GOAL_BOT = (PITCH_HEIGHT + GOAL_HEIGHT) / 2;

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function resetBall() {
  return { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2, vx: 0, vy: 0 };
}

export function assistDir(player, ball, nx, ny, teammates) {
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

export function playerBallCollision(player, ball, kickPower, teammates) {
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

export function resolveCircleCollision(a, aRadius, b, bRadius) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minDist = aRadius + bRadius;
  if (d >= minDist || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  const overlap = minDist - d;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
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

export function tickBall(ball) {
  ball.vx *= BALL_FRICTION;
  ball.vy *= BALL_FRICTION;
  if (Math.abs(ball.vx) < 0.01) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.01) ball.vy = 0;
  const spd = Math.hypot(ball.vx, ball.vy);
  if (spd > BALL_MAX_SPEED) {
    ball.vx = (ball.vx / spd) * BALL_MAX_SPEED;
    ball.vy = (ball.vy / spd) * BALL_MAX_SPEED;
  }
  ball.x += ball.vx;
  ball.y += ball.vy;
  if (ball.y - BALL_RADIUS < 0) { ball.y = BALL_RADIUS; ball.vy = Math.abs(ball.vy) * COLLISION_RESTITUTION; }
  if (ball.y + BALL_RADIUS > PITCH_HEIGHT) { ball.y = PITCH_HEIGHT - BALL_RADIUS; ball.vy = -Math.abs(ball.vy) * COLLISION_RESTITUTION; }
  if (ball.x - BALL_RADIUS < 0) {
    if (ball.y > GOAL_TOP && ball.y < GOAL_BOT) {
      if (ball.x - BALL_RADIUS < -GOAL_DEPTH) { ball.x = -GOAL_DEPTH + BALL_RADIUS; ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION; }
      return "blue";
    }
    ball.x = BALL_RADIUS; ball.vx = Math.abs(ball.vx) * COLLISION_RESTITUTION;
  }
  if (ball.x + BALL_RADIUS > PITCH_WIDTH) {
    if (ball.y > GOAL_TOP && ball.y < GOAL_BOT) {
      if (ball.x + BALL_RADIUS > PITCH_WIDTH + GOAL_DEPTH) { ball.x = PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION; }
      return "red";
    }
    ball.x = PITCH_WIDTH - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * COLLISION_RESTITUTION;
  }
  return null;
}
