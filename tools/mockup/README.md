# Tort product demo video

`node tools/mockup/record.mjs` -> `out/tort-demo.mp4` (1080x1920) and `out/tort-demo-4x5.mp4` (1080x1350).
Needs Chrome at /Applications and `pip install imageio-ffmpeg`. No npm dependencies.

Silent, no captions, MacBook as the subject on a clean ground. ~30s.

## What it actually records

`stage.html` is a 1080x1920 canvas holding a CSS MacBook. The laptop's screen **is**
`#stage`, the same element the real web build uses, with the same child ids, and it
loads `/style.css` and `/pet-web.js` straight from `desktop-pet-web/`. So the turtle in
the video is the shipping app, not an animation of it: every beat is a real mouse event
landing on the real code. A simulated macOS desktop (menu bar, two windows) sits behind
him inside the same element, which is how the video shows the one thing that matters,
that he floats on top of your windows.

The recorder serves `stage.html` and `desktop-pet-web/` from one origin on :4655, drives
headless Chrome over CDP, and assembles the screencast with ffmpeg.

## Beats

Edited in the `until(ms)` timeline at the bottom of `record.mjs`.

| t | beat |
|---|---|
| 0.0 | he is just there, says hello on his own |
| 3.2 | click him: hearts, a line back, then he wanders off |
| 7.6 | drag the leaf out of the tray and drop it on him |
| 13.0 | pick him up and move him, he rides over the windows |
| 16.8 | he says something unprompted |
| 21.0 | double-click, he vanishes, leaf and all |
| 25.2 | click anywhere, he comes back |

## Things that will bite you if you edit this

- **Takes are seeded.** `stage.html` replaces `Math.random` with a seeded PRNG before
  `pet-web.js` loads, so lines, blink gaps and crawl targets are identical every run.
  Change the seed and every beat's dialogue changes.
- **Never scale `#stage`.** `pet-web.js` adds raw page-pixel deltas to an untransformed
  CSS `state.x` while dragging, so any CSS scale makes him outrun the cursor. The push in
  is done in ffmpeg for exactly this reason.
- **`--force-device-scale-factor` must match `deviceScaleFactor`**, or the screencast
  comes back at 1x whatever `maxWidth` says, and the push in upscales.
- **Motion is deadline driven.** A fixed sleep per step adds a CDP round trip on top of
  every step; the first cut of this drifted 4s and cut off the ending.
- **Two-pass encode.** The concat demuxer's variable durations and an `fps` filter
  disagree about the timeline length (968 frames vs 904 on the same input), so pass one
  writes a constant-30fps master and the crops read from that. `zoompan`'s own `fps`
  defaults to 25 and will stretch the result by 1.2x if left alone.
- **`crop` cannot resize per frame** (the filter graph fails on reinit). Use `zoompan`.
- **The screencast emits nothing while the screen is static**, so the last frame is held
  2.2s explicitly. Without it the take ends the instant he reappears.
- **The tightest crop is page x 232..848.** Move him outside that and the push in will
  have cropped him out of frame by the end.
