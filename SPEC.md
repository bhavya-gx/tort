# Tort, desktop pet

A small turtle that lives on top of everything on the screen, sits in one spot
until you click him, then plods somewhere new along the bottom of the display.
Mac only. No account, no network, no data leaves the machine.

Rename in one place: `NAME` in `src/renderer/config.js`.
Name locked: Tort.

## Personality

Slow is the whole joke and the whole point. The pet moves at 34 px per second,
which crosses a 15 inch screen in about 40 seconds. It never nags, never counts
anything, never asks you to be productive. It is the opposite of a timer.

Voice: lowercase, four to six words, no punctuation drama, no encouragement
speak. "slow is fine." not "You've got this, superstar!"

## Behaviors, as built

| Trigger | What happens |
|---|---|
| Default | Sits in one spot. No autonomous wandering |
| Every 5 to 8 min | Speech bubble with one ambient line, fades after 4 s |
| Click it | Squash and bounce, hearts float up, short reaction line, then plods to a new spot along the bottom |
| Ctrl+Alt+P, or menu bar "Come here" | Walks to your cursor, then speaks |
| 12 min with no mouse movement | Tucks into shell, sleeps, says zzz |
| Mouse moves again | Wakes, one wake line |
| Menu bar | Come here, Say something, Snooze 30 or 60, Show Tort, Quit |
| Click and drag | Reposition him anywhere along the bottom |
| Double-click | Vanishes for a screenshot. Ctrl+Alt+P, or any tray item, brings him back |
| Drag the leaf (bottom-right corner) onto him | Feeds him, any time, not gated by a study session and not part of the daily checklist |

Click-through everywhere except the sprite itself, so it never blocks a click on
whatever is underneath. Floats above fullscreen apps. No Dock icon.

## Art brief, for the Fable pass

Reference photo saved at `assets/reference/turtle.png` (806x626, ~1.29:1 aspect).
Match it: chibi turtle, three quarter view, **facing left** like the photo (the app mirrors it to walk right).

The on-screen box is 112x88px, same ~1.29:1 proportion as the reference, so the
art should fill it edge to edge with no letterboxing. Deliver as
`viewBox="0 0 128 100"` (same proportion, just more precision to draw in) with
the turtle standing on the bottom edge, filling the width.

- Head: large and round relative to body, green (#8FCB6B), lighter belly green
  (#A3DA80) as soft under-shading
- Eyes: two large dark ovals (#2A2118), each with a small white highlight top left,
  wide set, sitting low on the face
- Mouth: tiny upward curve. Blush: soft peach ovals (#F2A08A) under each eye
- Shell: brown dome (#8B5E3C) with darker scute divisions (#5E3D26) and a warmer
  right side, sitting on a cream rim band (#E8D5A9) with vertical tan segments
- Legs: four stubby rounded legs, green, each with two or three dark brown toe
  pads (#4A3B2A)
- Line work: thin darker outlines, soft cel shading, no harsh black keyline
- Transparent background, character standing on the bottom edge of the viewBox

Six states, all as one SVG with class hooks so CSS drives them:

1. `idle` gentle bob
2. `walk` leg cycle, front and back legs alternating
3. `blink` eyes squash on the y axis
4. `happy` squash and stretch bounce
5. `sleep` head and legs tuck toward the shell
6. `talk` small nod toward the bubble while it is up

Required classes: `pet-eye` on both eyes, `pet-head` on the head group,
`pet-leg front` and `pet-leg back` on the legs. Deliver as a single inline SVG
string exported from `src/renderer/sprite.js`. Nothing else in the app changes.

Keep it editable: layered SVG groups, no flattened raster.

## v2, approved 10 Sep 2026

Care loop, three tasks a day, driven by the study tracker (port 4612,
read-only `GET /api/data`) plus your own clicks:

| Trigger | Reward |
|---|---|
| A logged study session of 30 min | He drinks water (`water` sprite, `.drinking`) |
| A session of 60 min or more | He is fed (`leaf` sprite, `.eating`) |
| A session over 2 hours | He gets cleaned (`bubble` sprites, `.cleaning`, then `.shiny`) |
| You click him | Petted |
| All done for the day | `.cared` sparkles, end-of-day line, then he sleeps |

Assumed per session, not daily total; one config flag flips it. Resets at
midnight. Survives a quit or crash: care progress, mood timestamp and today's
shown affirmations persist to disk (userData/tort-state.json, atomic writes,
falls back to a fresh day on a missing or corrupt file). Mood drifts: cared for = `.mood-bright`, ignored = `.mood-sleepy`
(lids droop). Affirmations at 09:00, 13:00 and 18:00, one bank per slot (starting, enduring, stopping). Web version
on a public link. X launch post. No nagging anywhere.

## Not built yet, on purpose

- Talking pet with a Claude API call in the bubble
- Web version and App Launcher tile
