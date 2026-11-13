// Tiny Chrome DevTools Protocol driver, no dependencies (Node 22+ has fetch +
// WebSocket). Launches headless Chrome with a throwaway profile, so it never
// touches a real browser profile. Used for QA screenshots and the mockup video.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 390, height = 844, scale = 2, mobile = true } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "cdp-profile-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    // Must match deviceScaleFactor below, or the screencast comes back at 1x
    // no matter what maxWidth says and the push in ends up upscaling.
    "--disable-extensions", "--mute-audio", `--force-device-scale-factor=${scale}`,
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === "page");
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(150);
  }
  if (!wsUrl) { chrome.kill(); throw new Error("Chrome did not expose a debugging target"); }

  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = () => rej(new Error("WebSocket failed")); });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(`${m.error.message} (${m.error.code})`)) : res(m.result);
    } else if (m.method) {
      for (const fn of listeners.get(m.method) ?? []) fn(m.params);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    sock.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); return () => { const l = listeners.get(method); l.splice(l.indexOf(fn), 1); }; };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ": " + (r.exceptionDetails.exception?.description ?? ""));
    return r.result?.value;
  };
  const goto = async (url) => {
    const loaded = new Promise((r) => { const off = on("Page.loadEventFired", () => { off(); r(); }); });
    await send("Page.navigate", { url });
    await loaded;
  };
  const shot = async (path, { fullPage = false, format = "png", quality } = {}) => {
    const params = { format, captureBeyondViewport: fullPage };
    if (quality != null) params.quality = quality;
    if (fullPage) {
      const { cssContentSize } = await send("Page.getLayoutMetrics");
      params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
    }
    const r = await send("Page.captureScreenshot", params);
    if (path) writeFileSync(path, Buffer.from(r.data, "base64"));
    return r.data;
  };
  const tap = async (x, y) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await sleep(40);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const close = () => { try { sock.close(); } catch {} try { chrome.kill(); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 500); };
  return { send, on, evaluate, goto, shot, tap, close, sleep };
}
