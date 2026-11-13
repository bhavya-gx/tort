"""Speed the Tort demo up and score it.

    python3 tools/mockup/score.py

Reads out/tort-demo.mp4, writes out/tort-demo-sound.mp4 at SPEED with a
synthesised effects track. Every sound is generated here from sine sweeps and
filtered noise, so there is nothing to license and nothing to download.

Cue times below are the ORIGINAL timeline from record.mjs (the `until(ms)`
marks), divided by SPEED at placement time. If you edit a beat there, edit the
matching cue here.
"""
import subprocess, pathlib
import numpy as np
from scipy.signal import butter, lfilter

SR = 48_000
SPEED = 1.2
HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
SRC = OUT / "tort-demo.mp4"
WAV = OUT / "sfx.wav"
DST = OUT / "tort-demo-sound.mp4"

rng = np.random.default_rng(7)


# ---------- building blocks ----------

def t(n):
    return np.arange(n) / SR


def env(n, attack=0.004, hold=0.0, curve=4.0):
    """Fast attack, exponential fall. Keeps everything percussive and small."""
    a = max(1, int(attack * SR))
    h = int(hold * SR)
    d = max(1, n - a - h)
    return np.concatenate([
        np.linspace(0, 1, a),
        np.ones(h),
        np.exp(-curve * np.linspace(0, 1, d)),
    ])[:n]


def sweep(f0, f1, dur, kind="sin"):
    n = int(dur * SR)
    f = np.linspace(f0, f1, n)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) if kind == "sin" else np.sign(np.sin(phase)) * 0.4


def noise(dur, lo=None, hi=None):
    n = int(dur * SR)
    x = rng.normal(0, 1, n)
    if hi:
        b, a = butter(2, min(hi / (SR / 2), 0.99), btype="low")
        x = lfilter(b, a, x)
    if lo:
        b, a = butter(2, max(lo / (SR / 2), 1e-4), btype="high")
        x = lfilter(b, a, x)
    return x


def bell(f, dur, gain=1.0):
    """Two partials, slight inharmonicity. Soft, not glassy."""
    n = int(dur * SR)
    x = (np.sin(2 * np.pi * f * t(n))
         + 0.45 * np.sin(2 * np.pi * f * 2.01 * t(n))
         + 0.18 * np.sin(2 * np.pi * f * 3.02 * t(n)))
    return x * env(n, 0.006, curve=3.2) * gain


# ---------- the sounds ----------

def s_open():                                    # the shot opens
    a = bell(880, 1.3, 0.16)
    b = np.pad(bell(1318, 1.1, 0.11), (int(0.09 * SR), 0))
    n = max(len(a), len(b))
    return np.pad(a, (0, n - len(a))) + np.pad(b, (0, n - len(b)))


def s_boop():                                    # click him
    x = sweep(560, 440, 0.13)
    return x * env(len(x), 0.003, curve=6) * 0.30


def s_sparkle(gain=0.13):                        # hearts
    out = np.zeros(int(0.32 * SR))
    for i, f in enumerate((1500, 1950, 2450)):
        x = np.sin(2 * np.pi * f * t(int(0.07 * SR)))
        x *= env(len(x), 0.002, curve=7) * gain
        o = int(i * 0.065 * SR)
        out[o:o + len(x)] += x
    return out


def s_lift_leaf():                               # leaf out of the tray
    x = noise(0.26, lo=900, hi=6000)
    return x * env(len(x), 0.10, curve=2.6) * 0.13


def s_drop_leaf():                               # leaf lands on him
    x = sweep(300, 170, 0.12) * 0.6 + noise(0.12, hi=2200) * 0.35
    return x * env(len(x), 0.002, curve=7) * 0.28


def s_munch():                                   # he eats it
    out = np.zeros(int(0.5 * SR))
    for i, o in enumerate((0.0, 0.23)):
        x = noise(0.11, lo=200, hi=2600)
        x *= env(len(x), 0.003, curve=9) * (0.20 if i == 0 else 0.15)
        k = int(o * SR)
        out[k:k + len(x)] += x
    return out


def s_pickup():                                  # pick him up
    x = sweep(300, 540, 0.15)
    return x * env(len(x), 0.005, curve=5) * 0.22


def s_setdown():                                 # put him down
    x = sweep(520, 280, 0.16) * 0.7 + noise(0.16, hi=1400) * 0.3
    return x * env(len(x), 0.003, curve=5.5) * 0.26


