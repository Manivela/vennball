# Vennball — Feature List

## Multiplayer
- **P2P via WebRTC** — no game server; peers connect directly using Yjs + y-webrtc
- **Share URL to invite** — anyone with the room URL joins instantly
- **Host-authoritative ball** — lowest clientID peer runs ball physics + scoring; others reconcile via lerp

## Gameplay
- **Real-time physics** — ball friction, wall bouncing, player–ball collision
- **Kick mechanic** — Space / X / KICK button launches ball in movement direction
- **Team selection** — Red vs Blue; players spawn on their half
- **Scoring** — goals tracked live; "GOL!" flash animation on score

## Mobile
- **Responsive canvas** — pitch scales to fill any viewport
- **Portrait auto-rotation** — canvas rotates 90° on portrait screens so the landscape pitch fills the screen naturally
- **Virtual joystick + KICK button** — touch controls overlay for mobile play

## Developer / Testing
- **Instant test URLs** — `?name=X&room=Y&team=Z` skips login for fast local testing
- **`window.__game` exposed** — Playwright / DevTools can inspect live game state
- **Local network dev server** — accessible from phones on the same Wi-Fi (`vite --host`)
