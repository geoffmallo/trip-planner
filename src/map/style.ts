// Super Topo (malloMap) basemap. The live style comes from the mapserve worker; a snapshot
// ships with the app so the map still draws offline before the style has ever been fetched.
import type { StyleSpecification } from 'maplibre-gl'
import snapshot from './supertopo-style.json'

export const MAPSERVE = 'https://mapserve.geoff-7a5.workers.dev'
export const STYLE_URL = `${MAPSERVE}/style.json`

// Only these sources have data in south-west Tasmania (the rest are NSW-only).
const KEEP = new Set(['osm', 'tas-base', 'backroads'])

function trim(style: StyleSpecification): StyleSpecification {
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([k]) => KEEP.has(k)))
  const layers = style.layers.filter((l) => l.type === 'background' || ('source' in l && KEEP.has(l.source as string)))
  return { ...style, sources, layers }
}

let cached: Promise<StyleSpecification> | null = null

export function superTopoStyle(): Promise<StyleSpecification> {
  cached ??= (async () => {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 4000)
      const res = await fetch(STYLE_URL, { signal: ctl.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(String(res.status))
      const live = trim((await res.json()) as StyleSpecification)
      if (!live.sources['tas-base']) throw new Error('style has no tas-base')
      return live
    } catch {
      return snapshot as unknown as StyleSpecification
    }
  })()
  return cached
}

/** Tile templates and zoom ranges used for the offline download. */
export const TILE_SOURCES = [
  { name: 'base', url: `${MAPSERVE}/ofm/{z}/{x}/{y}.pbf`, min: 8, max: 14 },
  { name: 'topo', url: `${MAPSERVE}/tas-base/{z}/{x}/{y}.mvt`, min: 10, max: 15 },
  { name: 'tracks', url: `${MAPSERVE}/osm/{z}/{x}/{y}.mvt`, min: 11, max: 12 },
]
export const GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'
export const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']
export const GLYPH_RANGES = ['0-255', '256-511', '8192-8447']
