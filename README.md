# Trip Planner

Phone-first PWA for planning multi-day hikes (Western Arthurs A–K / Full Traverse, Mt Anne Circuit).

- Each route is a fixed sequence of stops. A day ends wherever you set it; every later day and date reflows.
- **◀ Shorter / Longer ▶** or the "ends at" picker move a day's end. Inside a day, **End day here** splits it.
- Add rest/weather days at any camp, transfer days between routes, your own stops, and notes.
- Tap any leg to correct distance / ascent / descent / time (route figures are research estimates).
- Pace multiplier (⋯ menu) scales all times.
- **Maps** on the Super Topo basemap (malloMap's mapserve worker): a Map tab for the whole trip, 🗺 Map per route, and a map in each expanded day (tap for full screen, with GPS dot). Days are colour-coded; side trips show dashed.
- **Offline map:** Map tab (or ⋯ menu) → *Download offline map* saves ~870 tiles (~12 MB) around the routes into Cache Storage; the service worker serves them cache-first.
- **Guidebook:** expanded days show track notes for every leg, extra stop notes and side-trip options (tap to read, *+ Add to this day*). Researched from PWS walk notes and trip reports — `src/data/guide.json` (sources listed there).
- Saved on-device (localStorage), works offline once installed.
- **No-login sync:** ⋯ → *Share / copy plan link* packs the whole plan into a URL; open it on another device and choose *Replace my plan*. JSON export/import for backups.

## Develop

```bash
npm install
npm run dev
```

Route data lives in `src/data/routes.ts`; track notes and side trips in `src/data/guide.json`.

Track lines come from OpenStreetMap. To rebuild `src/data/geo.json` (stop positions + leg lines):

```bash
curl -s --data-urlencode data@scripts/overpass.txt https://overpass-api.de/api/interpreter -o /tmp/osm.json
node scripts/build-geo.mjs /tmp/osm.json
```

## Deploy (GitHub Pages)

Push to `main` on GitHub, then in the repo: Settings → Pages → Source: **GitHub Actions**. The workflow in `.github/workflows/pages.yml` builds with the right base path and publishes. On your phone, open the Pages URL in Safari → Share → **Add to Home Screen**.
