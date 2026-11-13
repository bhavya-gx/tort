// Renders the Tort product demo: a MacBook as the subject on a clean ground,
// with the REAL web build of Tort running inside the screen, on top of the
// desktop windows. Nothing about him is faked for the camera: every beat below
// is a real mouse event landing on the real app, so what the video shows is
// what the product does.
//
//   node tools/mockup/record.mjs   ->   out/tort-demo.mp4  (1080x1920, 30fps)
//
// Beats are edited in the timeline at the bottom (`until(ms)`).
import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const WEB = "/Users/b/Cowork/desktop-pet-web";
const PORT = 4655;
const HERE = new URL(".", import.meta.url).pathname;
const OUT = HERE + "out/";
const FRAMES = OUT + "frames/";
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

// --- serve stage.html and the real web build from one origin ---
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  try {
    if (path === "/stage.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(HERE + "stage.html"));
    }
    const file = join(WEB, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    const body = readFileSync(file); // read first: a throw here must not land after writeHead
    res.writeHead(200, { "content-type": (TYPES[extname(file)] ?? "application/octet-stream") + "; charset=utf-8" });
    res.end(body);
  } catch (e) {
    console.warn("404", path);
    res.writeHead(404); res.end("not found");
  }
});
await new Promise((r) => server.listen(PORT, r));

const W = 1080, H = 1920, SCALE = 2;
const page = await launch({ width: W, height: H, scale: SCALE, mobile: false });

const frames = [];
let recording = false;
page.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  if (recording) {
    writeFileSync(`${FRAMES}f${String(frames.length).padStart(5, "0")}.jpg`, Buffer.from(data, "base64"));
    frames.push(metadata.timestamp);
  }
  try { await page.send("Page.screencastFrameAck", { sessionId }); } catch {}
});

const ev = (expr) => page.evaluate(expr);
const rects = () => ev("JSON.stringify(window.rects())").then(JSON.parse);

