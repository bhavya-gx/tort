# Tort

A turtle that lives on your desktop. See SPEC.md for what it does and why.

## Run it

```
npm install
npm start
```

Quit from the turtle icon in the menu bar. There is no Dock icon.

## Files

- `src/main.js` window, click-through, menu bar, global hotkey
- `src/renderer/config.js` name, timings, every line it says
- `src/renderer/sprite.js` the character, one SVG string, swap freely
- `src/renderer/pet.js` movement, moods, sleep, reactions
- `src/renderer/style.css` animation states
- `tools/make-tray-icon.js` regenerates the menu bar icon (`npm run icon`)

## Notes

- Unsigned, so a build handed to anyone else needs right-click then Open the
  first time. Running it from source as above does not.
- No network calls. Nothing is stored.

## Web demo

A browser port (no Electron, bounded to a card instead of your whole screen) lives in
https://github.com/bhavya-gx/tort-web and runs at https://tort-webvercelapp.vercel.app.
A browser tab cannot float over your desktop, so the web version is a demo, this app is the product.

## Demo video pipeline

`tools/mockup/` records the product video from the real web build (see its README). Renders land in `tools/mockup/out/`, which is not committed.

MIT licensed.
