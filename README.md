# OBJ/STL Bayer Dither Lens Demo

A lightweight Vite + Three.js demo that loads a user-provided `.obj` or `.stl` file, renders it into a realtime Bayer ordered-dither post shader, and uses a circular hover lens to reveal the clean underlying 3D model.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Deploy on Vercel

Push this folder to GitHub, then import the repository in Vercel. The included `vercel.json` uses:

- Build command: `npm run build`
- Output directory: `dist`
- Framework: `vite`

## Performance notes

- No React or UI framework.
- No heavy postprocessing library.
- Single render target + one fullscreen shader pass.
- Device pixel ratio is capped by a UI slider to avoid over-rendering on retina screens.
- OBJ/STL parsing happens only on upload; per-frame work is limited to model rotation/hover, one scene render, and one shader pass.


## Upload troubleshooting

Uploaded models are normalized to the camera and all mesh normals are recomputed on load. This avoids a common issue where exported OBJ/STL files render as a black silhouette because their normals are missing, inverted, or incompatible with the lighting setup.

Supported user uploads:

- `.obj` via `OBJLoader`
- `.stl` via `STLLoader` — binary or ASCII STL
