# Kachuful Judgement Multiplayer

Real-time multiplayer Kachuful (Judgement) card game built with React, Vite, Express, and WebSockets.

## Run Locally

Requirements: Node.js `>=22`.

```bash
npm install
cp .env.example .env
npm run dev
```

For a local production build:

```bash
npm run build:web
NODE_ENV=production PORT=3000 npm start
```

Open `http://localhost:3000` in your browser.

## Run with Docker

```bash
docker build -t kachuful .
docker run --rm -p 8080:8080 -e PORT=8080 kachuful
```

The container listens on port `8080`, serves the built frontend and WebSocket server, and exposes `/healthz` for container health checks.

If hosting the frontend separately, pass `ALLOWED_ORIGINS`:

```bash
docker run --rm -p 8080:8080 -e ALLOWED_ORIGINS="https://your-app.vercel.app" kachuful
```

## Deploy Server to Render

1. Connect this repository to Render as a Blueprint (`render.yaml`) or a Node Web Service.
2. Render uses:
   - **Build Command**: `npm ci && npm run build:web`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/healthz`
   - **Instances**: `1` (rooms are stored in server memory)
3. Set `NODE_ENV=production`.
4. If your frontend is hosted on Vercel (or another domain), set `ALLOWED_ORIGINS` to that exact origin (comma-separated for multiple origins, e.g. `https://kachuful.vercel.app`). Leave `ALLOWED_ORIGINS` blank if you serve the website directly from Render.

## Deploy Website to Vercel

1. Import this repository into Vercel (`vercel.json` configures `npm run build:web`, `dist` output, SPA rewrites, and CSP headers).
2. Add the environment variable:
   - `VITE_WS_URL`: your WebSocket server URL, e.g. `wss://your-render-service.onrender.com`
3. Deploy. Make sure the backend's `ALLOWED_ORIGINS` includes your Vercel domain (`https://your-app.vercel.app`).
4. Optional: tighten `connect-src` in `vercel.json` from `'self' wss: ws:` to `'self' wss://your-render-service.onrender.com`.
