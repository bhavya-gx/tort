// 16:9 landscape cut of the Tort product demo, 15 seconds. Same idea as
// record.mjs: the REAL web build runs inside a CSS MacBook and every beat is a
// real mouse event, nothing about him is faked for the camera.
//
//   node tools/mockup/record-16x9.mjs  ->  out/tort-demo-16x9.mp4        (1920x1080, 30fps, 15s, gentle push in)
//                                          out/tort-demo-16x9-static.mp4 (1920x1080, 30fps, 15s, no motion)
//
// Differences from the 30s portrait cut: renders stage-16x9.html at
// 1920x1080 (a landscape laptop fits a landscape frame, so the push in is
// cosmetic here, not a workaround), and drops the "wait for his walk to end"
// beat, whose length depends on the seed and cannot be fit into 15s.
import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const WEB = "/Users/b/Cowork/desktop-pet-web";
const PORT = 4657;
const HERE = new URL(".", import.meta.url).pathname;
const OUT = HERE + "out/";
const FRAMES = OUT + "frames-16x9/";
const LENGTH = 15.0; // seconds, hard cap on the final file
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

// --- ffmpeg: the imageio-ffmpeg build lives under /usr/bin/python3 on this
// machine (the default python3 is a newer framework install without it) ---
function findFfmpeg() {
  for (const py of ["/usr/bin/python3", "python3"]) {
    try {
      const p = execFileSync(py, ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (p && existsSync(p)) return p;
    } catch {}
  }
  const known = "/Users/b/Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1";
  if (existsSync(known)) return known;
  throw new Error("no ffmpeg: pip install imageio-ffmpeg");
}
const ffmpeg = findFfmpeg();

// --- serve the 16:9 stage and the real web build from one origin ---
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  try {
    if (path === "/stage.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(HERE + "stage-16x9.html"));
    }
    const file = join(WEB, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": (TYPES[extname(file)] ?? "application/octet-stream") + "; charset=utf-8" });
    res.end(body);
  } catch (e) {
    console.warn("404", path);
    res.writeHead(404); res.end("not found");
  }
});
await new Promise((r) => server.listen(PORT, r));

const W = 1920, H = 1080, SCALE = 2;
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

let mx = 0, my = 0;
async function mouse(type, x, y, buttons = 0) {
  mx = x; my = y;
  await page.send("Input.dispatchMouseEvent", {
    type, x, y, button: buttons ? "left" : "none", buttons,
    clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0,
  });
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Deadline driven glide (see record.mjs for why a fixed sleep per step drifts).
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

let beats = {};
try {
  await page.goto(`http://127.0.0.1:${PORT}/stage.html`);
  for (let i = 0; i < 80; i++) { if (await ev("window.stageReady()")) break; await sleep(200); }
  await sleep(1400); // webfont + sprite settle

  const r0 = await rects();
  mx = r0.screen.cx; my = r0.screen.y + r0.screen.h - 30;

  await page.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W * SCALE, maxHeight: H * SCALE, everyNthFrame: 1 });
  recording = true;
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const until = async (ms) => {
    const d = t0 + ms - Date.now();
    if (d < -120) console.warn(`  beat ${ms}ms overran by ${-d | 0}ms`);
    if (d > 0) await sleep(d);
  };

  // 0.0  He is just there and says hello on his own (hello clears ~4.8s).
  await until(1900);

  // 1.9  Pet him. Hearts, no line: he does not talk over his own hello.
  //      About a second later the pet sends him crawling somewhere.
  await ev("window.cursorShow(true)");
  let r = await rects();
  await moveTo(r.pet.cx, r.pet.cy + 6, 900);
  await until(2900);
  await click(mx, my);
  beats.pet = now();

  // 4.4  Feed him: leaf out of the tray, dropped on him. He may still be
  //      crawling, so aim at where he is right before the release.
  await until(4400);
  r = await rects();
  await moveTo(r.tray.cx, r.tray.cy, 800);
  await until(5300);
  await mouse("mousePressed", mx, my, 1);
  await sleep(110);
  r = await rects();
  await moveTo(r.pet.cx, r.pet.cy + 10, 1000, 1);
  await sleep(100);
  r = await rects();
  await mouse("mouseMoved", r.pet.cx, r.pet.cy + 10, 1);
  await sleep(60);
  await mouse("mouseReleased", r.pet.cx, r.pet.cy + 10, 1);
  beats.feed = now();

  // 8.6  Pick him up and carry him across. He rides over the windows, which is
  //      the whole product. Go toward whichever side he is farther from so the
  //      move is always long enough to read.
  await until(8600);
  r = await rects();
  await moveTo(r.pet.cx, r.pet.cy + 6, 700);
  await until(9400);
  r = await rects();
  const leftX = r.screen.x + 250, rightX = r.screen.x + r.screen.w - 250;
  const toX = Math.abs(r.pet.cx - leftX) > Math.abs(r.pet.cx - rightX) ? leftX : rightX;
  await dragTo(toX, r.pet.cy + 6, 1500);
  beats.drop = now();

  // 11.9  Double-click and he is gone, leaf and all. The cursor is already on
  //       him from the release, so no move is needed.
  await until(11900);
  beats.vanish = now();
  await click(mx, my);
  await sleep(150);
  await click(mx, my);

  // 13.2  Click anywhere and he comes back.
  await until(13200);
  r = await rects();
  await moveTo(r.screen.cx + 40, r.screen.y + 330, 600);
  await until(13900);
  beats.return = now();
  await click(mx, my);
  await until(14300);
  await ev("window.cursorShow(false)");
  await until(15000);

  recording = false;
  await page.send("Page.stopScreencast");
} finally {
  page.close();
  server.close();
}

