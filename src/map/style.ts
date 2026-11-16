// Super Topo (malloMap) basemap. The live style comes from the mapserve worker; a snapshot
// ships with the app so the map still draws offline before the style has ever been fetched.
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import snapshot from './supertopo-style.json'

export const MAPSERVE = 'https://mapserve.geoff-7a5.workers.dev'
export const STYLE_URL = `${MAPSERVE}/style.json`

// Only these sources have data in south-west Tasmania (the rest are NSW-only).
const KEEP = new Set(['osm', 'tas-base', 'backroads', 'hillshade'])

function trim(style: StyleSpecification): StyleSpecification {
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([k]) => KEEP.has(k)))
  const layers = style.layers.filter((l) => l.type === 'background' || ('source' in l && KEEP.has(l.source as string)))
  return { ...style, sources, layers }
}

// Hillshade, as malloMapWeb adds it (src/lib/map/hillshade.ts): the published style doesn't draw
// relief yet, so the app adds mapserve's terrain-RGB tileset itself, over the vegetation and under
// the first contour layer. Tiles are listed inline (not via hillshade.json) so the URLs are stable
// for the offline cache and no TileJSON fetch is needed with no signal.
const HILLSHADE_TILES = `${MAPSERVE}/hillshade/{z}/{x}/{y}.webp`
/** The tileset's floor: there are no tiles below z12. */
const HILLSHADE_MIN = 12
const HILLSHADE_MAX = 15
const SHADOW = 'rgba(28, 36, 48, 0.8)'
const HIGHLIGHT = 'rgba(255, 253, 245, 0.8)'
const ACCENT = 'rgba(0, 0, 0, 0.8)'

function withHillshade(style: StyleSpecification): StyleSpecification {
  // A style that already shades its relief is left alone: two layers would draw it twice as dark.
  if (style.layers.some((l) => l.type === 'hillshade') || style.sources.hillshade) return style
  const layer: LayerSpecification = {
    id: 'hillshade',
    type: 'hillshade',
    source: 'hillshade',
    minzoom: HILLSHADE_MIN,
    paint: {
      'hillshade-exaggeration': 0.5,
      'hillshade-illumination-anchor': 'map',
      'hillshade-illumination-direction': 315,
      'hillshade-shadow-color': SHADOW,
      'hillshade-highlight-color': HIGHLIGHT,
      'hillshade-accent-color': ACCENT,
    },
  }
  const contour = style.layers.findIndex((l) => l.id.includes('contour') || ('source' in l && l.source === 'contours'))
  const at = contour >= 0 ? contour : style.layers.findIndex((l) => l.type === 'symbol')
  const layers = [...style.layers]
  layers.splice(at >= 0 ? at : layers.length, 0, layer)
  return {
    ...style,
    sources: {
      ...style.sources,
      hillshade: {
        type: 'raster-dem',
        tiles: [HILLSHADE_TILES],
        encoding: 'mapbox',
        tileSize: 256,
        minzoom: HILLSHADE_MIN,
        maxzoom: HILLSHADE_MAX,
        bounds: [145.9863281, -43.5166885, 152.2265625, -31.2034049],
      },
    },
    layers,
  }
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
      return withHillshade(live)
    } catch {
      return withHillshade(snapshot as unknown as StyleSpecification)
    }
  })()
  return cached
}

/** Tile templates and zoom ranges used for the offline download. */
export const TILE_SOURCES = [
  { name: 'base', url: `${MAPSERVE}/ofm/{z}/{x}/{y}.pbf`, min: 8, max: 14 },
  { name: 'topo', url: `${MAPSERVE}/tas-base/{z}/{x}/{y}.mvt`, min: 10, max: 15 },
  { name: 'tracks', url: `${MAPSERVE}/osm/{z}/{x}/{y}.mvt`, min: 11, max: 12 },
  { name: 'relief', url: HILLSHADE_TILES, min: HILLSHADE_MIN, max: HILLSHADE_MAX },
]
export const GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf'
export const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']
export const GLYPH_RANGES = ['0-255', '256-511', '8192-8447']
