# Meal Planner (GearLogix)

High-protein recipe book with macro goals, weekly meal planning, cook mode and grocery lists. Self-hosted on Unraid as a single Docker container. Installable as a phone app (PWA).

## Stack
- **Web:** React 18 + Vite, PWA with offline recipe cache (Workbox)
- **API:** Node 22 + Express, SQLite (built-in `node:sqlite`, no native modules)
- **Container:** one image, one port (8080), one volume (`/data`)

## First run
When the database is empty, the container imports Cade's 66 recipes from The Protein Plate (65 seeded in the app bundle plus user recipes from its API). Re-run any time:

```
docker exec meal-planner npm run import
```
or `POST /api/import/protein-plate` with the `x-passcode` header.

## Install on Unraid

### Option A: GitHub image (recommended, auto-updates)
1. Push this folder to a GitHub repo named `meal-planner` under your GearLogix account.
2. The included GitHub Action builds `ghcr.io/<owner>/meal-planner:latest` on every push to `main`.
3. In GitHub, go to Packages > meal-planner > Package settings and set visibility to Public (or add a registry login on Unraid).
4. Copy `unraid/meal-planner.xml` to `/boot/config/plugins/dockerMan/templates-user/` on the Unraid flash drive. Edit the `gearlogix` owner name if your GitHub account differs.
5. Docker tab > Add Container > Template: **meal-planner**. Set the Admin Passcode, then Apply.
6. Open `http://<unraid-ip>:8085`.

### Option B: Build directly on Unraid
```
cd /mnt/user/appdata
# copy this folder here as meal-planner-src, then:
cd meal-planner-src
docker build -t gearlogix/meal-planner:latest .
docker run -d --name meal-planner --restart unless-stopped \
  -p 8085:8080 -v /mnt/user/appdata/meal-planner:/data \
  -e ADMIN_PASSCODE='choose-one' -e TZ=America/New_York \
  gearlogix/meal-planner:latest
```

### Installing on your phone
PWA install requires HTTPS. Put the app behind a Cloudflare Tunnel, Tailscale (`tailscale serve`), or your reverse proxy, then use "Add to Home Screen". Plain `http://` on the LAN works fine in a browser, just without the install prompt.

## Secrets
- `ADMIN_PASSCODE` is passed as a masked container variable and compared server-side with a timing-safe check. It is never sent to the browser.
- Phase 5 (AI generation) will store the Claude API key encrypted at rest (AES-256-GCM, key derived from a container secret), never in plain text.

## Environment
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 8080 | HTTP port inside the container |
| `DATA_DIR` | /data | SQLite location |
| `ADMIN_PASSCODE` | (empty) | Locks write routes |
| `IMPORT_ON_FIRST_RUN` | true | Import Protein Plate recipes when DB is empty |
| `PROTEIN_PLATE_URL` | Cade's app URL | Import source (app) |
| `PROTEIN_PLATE_API_URL` | Cade's API URL | Import source (API) |

## API (Phase 1)
- `GET /api/health`
- `GET /api/recipes` (list, light) · `GET /api/recipes/:id`
- `POST /api/recipes` · `PUT /api/recipes/:id` · `DELETE /api/recipes/:id` (passcode)
- `POST /api/import/protein-plate` (passcode)

## Roadmap
1. ~~Core app: import, browse, filters, search, servings scaling, nutrition~~
2. Cook mode: step view, checklist, timers, voice, wake lock, resume
3. Macro goals + weekly planner (breakfast, lunch, dinner, snacks)
4. Grocery list + store links (Publix, Aldi, Target, Walmart, Instacart)
5. AI recipe generation to hit macro targets (encrypted API key)
6. Server-side sync of favorites, history and plans

## Local dev
```
cd server && npm install && DATA_DIR=./.data npm start
cd web && npm install && npm run dev   # proxies /api to :8080
```
