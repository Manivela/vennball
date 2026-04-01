# Vennball

Browser football with **P2P multiplayer** over WebRTC (Yjs + `y-webrtc`). No dedicated game server—peers sync in the room you share.

**Play:** [vennball.vercel.app](https://vennball.vercel.app)

## Develop

```bash
npm install
npm run dev
```

Open the dev server URL (use `--host` in Vite if you need LAN devices). Build with `npm run build` and preview with `npm run preview`.

## Stress test (single laptop)

Simulate many players joining one room to test peer visibility and gameplay smoothness:

```bash
npm install
npx playwright install chromium
npm run dev -- --host
npm run stress -- --url=http://127.0.0.1:5173 --players=20 --duration=180 --room=hackathon
```

Environment variables (optional):

- `STRESS_URL` (default: `https://vennball.vercel.app`)
- `STRESS_ROOM` (default: `stress-test`)
- `STRESS_PLAYERS` (default: `12`)
- `STRESS_DURATION` in seconds (default: `30`)
- `STRESS_SAMPLE_MS` (default: `1000`)
- `STRESS_HEADLESS` (default: `true`; set `false` to watch browsers)

The script prints a summary including:

- average/min remote peers seen per client
- interpolation error (target-vs-render distance)
- frame-time jitter (`p95FrameDeltaMs`)

Heuristic:

- low `avgRemoteSeen` means connectivity/signaling issues
- high `p95FrameDeltaMs` or `p95InterpErrorPx` means jittery gameplay under load

## Repo

[github.com/Manivela/vennball](https://github.com/Manivela/vennball)
