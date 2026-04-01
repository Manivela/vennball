import { chromium } from "playwright";

function nonEmpty(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseBool(value, defaultValue) {
  const normalized = nonEmpty(value).toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseArgs(argv) {
  const config = {
    url: nonEmpty(process.env.STRESS_URL) || "https://vennball.vercel.app",
    room: nonEmpty(process.env.STRESS_ROOM) || "stress-test",
    players: Number(process.env.STRESS_PLAYERS || 12),
    durationSec: Number(process.env.STRESS_DURATION || 30),
    intervalMs: Number(process.env.STRESS_SAMPLE_MS || 1000),
    headless: parseBool(process.env.STRESS_HEADLESS, true),
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    if (key === "url" && nonEmpty(value)) config.url = nonEmpty(value);
    if (key === "room" && nonEmpty(value)) config.room = nonEmpty(value);
    if (key === "players" && value) config.players = Number(value);
    if (key === "duration" && value) config.durationSec = Number(value);
    if (key === "sample-ms" && value) config.intervalMs = Number(value);
    if (key === "headless") config.headless = parseBool(value, true);
  }

  return config;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[index];
}

async function createPlayer(browser, index, config) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const team = index % 2 === 0 ? "red" : "blue";
  const name = `Bot${String(index + 1).padStart(2, "0")}`;
  const joinUrl = `${config.url}/?name=${encodeURIComponent(name)}&room=${encodeURIComponent(config.room)}&team=${team}`;

  await page.addInitScript(() => {
    window.__stress = {
      frameDeltas: [],
      lastFrameTs: 0,
      ballJumps: [],
      ballCorrections: [],
      prevBall: null,
    };
    const loop = (ts) => {
      const s = window.__stress;
      if (s.lastFrameTs) {
        const delta = ts - s.lastFrameTs;
        if (delta > 0 && delta < 1000) {
          s.frameDeltas.push(delta);
          if (s.frameDeltas.length > 600) s.frameDeltas.shift();
        }
      }

      const g = window.__game;
      const ball = g?.ball;
      if (ball && Number.isFinite(ball.x) && Number.isFinite(ball.y)) {
        if (s.prevBall) {
          const jump = Math.hypot(ball.x - s.prevBall.x, ball.y - s.prevBall.y);
          const predictedX = s.prevBall.x + (s.prevBall.vx || 0);
          const predictedY = s.prevBall.y + (s.prevBall.vy || 0);
          const correction = Math.hypot(ball.x - predictedX, ball.y - predictedY);
          s.ballJumps.push(jump);
          s.ballCorrections.push(correction);
          if (s.ballJumps.length > 600) s.ballJumps.shift();
          if (s.ballCorrections.length > 600) s.ballCorrections.shift();
        }
        s.prevBall = {
          x: ball.x,
          y: ball.y,
          vx: ball.vx || 0,
          vy: ball.vy || 0,
        };
      }

      s.lastFrameTs = ts;
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
  });

  await page.goto(joinUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.bringToFront();

  return { page, context, name, team, index };
}

async function runInputLoop(player, stopAt) {
  const keySets = [
    ["KeyW", "KeyA"],
    ["KeyW", "KeyD"],
    ["KeyS", "KeyA"],
    ["KeyS", "KeyD"],
    ["KeyW"],
    ["KeyA"],
    ["KeyS"],
    ["KeyD"],
  ];

  while (Date.now() < stopAt) {
    const keys = keySets[Math.floor(Math.random() * keySets.length)];
    const holdMs = 180 + Math.floor(Math.random() * 620);

    for (const key of keys) {
      await player.page.keyboard.down(key);
    }

    if (Math.random() < 0.3) {
      await player.page.keyboard.down("Space");
      await sleep(50 + Math.floor(Math.random() * 120));
      await player.page.keyboard.up("Space");
    }

    await sleep(holdMs);

    for (const key of keys) {
      await player.page.keyboard.up(key);
    }

    await sleep(70 + Math.floor(Math.random() * 220));
  }
}

async function samplePlayer(player) {
  return player.page.evaluate(() => {
    const g = window.__game;
    const s = window.__stress;
    if (!g) return null;

    let totalInterpError = 0;
    let remoteCount = 0;

    if (g.remotePlayers && typeof g.remotePlayers.forEach === "function") {
      g.remotePlayers.forEach((rp) => {
        remoteCount += 1;
        const dx = (rp?.targetX ?? rp?.x ?? 0) - (rp?.x ?? 0);
        const dy = (rp?.targetY ?? rp?.y ?? 0) - (rp?.y ?? 0);
        totalInterpError += Math.hypot(dx, dy);
      });
    }

    const frameDeltas = Array.isArray(s?.frameDeltas) ? s.frameDeltas : [];
    const last120 = frameDeltas.slice(-120);
    const ballJumps = Array.isArray(s?.ballJumps) ? s.ballJumps.slice(-180) : [];
    const ballCorrections = Array.isArray(s?.ballCorrections) ? s.ballCorrections.slice(-180) : [];

    return {
      remoteCount,
      interpErrorAvg: remoteCount ? totalInterpError / remoteCount : 0,
      frameDeltas: last120,
      ballJumps,
      ballCorrections,
    };
  });
}

async function main() {
  const config = parseArgs(process.argv.slice(2));

  if (!Number.isFinite(config.players) || config.players < 2) {
    throw new Error("players must be >= 2");
  }
  if (!Number.isFinite(config.durationSec) || config.durationSec < 10) {
    throw new Error("duration must be >= 10 seconds");
  }

  console.log("Stress test config:");
  console.log(`  url: ${config.url}`);
  console.log(`  room: ${config.room}`);
  console.log(`  players: ${config.players}`);
  console.log(`  duration: ${config.durationSec}s`);
  console.log(`  sample interval: ${config.intervalMs}ms`);
  console.log(`  headless: ${config.headless}`);

  const browser = await chromium.launch({ headless: config.headless });
  const players = [];

  try {
    for (let i = 0; i < config.players; i += 1) {
      const player = await createPlayer(browser, i, config);
      players.push(player);
      await sleep(120);
    }

    console.log(`Joined ${players.length} simulated players.`);

    const stopAt = Date.now() + config.durationSec * 1000;
    const inputTasks = players.map((player) => runInputLoop(player, stopAt));

    const perTick = [];
    const remoteCounts = [];
    const interpErrors = [];
    const frameJitters = [];
    const ballJumpP95s = [];
    const ballJumpP99s = [];
    const ballCorrectionP95s = [];
    const ballSnapRates = [];

    while (Date.now() < stopAt) {
      const samples = await Promise.all(players.map((player) => samplePlayer(player)));
      const valid = samples.filter(Boolean);
      if (valid.length) {
        const avgRemote = mean(valid.map((sample) => sample.remoteCount));
        const avgInterpError = mean(valid.map((sample) => sample.interpErrorAvg));
        const allFrameDeltas = valid.flatMap((sample) => sample.frameDeltas || []);
        const allBallJumps = valid.flatMap((sample) => sample.ballJumps || []);
        const allBallCorrections = valid.flatMap((sample) => sample.ballCorrections || []);
        const frameP95 = percentile(allFrameDeltas, 95);
        const ballJumpP95 = percentile(allBallJumps, 95);
        const ballJumpP99 = percentile(allBallJumps, 99);
        const ballCorrectionP95 = percentile(allBallCorrections, 95);
        const snapThresholdPx = 18;
        const snapRate = allBallCorrections.length
          ? allBallCorrections.filter((value) => value > snapThresholdPx).length / allBallCorrections.length
          : 0;

        perTick.push({ avgRemote, avgInterpError, frameP95, ballJumpP95, ballCorrectionP95, snapRate });
        remoteCounts.push(avgRemote);
        interpErrors.push(avgInterpError);
        frameJitters.push(frameP95);
        ballJumpP95s.push(ballJumpP95);
        ballJumpP99s.push(ballJumpP99);
        ballCorrectionP95s.push(ballCorrectionP95);
        ballSnapRates.push(snapRate);
      }

      await sleep(config.intervalMs);
    }

    await Promise.allSettled(inputTasks);

    const expectedRemote = config.players - 1;
    const finalReport = {
      expectedRemotePerClient: expectedRemote,
      avgRemoteSeen: mean(remoteCounts),
      minRemoteSeen: remoteCounts.length ? Math.min(...remoteCounts) : 0,
      avgInterpErrorPx: mean(interpErrors),
      p95InterpErrorPx: percentile(interpErrors, 95),
      avgFrameDeltaMs: mean(frameJitters),
      p95FrameDeltaMs: percentile(frameJitters, 95),
      avgBallJumpP95Px: mean(ballJumpP95s),
      p95BallJumpP95Px: percentile(ballJumpP95s, 95),
      p95BallJumpP99Px: percentile(ballJumpP99s, 95),
      avgBallCorrectionP95Px: mean(ballCorrectionP95s),
      p95BallCorrectionP95Px: percentile(ballCorrectionP95s, 95),
      avgBallSnapRate: mean(ballSnapRates),
      p95BallSnapRate: percentile(ballSnapRates, 95),
      samples: perTick.length,
    };

    console.log("\n=== Stress Summary ===");
    console.log(JSON.stringify(finalReport, null, 2));

    const visibilityRatio = expectedRemote > 0 ? finalReport.avgRemoteSeen / expectedRemote : 1;
    console.log("\nHeuristic result:");
    if (visibilityRatio < 0.7) {
      console.log("  ❌ Peer visibility is low (<70%). Check signaling connectivity and NAT reachability.");
    } else if (finalReport.p95BallCorrectionP95Px > 18 || finalReport.p95BallSnapRate > 0.08) {
      console.log("  ⚠️ Ball sync jitter detected (frequent correction snaps/teleports).");
    } else if (finalReport.p95FrameDeltaMs > 35 || finalReport.p95InterpErrorPx > 30) {
      console.log("  ⚠️ Connectivity mostly works, but smoothness is weak (high frame/interpolation jitter).");
    } else {
      console.log("  ✅ Visibility and smoothness look healthy for this load profile.");
    }
  } finally {
    await Promise.allSettled(players.map((player) => player.context.close()));
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Stress test failed:", error?.message || error);
  process.exitCode = 1;
});