// --- real input, dispatched at page coordinates ---
let mx = 0, my = 0;
async function mouse(type, x, y, buttons = 0) {
  mx = x; my = y;
  await page.send("Input.dispatchMouseEvent", {
    type, x, y, button: buttons ? "left" : "none", buttons,
    clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0,
  });
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Human-ish glide, with a slight arc so it never reads as a linear tween.
// Deadline driven on purpose: a fixed sleep per step would add one CDP round
// trip of latency on top of every step, so a "1150ms" move really took closer
// to two seconds and every later beat slid past its mark. Here the position is
// a function of the wall clock, so the move always lands on time and only the
// number of samples varies with how fast the connection is.
async function moveTo(x, y, ms = 900, buttons = 0) {
  const x0 = mx, y0 = my, start = Date.now();
  const arc = (x - x0) * 0.06;
  for (;;) {
    const p = Math.min(1, (Date.now() - start) / ms);
    const e = ease(p);
    await mouse("mouseMoved", x0 + (x - x0) * e, y0 + (y - y0) * e - Math.sin(e * Math.PI) * arc, buttons);
    if (p >= 1) return;
    await sleep(12);
  }
}
async function click(x, y) {
  await mouse("mousePressed", x, y, 1);
  await sleep(70);
  await mouse("mouseReleased", x, y, 1);
}
async function dragTo(x, y, ms = 1200) {
  await mouse("mousePressed", mx, my, 1);
  await sleep(90);
  await moveTo(x, y, ms, 1);
  await sleep(90);
  await mouse("mouseReleased", mx, my, 1);
}

try {
  await page.goto(`http://127.0.0.1:${PORT}/stage.html`);
  for (let i = 0; i < 80; i++) { if (await ev("window.stageReady()")) break; await sleep(200); }
  await sleep(1400); // webfont + sprite settle

  const r0 = await rects();
  mx = r0.screen.cx; my = r0.screen.y + r0.screen.h - 30;

  await page.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
  recording = true;
  const t0 = Date.now();
  const until = async (ms) => {
    const d = t0 + ms - Date.now();
    if (d < -120) console.warn(`  beat ${ms}ms overran by ${-d | 0}ms`);
    if (d > 0) await sleep(d);
  };

  // ---------------------------------------------------------------------
  // 0.0  He is just there. No UI, no onboarding. He says hello on his own.
  // ---------------------------------------------------------------------
  await until(2100);

  // ---------------------------------------------------------------------
  // 2.1  Click him. Hearts, but no line: his hello is still on screen and he
  //      does not talk over himself. Timed deliberately inside that window
  //      (hello clears around 4.7s), so the silence is not luck.
  // ---------------------------------------------------------------------
  await ev("window.cursorShow(true)");
  let r = await rects();
  await moveTo(r.pet.cx, r.pet.cy + 6, 1000);
  await until(3400);
  await click(mx, my);
  await until(7600);

  // ---------------------------------------------------------------------
  // 7.6  Feed him: drag the leaf out of the tray and drop it on him.
  // ---------------------------------------------------------------------
  r = await rects();
  await moveTo(r.tray.cx, r.tray.cy, 950);
  await until(8900);
  r = await rects();
  await mouse("mousePressed", mx, my, 1);
  await sleep(110);
  await moveTo(r.pet.cx, r.pet.cy + 10, 1150, 1);
  await sleep(120);
  r = await rects(); // he may still be crawling, so aim at where he is now
  await mouse("mouseMoved", r.pet.cx, r.pet.cy + 10, 1);
  await sleep(60);
  await mouse("mouseReleased", r.pet.cx, r.pet.cy + 10, 1);
  await until(13000);

  // ---------------------------------------------------------------------
  // 13.0  Pick him up and put him somewhere else. He rides over the windows.
  // ---------------------------------------------------------------------
  r = await rects();
  await moveTo(r.pet.cx, r.pet.cy + 6, 850);
  await until(14100);
  await dragTo(r.screen.cx - 170, r.pet.cy + 6, 2000);
  await until(16800);

  // ---------------------------------------------------------------------
  // 16.8  Pet him once more. Nothing is on screen this time so he answers,
  //       and a pet is what sends him walking: he sets off about a second
  //       later, crosses at his own speed and settles wherever he stops.
  //       The cursor leaves him alone for the whole of it.
  // ---------------------------------------------------------------------
  // The drag released on him, so the cursor is already there. Moving to him
  // again would push this beat a second past its mark.
  r = await rects();
  await until(16800);
  await click(mx, my);
  await moveTo(r.screen.cx + 210, r.screen.y + 250, 1400); // step back, let him go

  // crawl() sends him to a random spot at 34px/s, so the walk is a different
  // length every seed and cannot be timed in advance. Wait for him to actually
  // come to rest, then hold on him, and let the rest of the film follow from
  // there. REST_HOLD is the pause on him sitting still before he is dismissed.
  const REST_HOLD = 1800;
  const walkStart = Date.now();
  while (Date.now() - walkStart < 22000) {
    if ((await ev("document.getElementById('pet').dataset.state")) === "idle") break;
    await sleep(200);
  }
  const restAt = Date.now() - t0;
  console.warn(`  came to rest at ${(restAt / 1000).toFixed(2)}s (walked ${((restAt - 18020) / 1000).toFixed(1)}s)`);
  await sleep(REST_HOLD);

  // ---------------------------------------------------------------------
  // 25.5  Double-click and he is gone, leaf and all. Your screen is yours.
  //       No hearts and no line on the way out: a double-click is "hide him".
  // ---------------------------------------------------------------------
  // Everything from here is relative to where he stopped, not to the clock,
  // because the walk's length is not knowable in advance. The cue sheet in
  // score.py reads these same offsets back out of the printed beat log.
  r = await rects();
  await moveTo(r.pet.cx, r.pet.cy + 6, 1000);
  const tVanish = Date.now() - t0;
  await click(mx, my);
  await sleep(150);
  await click(mx, my);
  await sleep(2700);

  // ---------------------------------------------------------------------
  // Click anywhere and he comes back.
  // ---------------------------------------------------------------------
  r = await rects();
  await moveTo(r.screen.cx + 60, r.screen.y + 340, 900);
  await sleep(300);
  const tReturn = Date.now() - t0;
  await click(mx, my);
  await sleep(1200);
  await ev("window.cursorShow(false)");
  await sleep(1800);

  console.warn(`  BEATS vanish=${(tVanish / 1000 + 0.29).toFixed(2)} return=${(tReturn / 1000).toFixed(2)}`);

  recording = false;
  await page.send("Page.stopScreencast");
} finally {
  page.close();
  server.close();
}

// --- assemble: variable screencast timing -> constant 30fps H.264 ---
if (!frames.length) throw new Error("no frames captured");
const list = frames.map((ts, i) => {
  // The screencast emits nothing while the screen is static, so the take
  // would otherwise end the instant he reappears. Hold the last frame.
  const next = frames[i + 1] ?? ts + 2.2;
  return `file '${FRAMES}f${String(i).padStart(5, "0")}.jpg'\nduration ${Math.max(0.005, next - ts).toFixed(4)}`;
}).join("\n") + `\nfile '${FRAMES}f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
writeFileSync(OUT + "frames.txt", list);

const ffmpeg = execFileSync("python3", ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
const DUR = frames.at(-1) - frames[0] + 2.2; // + the tail hold above
const NF = Math.round(DUR * 30);

// Pass one: the take at full 2x, resampled to a constant 30fps. Everything
// downstream reads from this rather than from frames.txt, because the concat
// demuxer's variable durations and an `fps` filter disagree about how many
// frames the timeline holds (968 vs 904 on the same input), and zoompan's `on`
// counter has to map exactly onto elapsed time or the push in drifts.
const MASTER = OUT + "master.mp4";
execFileSync(ffmpeg, [
  "-y", "-f", "concat", "-safe", "0", "-i", OUT + "frames.txt",
  "-fps_mode", "cfr", "-r", "30", "-c:v", "libx264", "-crf", "14", "-preset", "veryfast",
  "-pix_fmt", "yuv420p", MASTER,
], { stdio: ["ignore", "ignore", "inherit"] });

// A landscape laptop can never fill a 9:16 frame, so instead of parking it in
// a sea of white the shot opens on the whole Mac (he really is a small thing
// on your desktop, which is the honest first impression) and pushes in slowly
// until you can read his face. Done here rather than as a CSS transform so the
// page stays at scale 1: pet-web.js mixes untransformed CSS px with page px
// while dragging, and any scale on the stage would make him outrun the cursor.
// Frames are captured at 2x, so this zoom stays inside the source resolution.
// zoompan, not crop: crop's output size is fixed when the graph is built, so a
// per-frame size expression makes it fail on reinit. zoompan is the filter
// built for a moving window. It crops iw/zoom by ih/zoom out of the 2x frames
// and scales that to 1080x1920, so the push in costs no real resolution.
// The window is held on the screen's middle (2x page y 1786) so Tort, who
// lives along the bottom edge, stays in frame the whole way in. zoompan's own
// fps defaults to 25; leaving it would stretch the result by 1.2x.
const push = `zoompan=z='min(1.05+0.70*on/${NF}\\,1.75)':x='iw/2-(iw/zoom/2)':y='max(0\\,min(ih-ih/zoom\\,1786-ih/zoom/2))':d=1:s=${W}x${H}:fps=30`;

const encode = (vf, file) => execFileSync(ffmpeg, [
  "-y", "-i", MASTER, "-vf", vf,
  "-fps_mode", "cfr", "-r", "30", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-movflags", "+faststart",
  OUT + file,
], { stdio: ["ignore", "ignore", "inherit"] });

// 9:16 for Reels, IG and LinkedIn video.
encode(`${push},format=yuv420p`, "tort-demo.mp4");

// 4:5 as well. It is the same take with the dead space above and below the
// laptop cropped off, which suits a landscape device far better, and both
// LinkedIn and Instagram run it full width in feed.
encode(`crop=2160:2700:0:454,scale=1080:1350:flags=lanczos,format=yuv420p`, "tort-demo-4x5.mp4");

rmSync(MASTER, { force: true });
console.log(`frames: ${frames.length}, duration ~${DUR.toFixed(2)}s`);
console.log(`  ${OUT}tort-demo.mp4      1080x1920 (9:16, slow push in)`);
console.log(`  ${OUT}tort-demo-4x5.mp4  1080x1350 (4:5, static)`);