def s_pop():                                     # a speech bubble
    x = sweep(760, 420, 0.08)
    return x * env(len(x), 0.002, curve=8) * 0.26


def s_poof():                                    # double-click, he vanishes
    a = sweep(620, 120, 0.55) * 0.5
    b = noise(0.55, hi=5200) * 0.5
    x = (a + b) * env(len(a), 0.004, curve=3.4)
    return x * 0.30


def s_return():                                  # click, he is back
    x = sweep(180, 720, 0.30) * env(int(0.30 * SR), 0.02, curve=2.2) * 0.24
    sp = s_sparkle(0.10)
    out = np.zeros(max(len(x), int(0.18 * SR) + len(sp)))
    out[:len(x)] += x
    out[int(0.18 * SR):int(0.18 * SR) + len(sp)] += sp
    return out


def pad(dur):
    """A very quiet warm bed so the gaps are not dead air."""
    n = int(dur * SR)
    ts = t(n)
    x = sum(np.sin(2 * np.pi * f * ts + p) for f, p in
            ((110.0, 0.0), (164.8, 1.1), (220.5, 2.3), (329.2, 0.7)))
    lfo = 0.82 + 0.18 * np.sin(2 * np.pi * 0.07 * ts)
    b, a = butter(2, 900 / (SR / 2), btype="low")
    x = lfilter(b, a, x * lfo)
    fade = int(2.2 * SR)
    x[:fade] *= np.linspace(0, 1, fade)
    x[-fade:] *= np.linspace(1, 0, fade)
    return x * 0.012


# ---------- place the cues ----------
# (original timeline seconds, sound). Divided by SPEED when written.
CUES = [
    (0.40, s_open()),
    (3.40, s_boop()),          # pet him (stays silent, his hello is still up)
    (3.75, s_sparkle()),       # hearts, 320ms later: celebrate waits out the
                               # double-click window before it fires
    (8.90, s_lift_leaf()),     # leaf out of the tray
    (10.30, s_drop_leaf()),    # dropped on him
    (10.85, s_munch()),        # eats it
    (14.10, s_pickup()),       # picked up
    (16.28, s_setdown()),      # put down
    (16.80, s_boop()),         # pet him again, this time he answers
    (17.15, s_sparkle()),      # hearts, then he walks off on his own
    # 18.0 to 25.4 he walks and settles. Deliberately silent, it is the calm
    # beat of the film and footsteps would fight it.
    # These two move with the walk, which is not a fixed length. record.mjs
    # prints `BEATS vanish=.. return=..` at the end of a take: copy them here.
    (28.52, s_poof()),         # double-click, gone. No reaction on the way out.
    (32.45, s_return()),       # back
]


def main():
    ff = subprocess.run(["python3", "-c",
                         "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"],
                        capture_output=True, text=True).stdout.strip()
    info = subprocess.run([ff, "-i", str(SRC)], capture_output=True, text=True).stderr
    hh, mm, ss = info.split("Duration: ")[1].split(",")[0].split(":")
    src_dur = int(hh) * 3600 + int(mm) * 60 + float(ss)
    out_dur = src_dur / SPEED

    # Effects only. The warm bed was cut on 12 Sep 2026: it read as background
    # music rather than as the app making noise. pad() is left in above in case
    # a future cut wants it back.
    master = np.zeros(int((out_dur + 0.4) * SR))
    for at, snd in CUES:
        k = int((at / SPEED) * SR)
        end = min(len(master), k + len(snd))
        if k < len(master):
            master[k:end] += snd[:end - k]

    peak = np.max(np.abs(master))
    master = master / peak * 0.89 if peak > 0 else master
    stereo = np.stack([master, master], axis=1)
    from scipy.io import wavfile
    wavfile.write(WAV, SR, (stereo * 32767).astype(np.int16))

    subprocess.run([
        ff, "-y", "-loglevel", "error",
        "-i", str(SRC), "-i", str(WAV),
        "-filter_complex", f"[0:v]setpts=PTS/{SPEED}[v]",
        "-map", "[v]", "-map", "1:a",
        "-r", "30", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-shortest", str(DST),
    ], check=True)
    print(f"{src_dur:.2f}s -> {out_dur:.2f}s at {SPEED}x, {len(CUES)} cues -> {DST}")


if __name__ == "__main__":
    main()
