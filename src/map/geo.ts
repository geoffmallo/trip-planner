// Turns an itinerary into map geometry: one line piece per leg, tagged with its day.
import geo from '../data/geo.json'
import type { DayPlan, SideTrip, TripState } from '../model'

export type LngLat = [number, number]
export type Focus = { kind: 'all' } | { kind: 'seg'; segUid: string } | { kind: 'day'; day: number }

// Distinct colours so neighbouring days read apart on the map.
const DAY_COLORS = ['#d1495b', '#2e86ab', '#e08e0b', '#3a9d5d', '#8e44ad', '#c0392b', '#16a085', '#d35400', '#2c3e9e', '#7f8c0d']
export const dayColor = (walk: number) => DAY_COLORS[(walk - 1) % DAY_COLORS.length]
type Geo = {
  bounds: [number, number, number, number]
  stops: Record<string, LngLat>
  legs: Record<string, { km: number; line: LngLat[] }>
  side: { at: string; match: string; ll: LngLat }[]
}
export const GEO = geo as unknown as Geo

export function stopLL(id: string): LngLat | undefined {
  return GEO.stops[id]
}

export function sideTarget(t: SideTrip): LngLat | undefined {
  const name = t.name.toLowerCase()
  return GEO.side.find((s) => s.at === t.at && name.includes(s.match))?.ll
}

const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180
function dist(a: LngLat, b: LngLat) {
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** The part of a line between fractions f0..f1 of its length. */
export function sliceLine(line: LngLat[], f0: number, f1: number): LngLat[] {
  if (f0 <= 0 && f1 >= 1) return line
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]))
  const total = cum[cum.length - 1] || 1
  const at = (m: number): LngLat => {
    let i = cum.findIndex((c) => c >= m)
    if (i <= 0) i = 1
    const t = (m - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
    return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]
  }
  const m0 = f0 * total, m1 = f1 * total
  return [at(m0), ...line.filter((_, i) => cum[i] > m0 && cum[i] < m1), at(m1)]
}

export interface Piece {
  day: number // index into itinerary.days
  walk: number // walking day number (1-based)
  segUid: string
  color: string
  line: LngLat[]
}

export interface Marker {
  ll: LngLat
  name: string
  kind: 'camp' | 'start' | 'stop' | 'custom'
  day: number
  label?: string // e.g. "D3"
}

/**
 * Lines and markers for every walking day. Custom stops have no surveyed position,
 * so they are placed along their base leg by distance.
 */
export function tripGeometry(days: DayPlan[], trip: TripState) {
  const pieces: Piece[] = []
  const markers: Marker[] = []
  const side: { at: LngLat; to: LngLat; name: string; day: number }[] = []
  let walk = 0
  let lastSeg = ''
  // progress (km) through each base leg, per segment, so split legs slice correctly
  const progress = new Map<string, number>()

  for (const d of days) {
    if (d.kind !== 'walk') continue
    walk++
    const seg = trip.segments.find((s) => s.uid === d.segUid)
    const customs = new Map((seg?.customStops ?? []).map((c) => [c.id, c]))
    const pos = new Map<string, LngLat>()

    for (const lx of d.legs) {
      const base = GEO.legs[lx.baseKey]
      if (!base) continue
      const baseKm = d.route.legs[d.route.stops.findIndex((s) => s.id === lx.baseKey.split('>')[0])]?.km || 1
      const pKey = `${d.segUid}|${lx.baseKey}`
      const done = progress.get(pKey) ?? 0
      const toCustom = customs.get(lx.to.id)
      let f0 = Math.min(1, done / baseKm)
      let f1: number
      if (lx.editable === 'base' || lx.editable === 'remainder') f1 = 1
      else if (toCustom?.side) f1 = f0
      else f1 = Math.min(1, (done + lx.leg.km) / baseKm)
      if (toCustom && !toCustom.side) progress.set(pKey, done + lx.leg.km)
      if (lx.editable !== 'custom') progress.delete(pKey)
      if (f1 < f0) f0 = f1
      const line = sliceLine(base.line, f0, f1)
      if (line.length > 1 && f1 > f0) pieces.push({ day: d.idx, walk, segUid: d.segUid, color: d.route.color, line })
      pos.set(lx.from.key, pos.get(lx.from.key) ?? line[0])
      pos.set(lx.to.key, line[line.length - 1])
    }

    d.stops.forEach((s, i) => {
      const ll = stopLL(s.id) ?? pos.get(s.key)
      if (!ll) return
      const last = i === d.stops.length - 1
      const kind: Marker['kind'] = i === 0 ? 'start' : last ? 'camp' : s.wp.custom ? 'custom' : 'stop'
      if (i === 0 && lastSeg === d.segUid) return // already drawn as the previous day's camp
      markers.push({ ll, name: s.wp.name, kind, day: d.idx, label: last ? `D${walk}` : undefined })
    })

    for (const t of d.route.sideTrips ?? []) {
      if (!d.stops.some((s) => s.id === t.at)) continue
      const at = stopLL(t.at)
      const to = sideTarget(t)
      if (at && to) side.push({ at, to, name: t.name, day: d.idx })
    }
    lastSeg = d.segUid
  }
  return { pieces, markers, side }
}

export function boundsOf(points: LngLat[]): [LngLat, LngLat] | null {
  if (!points.length) return null
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [x, y] of points) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [[w, s], [e, n]]
}
