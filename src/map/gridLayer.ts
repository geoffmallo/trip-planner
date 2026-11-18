// UTM grid overlay, styled as malloMapWeb's UtmGridLayer: thin black lines on a white halo,
// every tenth line heavier, topo-sheet numbers (small 100 km prefix, large principal figures)
// just inside each edge. Spacing steps 1 km -> 10 km -> 100 km with on-screen square size.
// Drawn client-side from maths, so it works offline with no extra tiles.
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { buildUtmGrid, planUtmGrid, UTM_GRID_LAYER_IDS, UTM_GRID_SOURCE_ID } from './utmGrid'

const [LABELS, MAJOR, MAJOR_HALO, MINOR, MINOR_HALO] = UTM_GRID_LAYER_IDS

const LABEL_TEXT: ExpressionSpecification = [
  'case',
  ['==', ['get', 'pre'], ''],
  ['format', ['get', 'num'], {}],
  ['format', ['get', 'pre'], { 'font-scale': 0.7 }, ['get', 'num'], {}],
]

const STORE_KEY = 'map-utm-grid'

export function gridPref(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setGridPref(on: boolean) {
  try {
    localStorage.setItem(STORE_KEY, String(on))
  } catch {
    /* private mode: preference just isn't remembered */
  }
}

function gridData(m: MLMap): FeatureCollection {
  const c = m.getContainer()
  const b = m.getBounds()
  const bounds = { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() }
  const plan = planUtmGrid(bounds, c.clientWidth, c.clientHeight)
  return plan ? buildUtmGrid(bounds, plan) : { type: 'FeatureCollection', features: [] }
}

/**
 * Add the grid lines under `beforeId` (so the route draws on top), numbers under `labelsBeforeId`, and keep it current as the map moves. Returns a function that shows or hides it.
 */
export function addUtmGrid(m: MLMap, beforeId: string | undefined, labelsBeforeId: string | undefined, visible: boolean): (on: boolean) => void {
  m.addSource(UTM_GRID_SOURCE_ID, { type: 'geojson', data: gridData(m) })
  const halo = { 'line-color': '#ffffff', 'line-blur': 0.5 }
  m.addLayer(
    { id: MINOR_HALO, type: 'line', source: UTM_GRID_SOURCE_ID, filter: ['==', ['get', 't'], 'minor'], paint: { ...halo, 'line-opacity': 0.4, 'line-width': 2 } },
    beforeId,
  )
  m.addLayer(
    { id: MINOR, type: 'line', source: UTM_GRID_SOURCE_ID, filter: ['==', ['get', 't'], 'minor'], paint: { 'line-color': '#000000', 'line-opacity': 0.55, 'line-width': 0.6 } },
    beforeId,
  )
  m.addLayer(
    { id: MAJOR_HALO, type: 'line', source: UTM_GRID_SOURCE_ID, filter: ['==', ['get', 't'], 'major'], paint: { ...halo, 'line-opacity': 0.5, 'line-width': 3 } },
    beforeId,
  )
  m.addLayer(
    { id: MAJOR, type: 'line', source: UTM_GRID_SOURCE_ID, filter: ['==', ['get', 't'], 'major'], paint: { 'line-color': '#000000', 'line-opacity': 0.8, 'line-width': 1.4 } },
    beforeId,
  )
  // Numbers sit above the route lines but below the trip's own labels, so a camp name wins a collision.
  m.addLayer({
    id: LABELS,
    type: 'symbol',
    source: UTM_GRID_SOURCE_ID,
    filter: ['==', ['get', 't'], 'label'],
    layout: {
      'text-field': LABEL_TEXT,
      'text-size': 13,
      'text-font': ['Noto Sans Medium'],
      'text-anchor': 'center',
      'text-padding': 4,
      'text-allow-overlap': false,
      'text-rotation-alignment': 'viewport',
      'text-pitch-alignment': 'viewport',
    },
    paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  }, labelsBeforeId)

  let on = visible
  const update = () => {
    if (on) (m.getSource(UTM_GRID_SOURCE_ID) as GeoJSONSource | undefined)?.setData(gridData(m))
  }
  m.on('moveend', update)
  m.on('resize', update)

  const show = (v: boolean) => {
    on = v
    for (const id of UTM_GRID_LAYER_IDS) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none')
    update()
  }
  show(visible)
  return show
}
