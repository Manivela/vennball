export const signalingServers = ["wss://webrtc-signaling.fly.dev"];

export const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

// Game world
export const PITCH_WIDTH = 1200;
export const PITCH_HEIGHT = 550;
export const GOAL_HEIGHT = 160;
export const GOAL_DEPTH = 36;

// Entities
export const PLAYER_RADIUS = 16;
export const BALL_RADIUS = 10;

// Physics
export const PLAYER_ACCEL = 0.42;
export const PLAYER_FRICTION = 0.88;
export const PLAYER_ACCEL_MOBILE = 0.28;
export const BALL_FRICTION = 0.986;
export const KICK_FORCE = 7;
export const KICK_RANGE = PLAYER_RADIUS + BALL_RADIUS + 8;
export const BALL_MAX_SPEED = 14;
export const COLLISION_RESTITUTION = 0.7;

// Net sync
export const BROADCAST_INTERVAL = 33; // ~30fps
