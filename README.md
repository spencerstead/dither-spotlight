# OBJ/STL/USDZ Bayer Dither Lens Demo

A lightweight Vite + Three.js demo that loads a user-provided `.obj`, `.stl`, `.usd`, `.usda`, `.usdc`, or `.usdz` file, renders it into a realtime Bayer ordered-dither post shader, and uses a circular hover lens to reveal the clean underlying 3D model.

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
- OBJ/STL/USD loaders are dynamically imported only when needed.
- Model parsing happens only on upload/drop; per-frame work is limited to model rotation/hover, one scene render, and one shader pass.
- PNG export uses a temporary render target instead of `preserveDrawingBuffer`.

## Upload troubleshooting

Uploaded models are normalized to the camera and all mesh normals are recomputed on load. Imported materials are intentionally replaced with a known bright internal material, which keeps OBJ/STL/USD files from disappearing because of missing `.mtl` files, black source materials, bad normals, or off-origin export coordinates.

The current fit-to-view code scales the root object first, then applies the scaled center offset. This is important for files exported far from the origin, like Cinema 4D OBJ exports.

Supported user uploads:

- `.obj` via `OBJLoader`
- `.stl` via `STLLoader` — binary or ASCII STL
- `.usd`, `.usda`, `.usdc`, `.usdz` via `USDLoader`
