import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre v6 is ESM-only and no longer finds its worker by itself under a bundler:
// Vite bundles the worker as its own hashed asset (so the PWA precaches it) and we hand over its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DayPlan, TripState } from '../model'
import { boundsOf, dayColor, tripGeometry, type Focus, type LngLat } from './geo'
import { superTopoStyle } from './style'

maplibregl.setWorkerUrl(workerUrl)

interface Props {
  days: DayPlan[]
  trip: TripState
  focus: Focus
  className?: string
  /** Small embedded map: no controls, gestures still work. */
  mini?: boolean
  onPickDay?: (day: number) => void
}

export default function TripMap({ days, trip, focus, className, mini, onPickDay }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const pick = useRef(onPickDay)
  useEffect(() => {
    pick.current = onPickDay
  }, [onPickDay])

  const g = useMemo(() => tripGeometry(days, trip), [days, trip])

  const inFocus = (day: number) => {
    if (focus.kind === 'all') return true
    if (focus.kind === 'day') return day === focus.day
    return days[day]?.segUid === focus.segUid
  }

  // Build the map once.
  useEffect(() => {
    let cancelled = false
    let m: MLMap | null = null
    superTopoStyle()
      .then((style) => {
        if (cancelled || !el.current) return
        m = new maplibregl.Map({
          container: el.current,
          style,
          bounds: [
            [146.2, -43.2],
            [146.5, -42.93],
          ],
          maxZoom: 16.5,
          minZoom: 7,
          attributionControl: false,
          // The embedded day map is a static preview (so it never traps page scrolling); tap opens full screen.
          interactive: !mini,
          dragRotate: false,
          pitchWithRotate: false,
        })
        if (!mini) m.touchZoomRotate.disableRotation()
        if (!mini) {
          m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
          m.addControl(
            new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
            'top-right',
          )
          m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
        }
        m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Super Topo · malloMap · © OpenStreetMap · LIST' }))
        m.on('load', () => {
          if (!m) return
          // Start with the attribution collapsed to its (i) button.
          m.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
          addTripLayers(m)
          map.current = m
          setReady(true)
        })
        m.on('error', () => {
          /* missing tiles offline are expected; keep quiet */
        })
        m.on('click', 'trip-camp', (e) => {
          const f = e.features?.[0]
          if (f && pick.current) pick.current(Number(f.properties.day))
        })
        m.on('click', 'trip-line', (e) => {
          const f = e.features?.[0]
          if (f && pick.current) pick.current(Number(f.properties.day))
        })
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      m?.remove()
      map.current = null
    }
  }, [mini])

  // Push data + fit whenever the plan or focus changes.
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const lines = g.pieces.map((p) => ({
      type: 'Feature' as const,
      properties: { day: p.day, walk: p.walk, color: dayColor(p.walk), focus: inFocus(p.day) ? 1 : 0 },
      geometry: { type: 'LineString' as const, coordinates: p.line },
    }))
    const points = g.markers
      .filter((mk) => mk.kind !== 'stop' || inFocus(mk.day))
      .map((mk) => {
        const walk = g.pieces.find((p) => p.day === mk.day)?.walk ?? 1
        return {
          type: 'Feature' as const,
          properties: {
            day: mk.day,
            kind: mk.kind,
            name: mk.name,
            label: mk.label ? `${mk.label} ${mk.name}` : mk.name,
            color: dayColor(walk),
            focus: inFocus(mk.day) ? 1 : 0,
          },
          geometry: { type: 'Point' as const, coordinates: mk.ll },
        }
      })
    const side = g.side
      .filter((s) => inFocus(s.day))
      .flatMap((s) => [
        {
          type: 'Feature' as const,
          properties: { name: s.name },
          geometry: { type: 'LineString' as const, coordinates: [s.at, s.to] },
        },
        { type: 'Feature' as const, properties: { name: s.name.replace(/\s*\(.*\)$/, '') }, geometry: { type: 'Point' as const, coordinates: s.to } },
      ])
    ;(m.getSource('trip-lines') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lines })
    ;(m.getSource('trip-points') as GeoJSONSource).setData({ type: 'FeatureCollection', features: points })
    ;(m.getSource('trip-side') as GeoJSONSource).setData({ type: 'FeatureCollection', features: side })

    const focusPts: LngLat[] = [
      ...g.pieces.filter((p) => inFocus(p.day)).flatMap((p) => p.line),
      ...g.side.filter((s) => inFocus(s.day)).map((s) => s.to),
    ]
    const b = boundsOf(focusPts)
    if (b) m.fitBounds(b, { padding: mini ? 24 : 48, maxZoom: 15, duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, focus, ready])

  return (
    <div className={`trip-map ${className ?? ''}`}>
      <div ref={el} className="trip-map-canvas" />
      {failed && <div className="map-msg">Map unavailable</div>}
    </div>
  )
}

