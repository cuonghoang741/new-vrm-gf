# Model renders for character and outfit art

Renders a VRM in one of the app's own FBX poses, on a transparent background,
for picker cards and outfit thumbnails. `render.html` carries a copy of the
Mixamo → VRM retargeting from `assets/index.html`. Re-copy it if that changes.

```bash
npm i puppeteer-core@23      # once, in a scratch folder
# list.json: [{"key": "...", "url": "<vrm>", "poses": [0, 4]}]
node render.mjs list.json poses.json out/
```

Each output is `out/<key>__<pose>.png`, 900×1400. The PNGs are then placed over
a scene with `compose()` from `tools/live2d/card_art.py`.

Hair and skirts are settled with 120 physics steps while the pose is held.
VRM0 models are turned by `rotateVRM0`, and the retargeting handles their flipped axes.

See migrations 20260930120000 / 190000 (characters) and 200000 (outfits).