console.warn("  BEATS " + Object.entries(beats).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" "));

// --- assemble: variable screencast timing -> constant 30fps H.264 ---
if (!frames.length) throw new Error("no frames captured");
const list = frames.map((ts, i) => {
  const next = frames[i + 1] ?? ts + 2.2; // hold the last frame, the screencast emits nothing while static
  return `file '${FRAMES}f${String(i).padStart(5, "0")}.jpg'\nduration ${Math.max(0.005, next - ts).toFixed(4)}`;
}).join("\n") + `\nfile '${FRAMES}f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
writeFileSync(OUT + "frames-16x9.txt", list);

const DUR = frames.at(-1) - frames[0] + 2.2;
const NF = Math.round(Math.min(DUR, LENGTH) * 30);

// Pass one: constant 30fps master at full 2x (3840x2160). See record.mjs for
// why the crops read from a master instead of from frames.txt directly.
const MASTER = OUT + "master-16x9.mp4";
execFileSync(ffmpeg, [
  "-y", "-f", "concat", "-safe", "0", "-i", OUT + "frames-16x9.txt",
  "-fps_mode", "cfr", "-r", "30", "-c:v", "libx264", "-crf", "14", "-preset", "veryfast",
  "-pix_fmt", "yuv420p", MASTER,
], { stdio: ["ignore", "ignore", "inherit"] });

// Gentle push in, 1.00 -> 1.28 across the 15s, held on the screen's middle
// (page y 198 + 18 + 315 = 531, so 1062 in the 2x master). Frames are 2x, so
// the zoom stays inside the source resolution. zoompan's fps must be set or it
// defaults to 25 and stretches the result by 1.2x.
const push = `zoompan=z='min(1.0+0.28*on/${NF}\\,1.28)':x='iw/2-(iw/zoom/2)':y='max(0\\,min(ih-ih/zoom\\,1062-ih/zoom/2))':d=1:s=${W}x${H}:fps=30`;

const encode = (vf, file) => execFileSync(ffmpeg, [
  "-y", "-i", MASTER, "-t", String(LENGTH), "-vf", vf,
  "-fps_mode", "cfr", "-r", "30", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-movflags", "+faststart",
  OUT + file,
], { stdio: ["ignore", "ignore", "inherit"] });

encode(`${push},format=yuv420p`, "tort-demo-16x9.mp4");
encode(`scale=${W}:${H}:flags=lanczos,format=yuv420p`, "tort-demo-16x9-static.mp4");

rmSync(MASTER, { force: true });
console.log(`frames: ${frames.length}, take ~${DUR.toFixed(2)}s, file capped at ${LENGTH}s`);
console.log(`  ${OUT}tort-demo-16x9.mp4         1920x1080 (16:9, gentle push in)`);
console.log(`  ${OUT}tort-demo-16x9-static.mp4  1920x1080 (16:9, static)`);