function addTripLayers(m: MLMap) {
  const empty = { type: 'FeatureCollection' as const, features: [] }
  m.addSource('trip-lines', { type: 'geojson', data: empty })
  m.addSource('trip-points', { type: 'geojson', data: empty })
  m.addSource('trip-side', { type: 'geojson', data: empty })
  const font = ['Noto Sans Medium']

  m.addLayer({
    id: 'trip-side-line',
    type: 'line',
    source: 'trip-side',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#5b4a8a', 'line-width': 2, 'line-dasharray': [1.5, 1.5] },
  })
  m.addLayer({
    id: 'trip-casing',
    type: 'line',
    source: 'trip-lines',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['case', ['==', ['get', 'focus'], 1], 7, 4],
      'line-opacity': ['case', ['==', ['get', 'focus'], 1], 0.9, 0.5],
    },
  })
  m.addLayer({
    id: 'trip-line',
    type: 'line',
    source: 'trip-lines',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['==', ['get', 'focus'], 1], 4, 2],
      'line-opacity': ['case', ['==', ['get', 'focus'], 1], 1, 0.45],
    },
  })
  m.addLayer({
    id: 'trip-side-end',
    type: 'circle',
    source: 'trip-side',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 4, 'circle-color': '#5b4a8a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
  })
  m.addLayer({
    id: 'trip-stop',
    type: 'circle',
    source: 'trip-points',
    filter: ['in', ['get', 'kind'], ['literal', ['stop', 'custom']]],
    paint: { 'circle-radius': 3.5, 'circle-color': '#fff', 'circle-stroke-color': '#333', 'circle-stroke-width': 1.5 },
  })
  m.addLayer({
    id: 'trip-camp',
    type: 'circle',
    source: 'trip-points',
    filter: ['in', ['get', 'kind'], ['literal', ['camp', 'start']]],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'focus'], 1], 7, 5],
      'circle-color': ['case', ['==', ['get', 'kind'], 'start'], '#222', ['get', 'color']],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  })
  m.addLayer({
    id: 'trip-side-label',
    type: 'symbol',
    source: 'trip-side',
    filter: ['==', ['geometry-type'], 'Point'],
    minzoom: 12,
    layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#4a3a78', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
  })
  m.addLayer({
    id: 'trip-stop-label',
    type: 'symbol',
    source: 'trip-points',
    filter: ['in', ['get', 'kind'], ['literal', ['stop', 'custom']]],
    minzoom: 13,
    layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 11, 'text-offset': [0.8, 0], 'text-anchor': 'left', 'text-optional': true },
    paint: { 'text-color': '#222', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
  })
  m.addLayer({
    id: 'trip-camp-label',
    type: 'symbol',
    source: 'trip-points',
    filter: ['in', ['get', 'kind'], ['literal', ['camp', 'start']]],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': font,
      'text-size': ['case', ['==', ['get', 'focus'], 1], 13, 11],
      'text-offset': [0.9, 0],
      'text-anchor': 'left',
      'text-allow-overlap': false,
      'symbol-sort-key': ['case', ['==', ['get', 'focus'], 1], 0, 1],
    },
    paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 2 },
  })
  for (const id of ['trip-camp', 'trip-line']) {
    m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'))
    m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''))
  }
}
