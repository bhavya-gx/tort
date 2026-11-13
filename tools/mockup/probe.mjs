// Finds a seed whose walk beat is the right length for the cut.
//
//   node tools/mockup/probe.mjs [maxWalkSeconds]
//
// crawl() sends him to a uniformly random spot at 34px/s, so the walk in the
// "he walks off and settles" beat can be anywhere from a second to twenty.
// The seed decides it. This replays the recorder's timeline up to that beat
// for a list of seeds and reports how long each walk runs, without recording.
import http from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const WEB = "/Users/b/Cowork/desktop-pet-web";
const HERE = new URL(".", import.meta.url).pathname;
const PORT = 4656;
const MAX = Number(process.argv[2] ?? 8);
const SEEDS = process.argv[3]
  ? process.argv[3].split(',').map(Number)
  : [424242, 8080, 60606, 99, 11, 202, 3003, 44004, 555, 6006, 70007, 81, 919, 1212, 1357, 2468];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  try {
    const body = path === "/stage.html"
      ? readFileSync(HERE + "stage.html")
      : readFileSync(join(WEB, normalize(path).replace(/^(\.\.[/\\])+/, "")));
    res.writeHead(200, { "content-type": (TYPES[extname(path)] ?? "application/octet-stream") + "; charset=utf-8" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nope"); }
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
for (const seed of SEEDS) {
  const page = await launch({ width: 1080, height: 1920, scale: 1, mobile: false });
  const ev = (e) => page.evaluate(e);
  try {
    await page.goto(`http://127.0.0.1:${PORT}/stage.html?seed=${seed}`);
    for (let i = 0; i < 80; i++) { if (await ev("window.stageReady()")) break; await sleep(200); }
    await sleep(1400);
    const t0 = Date.now();
    const until = async (ms) => { const d = t0 + ms - Date.now(); if (d > 0) await sleep(d); };
    const R = async () => JSON.parse(await ev("JSON.stringify(window.rects())"));
    const M = (type, x, y, b = 0) => page.send("Input.dispatchMouseEvent",
      { type, x, y, button: b ? "left" : "none", buttons: b, clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0 });
    const clickAt = async (x, y) => { await M("mousePressed", x, y, 1); await sleep(70); await M("mouseReleased", x, y, 1); };

    // same RNG-consuming beats, same wall clock, as record.mjs
    let r = await R();
    await until(3400); await clickAt(r.pet.cx, r.pet.cy + 6);          // pet 1
    await until(8900); r = await R();
    await M("mousePressed", r.tray.cx, r.tray.cy, 1);                   // leaf
    await sleep(200); r = await R();
    await M("mouseMoved", r.pet.cx, r.pet.cy + 10, 1);
    await M("mouseReleased", r.pet.cx, r.pet.cy + 10, 1);
    await until(14100); r = await R();
    await M("mousePressed", r.pet.cx, r.pet.cy + 6, 1);                 // drag
    await sleep(90); await M("mouseMoved", r.screen.cx - 170, r.pet.cy + 6, 1);
    await sleep(90); await M("mouseReleased", r.screen.cx - 170, r.pet.cy + 6, 1);
    await until(16800); await clickAt(mxy(r).x, mxy(r).y);              // pet 2 -> crawl

    const start = Date.now();
    let walk = null;
    while (Date.now() - start < (MAX + 2.5) * 1000) {
      await sleep(200);
      if (Date.now() - start < 1500) continue;            // crawl starts ~1.2s after the click
      if ((await ev("document.getElementById('pet').dataset.state")) === "idle") {
        walk = (Date.now() - start - 1220) / 1000; break;
      }
    }
    // Where he stops matters as much as how long he walks: the push in crops
    // to roughly page x 287..792, so a walk that ends outside that band leaves
    // him out of frame for the whole rest of the film.
    const endX = (await R()).pet.cx;
    const inFrame = endX >= 300 && endX <= 780;
    results.push({ seed, walk, endX, inFrame });
    console.log(`seed ${String(seed).padStart(11)}  walk ${(walk === null ? "> " + MAX : walk.toFixed(1)).padStart(5)}s`
      + `  ends x=${endX.toFixed(0).padStart(4)}  ${inFrame ? "in frame" : "OUT OF FRAME"}`);
  } finally { page.close(); }
}
server.close();

function mxy(r) { return { x: r.screen.cx - 170, y: r.pet.cy + 6 }; }

const good = results.filter((r) => r.walk !== null && r.walk >= 3.5 && r.walk <= MAX && r.inFrame)
                    .sort((a, b) => b.walk - a.walk);
console.log(good.length
  ? `\nbest: seed ${good[0].seed} (${good[0].walk.toFixed(1)}s walk, ends x=${good[0].endX.toFixed(0)})`
  : `\nno seed gave a 3.5-${MAX}s walk that also ends in frame`);
