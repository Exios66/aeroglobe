# Blank landing page – troubleshooting

If AeroGlobe’s landing page is blank, try the following.

## 1. Run the app correctly (don’t open the HTML file)

- **Local:** Run a dev server, then open the URL it prints (e.g. `http://localhost:5173`).
  ```bash
  npm run dev:all
  ```
  Then open **http://localhost:5173** in the browser (not `file:///...`).

- **Preview built app:** After `npm run build`, run:
  ```bash
  npm run preview
  ```
  and open the URL shown (e.g. `http://localhost:4173`).

Opening `index.html` or `dist/index.html` directly as a file (`file://`) will not work: Cesium and the app need to be served over HTTP.

## 2. Check the browser console

Open DevTools (F12 or right‑click → Inspect → **Console**). Look for:

- **404** on `/cesium/...` or `/assets/...`  
  → You’re likely on a site with a base path (e.g. GitHub Pages at `.../aeroglobe/`).  
  → The repo’s `index.html` was updated to use **relative** paths (`cesium/...`, `assets/...`) so that subpath works. Redeploy so the updated `index.html` is what’s served. If you build yourself, set Vite’s `base` to your repo path (e.g. `base: '/aeroglobe/'`) and `CESIUM_BASE_URL` to match (e.g. `'/aeroglobe/cesium'`), then rebuild and deploy.

- **Cesium / WebGL errors**  
  → Try a different browser or device; ensure WebGL is supported and not disabled.

- **“Globe failed to load”** in the UI  
  → The globe component is showing its error state. The message may mention Cesium Ion or terrain; an optional Cesium Ion token in `.env.local` can help, but the app should still show a globe without it if terrain is made optional in code.

## 3. GitHub Pages / deployed subpath

If the app is served from a subpath (e.g. `https://<user>.github.io/aeroglobe/`):

1. In **vite.config.ts** set:
   - `base: '/aeroglobe/'` (or your repo path with leading and trailing slash)
   - In `define`, set `CESIUM_BASE_URL: JSON.stringify('/aeroglobe/cesium')`
2. Run `npm run build`, then deploy the contents of `dist/` (or use `npm run deploy` if configured).

The `index.html` in this repo uses **relative** asset paths so that one build can work when the site is served from that subpath.

## 4. Verify build

From the project root:

```bash
npm ci
npm run build
npm run preview
```

Open the URL from `npm run preview`. If the page is still blank, check the Console and Network tabs in DevTools and use the errors (e.g. 404, Cesium, WebGL) to narrow it down.
