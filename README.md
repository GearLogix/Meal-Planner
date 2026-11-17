# Meal Planner (GearLogix)

A self-hosted high-protein recipe book and macro meal planner. It runs as a single Docker container on Unraid and installs on your phone like an app (PWA).

## Features
- **Recipe library:** 66 recipes imported from Cade's The Protein Plate, plus your own. Search titles and ingredients, filter by meal, protein, method, cook time, type, favorites and cooked history. Sort by protein, protein per calorie, calories or time.
- **Recipe page:** servings switch (1/2/4/6/8) scales ingredient amounts and the nutrition table (whole recipe and per serving). Also shows % of calories from protein, sides and tips.
- **Cook mode:** one step at a time with temperatures highlighted. Durations are tap-to-start timers, with an alarm, vibration and a spoken alert. Includes an ingredient checklist, read-aloud, keeps the screen awake, and lets you resume where you left off.
- **Macro goals:** daily calorie, protein, carb and fat targets. The built-in calculator uses Mifflin-St Jeor and your activity level, then adjusts for a cut, recomp, maintain or gain goal.
- **Weekly planner:** breakfast, lunch, dinner and snack slots, servings per item, quick-add foods with custom macros, daily progress bars against goals, week averages, and copy a day forward. "Fill the gap" generates a meal sized to that day's remaining macros.
- **Grocery list:** combined from planned meals plus recipes and items you add. Quantities are merged where units match and items are grouped by aisle. Pantry staples are skipped. Checks sync across devices. One-tap search links for **Publix, Aldi, Target, Walmart, Instacart** (Publix and Aldi through their Instacart storefronts). Copy or share the list as text.
- **AI recipes:** generate a recipe from a request plus optional per-serving macro targets, review the draft, then save. Uses your Claude API key, stored encrypted.
- **Profiles:** each person has their own goals, plan, favorites, cooked history and grocery list. Optional PIN per profile; recipes are shared.
- **Admin lock:** adding or editing recipes, AI generation, profiles, API key and re-import require the admin passcode (unlock once per device).
- Light, dark and auto themes. Works offline for recipes you've opened.

## Stack
- **Web:** React 18 + Vite, Workbox service worker
- **API:** Node 22 + Express, SQLite via built-in `node:sqlite` (no native modules)
- **Container:** one image, one port (8080), one volume (`/data`)

## Install on Unraid

### Option A: GitHub image (recommended, auto-updates)
1. This repo's GitHub Action builds `ghcr.io/gearlogix/meal-planner:latest` (amd64 + arm64) on every push to `main`.
2. In GitHub, go to Packages > meal-planner > Package settings and set visibility to **Public**, or add a GHCR login on Unraid.
3. Copy `unraid/meal-planner.xml` to `/boot/config/plugins/dockerMan/templates-user/` on the flash drive.
4. Docker tab > Add Container > Template: **meal-planner**. Set:
   - **Admin Passcode:** what you'll type to unlock admin features
   - **Secret Key:** a long random string (`openssl rand -base64 32`). Keep a copy; it encrypts the Claude API key.
5. Apply, then open `http://<unraid-ip>:8085` and create your profile.

### Option B: Build on Unraid
```
cd /mnt/user/appdata && git clone https://github.com/GearLogix/Meal-Planner.git meal-planner-src
cd meal-planner-src && docker build -t gearlogix/meal-planner:latest .
docker run -d --name meal-planner --restart unless-stopped -p 8085:8080 \
  -v /mnt/user/appdata/meal-planner:/data \
  -e ADMIN_PASSCODE='choose-one' -e MP_SECRET_KEY="$(openssl rand -base64 32)" -e TZ=America/New_York \
  gearlogix/meal-planner:latest
```
(Save the generated `MP_SECRET_KEY` if you want to keep the API key across container rebuilds.)

### First run
- With an empty database, the container imports The Protein Plate recipes (65 from the app bundle plus user recipes from its API). Check the logs for `[import] … imported`.
- The first profile can be created without a passcode. After that, adding profiles needs admin.
- Settings > Admin: unlock, paste your Claude API key (console.anthropic.com), and save.

### Phone install
PWA install needs HTTPS. Put the app behind a Cloudflare Tunnel, `tailscale serve`, or your reverse proxy, then use Add to Home Screen. Plain `http://` on the LAN works in a browser without the install prompt.

## Security
- **Claude API key:** AES-256-GCM encrypted at rest. The key comes from `MP_SECRET_KEY`, or from a generated 0600 key file in `/data` if that's unset. It's decrypted only for the outbound API call and never returned to the browser (Settings shows the last 4 characters).
- **PINs:** scrypt-hashed. Five wrong attempts lock that profile for a minute.
- **Sessions:** random tokens, stored as SHA-256 hashes.
- **Admin passcode:** compared server-side with a timing-safe check.
- **Import:** remote recipe data is decoded without evaluating any remote code.

## Environment
| Variable | Default | Purpose |
|---|---|---|
| `PUID` / `PGID` | 99 / 100 | Owner of files in `/data` (Unraid nobody:users) |
| `PORT` | 8080 | HTTP port inside the container |
| `DATA_DIR` | /data | SQLite database and key file |
| `ADMIN_PASSCODE` | (empty = no lock) | Locks admin features |
| `MP_SECRET_KEY` | (generated file) | Master key for encrypting secrets |
| `IMPORT_ON_FIRST_RUN` | true | Import Protein Plate recipes when DB is empty |
| `PROTEIN_PLATE_URL` / `PROTEIN_PLATE_API_URL` | Cade's URLs | Import sources |
| `ANTHROPIC_BASE_URL` | https://api.anthropic.com | Override for testing |

Re-import any time from Settings or with `docker exec -u 99:100 meal-planner npm run import`. Re-import overwrites Cade's recipes in place (including any edits you made to them); your own `MP-` recipes are untouched.

## Backups
Everything lives in `/mnt/user/appdata/meal-planner/` (`meal-planner.db` plus the WAL files). Include it in your appdata backup.

## Development
```
cd server && npm install && DATA_DIR=./.data npm start      # API on :8080
cd web && npm install && npm run dev                         # UI on :5173, proxies /api
node test/make-fixture.mjs test/fixture                      # fake Protein Plate site for offline tests
node test/api-test.mjs                                       # API checks (fresh DB, ADMIN_PASSCODE=letmein, mock Claude on :9998)
python3 test/e2e.py                                          # Playwright walkthrough
```
