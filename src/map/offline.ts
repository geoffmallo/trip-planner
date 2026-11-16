// Offline map: saves the Super Topo tiles around the routes into Cache Storage.
// The service worker serves mapserve tiles cache-first from the same cache, so a
// downloaded map works with no signal.
import { GEO, type LngLat } from './geo'
import { FONTS, GLYPHS, GLYPH_RANGES, STYLE_URL, TILE_SOURCES } from './style'

export const TILE_CACHE = 'map-tiles'

const tx = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z)
const ty = (lat: number, z: number) =>
  Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z)

/** Every tile key (z/x/y) to save: whole area up to z12, a corridor along the tracks above that. */
function tileKeys(): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>()
  const [w, s, e, n] = GEO.bounds
  const pad = 0.04
  const lines: LngLat[][] = [...Object.values(GEO.legs).map((l) => l.line), ...GEO.side.map((x) => [x.ll])]
  for (let z = 8; z <= 15; z++) {
    const set = new Set<string>()
    if (z <= 12) {
      for (let x = tx(w - pad, z); x <= tx(e + pad, z); x++)
        for (let y = ty(n + pad, z); y <= ty(s - pad, z); y++) set.add(`${z}/${x}/${y}`)
    } else {
      const m = z === 13 ? 2000 : z === 14 ? 1200 : 800 // corridor half-width, metres
      const dLat = m / 110540
      const dLon = m / (111320 * Math.cos((43 * Math.PI) / 180))
      for (const line of lines)
        for (let i = 0; i < line.length; i++) {
          const a = line[i], b = line[i + 1] ?? a
          for (let t = 0; t <= 1; t += 0.25) {
            const lon = a[0] + (b[0] - a[0]) * t, lat = a[1] + (b[1] - a[1]) * t
            for (let x = tx(lon - dLon, z); x <= tx(lon + dLon, z); x++)
              for (let y = ty(lat + dLat, z); y <= ty(lat - dLat, z); y++) set.add(`${z}/${x}/${y}`)
          }
        }
    }
    out.set(z, set)
  }
  return out
}

export function offlineUrls(): string[] {
  const keys = tileKeys()
  const urls: string[] = [STYLE_URL]
  for (const src of TILE_SOURCES)
    for (let z = src.min; z <= src.max; z++)
      for (const k of keys.get(z) ?? []) {
        const [zz, x, y] = k.split('/')
        urls.push(src.url.replace('{z}', zz).replace('{x}', x).replace('{y}', y))
      }
  for (const f of FONTS)
    for (const r of GLYPH_RANGES) urls.push(GLYPHS.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r))
  return urls
}

export interface OfflineStatus {
  saved: number
  total: number
  bytes: number
}

export async function offlineStatus(): Promise<OfflineStatus> {
  const urls = offlineUrls()
  if (!('caches' in window)) return { saved: 0, total: urls.length, bytes: 0 }
  const cache = await caches.open(TILE_CACHE)
  const have = new Set((await cache.keys()).map((r) => r.url))
  const saved = urls.filter((u) => have.has(u)).length
  let bytes = 0
  try {
    const est = await navigator.storage?.estimate?.()
    bytes = est?.usage ?? 0
  } catch {
    /* not supported */
  }
  return { saved, total: urls.length, bytes }
}

/** Download everything not yet cached. Resolves with the number that failed. */
export async function downloadOffline(onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<number> {
  const urls = offlineUrls()
  const cache = await caches.open(TILE_CACHE)
  const have = new Set((await cache.keys()).map((r) => r.url))
  // Ask the browser not to evict this storage (installed PWAs usually get it anyway).
  navigator.storage?.persist?.().catch(() => {})
  let done = urls.filter((u) => have.has(u)).length
  let failed = 0
  const todo = urls.filter((u) => !have.has(u))
  onProgress(done, urls.length)
  const worker = async () => {
    for (;;) {
      const u = todo.shift()
      if (!u || signal?.aborted) return
      try {
        const res = await fetch(u, { cache: 'no-store', signal })
        if (res.ok) await cache.put(u, res)
        else failed++
      } catch {
        failed++
      }
      done++
      onProgress(done, urls.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return failed
}

export async function clearOffline() {
  await caches.delete(TILE_CACHE)
}
