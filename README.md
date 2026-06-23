# 3D Bayer Dither Lens Demo

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

## Important fixes in this build

- Imported models are centered correctly before scaling. The previous transform could place off-origin OBJ files outside the camera view.
- Materials from uploaded files are ignored and replaced with a neutral internal material, so missing `.mtl` files or black source materials will not make the dither disappear.
- Vertex normals are recomputed for imported meshes to avoid flat black shading from missing or inconsistent normals.
- OBJ, STL, USD, USDA, USDC, and USDZ are accepted. USD/USDZ support is best-effort because complex USDZ exports may contain unsupported features.

## Performance notes

- No React or UI framework.
- No heavy postprocessing library.
- Single render target + one fullscreen shader pass.
- Device pixel ratio is capped by a UI slider to avoid over-rendering on retina screens.
- Model parsing happens only on upload; per-frame work is limited to model rotation/hover, one scene render, and one shader pass.
