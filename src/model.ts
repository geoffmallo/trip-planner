// Core types and the itinerary engine.
// A trip is an ordered list of route segments. Each segment walks a fixed
// sequence of stops; the user decides which stops end a day ("camps").
// Moving a camp reflows every later day and date automatically.

export type Confidence = 'high' | 'med' | 'low'

export interface Waypoint {
  id: string
  name: string
  elev?: number
  camp?: boolean // a recognised campsite
  water?: string
  note?: string
  custom?: boolean
}

export interface Leg {
  km: number
  up: number
  down: number
  hrs: number
  note?: string
  conf?: Confidence
}

export interface RouteDef {
  id: string
  name: string
  short: string
  group?: string // routes in the same group are alternatives (only one enabled)
  color: string
  description: string
  stops: Waypoint[]
  legs: Leg[] // legs[i] runs stops[i] -> stops[i + 1]
  standardCamps: string[] // default day ends (stop ids, never the last stop)
  sideTrips?: SideTrip[]
}

export interface SideTrip {
  at: string // stop id
  name: string
  km: number // return
  hrs: number // return
  up: number // ascent (descent is the same)
  note?: string
}

export interface CustomStop {
  id: string
  name: string
  afterId: string // inserted after this stop (base or custom)
  km: number // stats from the previous point to this stop
  up: number
  down: number
  hrs: number
  note?: string
  camp?: boolean
  side?: boolean // side trip: adds to the day instead of splitting the leg it sits in
}

export interface SegmentState {
  uid: string
  routeId: string
  enabled: boolean
  camps: string[] // stop ids that end a day
  rest: Record<string, number> // extra rest/weather days after the day ending at stop id
  customStops: CustomStop[]
  legOverrides: Record<string, Partial<Leg>> // key `${from}>${to}`
  restBefore: number // transfer / rest days before this segment starts
  sameDayStart: boolean // start on the same date the previous segment ended
}

export interface TripState {
  v: 1
  name: string
  startDate: string // YYYY-MM-DD
  pace: number // multiplier on guidebook hours
  notes: string
  segments: SegmentState[]
  dayNotes: Record<string, string>
  stopNotes: Record<string, string>
  updatedAt: number
}

export interface Stop {
  key: string // `${segUid}:${id}`
  id: string
  wp: Waypoint
  segUid: string
}

export interface LegX {
  key: string // `${from}>${to}`
  from: Stop
  to: Stop
  leg: Leg
  overridden: boolean
  baseKey: string // the base leg this belongs to (for overrides)
  editable: 'base' | 'custom' | 'remainder'
}

export interface Totals {
  km: number
  up: number
  down: number
  hrs: number
}

export type DayPlan =
  | {
      kind: 'walk'
      idx: number
      date: string
      segUid: string
      route: RouteDef
      stops: Stop[]
      legs: LegX[]
      totals: Totals
      noteKey: string
      endIsCamp: boolean // true when the day ends at a user camp (not the segment end)
      isSegmentEnd: boolean
    }
  | {
      kind: 'rest'
      idx: number
      date: string
      segUid: string
      route?: RouteDef
      at: Stop | null
      label: string
      noteKey: string
      restIndex: number
      restAt?: string // stop id the rest is attached to
      before?: boolean // transfer/rest before a segment
    }

export interface Itinerary {
  days: DayPlan[]
  totals: Totals
  endDate: string
  walkDays: number
  restDays: number
  segmentTotals: Record<string, Totals & { days: number }>
}

const zero = (): Totals => ({ km: 0, up: 0, down: 0, hrs: 0 })
const add = (a: Totals, b: Leg | Totals): Totals => ({
  km: a.km + b.km,
  up: a.up + b.up,
  down: a.down + b.down,
  hrs: a.hrs + b.hrs,
})

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' })
}

export function fmtHrs(h: number) {
  const mins = Math.round(h * 60)
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  if (!hh) return `${mm}m`
  return mm ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${hh}h`
}

/** Expand a route + segment state into its ordered stops and legs (with custom stops spliced in). */
export function expandSegment(route: RouteDef, seg: SegmentState): { stops: Stop[]; legs: LegX[] } {
  const mk = (wp: Waypoint): Stop => ({ key: `${seg.uid}:${wp.id}`, id: wp.id, wp, segUid: seg.uid })
  const stops: Stop[] = []
  const legs: LegX[] = []

  route.stops.forEach((wp, i) => {
    const from = mk(wp)
    stops.push(from)
    if (i === route.stops.length - 1) return
    const next = mk(route.stops[i + 1])
    const baseKey = `${wp.id}>${next.id}`
    const ov = seg.legOverrides[baseKey]
    const base: Leg = { ...route.legs[i], ...(ov ?? {}) }

    // custom stops chained after this base stop
    const chain: CustomStop[] = []
    let cursor = wp.id
    for (;;) {
      const c = seg.customStops.find((s) => s.afterId === cursor)
      if (!c) break
      chain.push(c)
      cursor = c.id
    }

    let prev = from
    let used = zero()
    for (const c of chain) {
      const cs = mk({ id: c.id, name: c.name, note: c.note, camp: c.camp, custom: true })
      const leg: Leg = { km: c.km, up: c.up, down: c.down, hrs: c.hrs }
      legs.push({ key: `${prev.id}>${cs.id}`, from: prev, to: cs, leg, overridden: false, baseKey, editable: 'custom' })
      if (!c.side) used = add(used, leg)
      stops.push(cs)
      prev = cs
    }
    const rem: Leg = chain.some((c) => !c.side)
      ? {
          km: Math.max(0, base.km - used.km),
          up: Math.max(0, base.up - used.up),
          down: Math.max(0, base.down - used.down),
          hrs: Math.max(0, base.hrs - used.hrs),
          note: base.note,
          conf: base.conf,
        }
      : base
    legs.push({
      key: `${prev.id}>${next.id}`,
      from: prev,
      to: next,
      leg: rem,
      overridden: !!ov,
      baseKey,
      editable: chain.some((c) => !c.side) ? 'remainder' : 'base',
    })
  })
  return { stops, legs }
}

export function buildItinerary(trip: TripState, routes: Record<string, RouteDef>): Itinerary {
  const days: DayPlan[] = []
  let date = trip.startDate
  let first = true
  let totals = zero()
  let walkDays = 0
  let restDays = 0
  const segmentTotals: Itinerary['segmentTotals'] = {}

  const nextDate = () => {
    if (!first) date = addDays(date, 1)
    first = false
    return date
  }

  for (const seg of trip.segments) {
    if (!seg.enabled) continue
    const route = routes[seg.routeId]
    if (!route) continue
    const segTot = { ...zero(), days: 0 }

    for (let r = 0; r < seg.restBefore; r++) {
      days.push({
        kind: 'rest',
        idx: days.length,
        date: nextDate(),
        segUid: seg.uid,
        route,
        at: null,
        label: `Transfer / rest before ${route.short}`,
        noteKey: `${seg.uid}:before:${r}`,
        restIndex: r,
        before: true,
      })
      restDays++
    }

    const { stops, legs } = expandSegment(route, seg)
    const camps = new Set(seg.camps)
    let dayStops: Stop[] = [stops[0]]
    let dayLegs: LegX[] = []
    let dayTot = zero()
    let sameDay = seg.sameDayStart && !first

    for (let i = 0; i < legs.length; i++) {
      const lx = legs[i]
      dayLegs.push(lx)
      dayStops.push(lx.to)
      dayTot = add(dayTot, lx.leg)
      const isEnd = i === legs.length - 1
      const isCamp = camps.has(lx.to.id)
      if (isCamp || isEnd) {
        const d = sameDay ? date : nextDate()
        sameDay = false
        days.push({
          kind: 'walk',
          idx: days.length,
          date: d,
          segUid: seg.uid,
          route,
          stops: dayStops,
          legs: dayLegs,
          totals: dayTot,
          noteKey: `${seg.uid}:${lx.to.id}`,
          endIsCamp: !isEnd,
          isSegmentEnd: isEnd,
        })
        walkDays++
        segTot.days++
        totals = add(totals, dayTot)
        Object.assign(segTot, add(segTot, dayTot))
        const nRest = seg.rest[lx.to.id] ?? 0
        if (!isEnd) {
          for (let r = 0; r < nRest; r++) {
            days.push({
              kind: 'rest',
              idx: days.length,
              date: nextDate(),
              segUid: seg.uid,
              route,
              at: lx.to,
              label: `Rest / weather day at ${lx.to.wp.name}`,
              noteKey: `${seg.uid}:${lx.to.id}:rest${r}`,
              restIndex: r,
              restAt: lx.to.id,
            })
            restDays++
            segTot.days++
          }
        }
        dayStops = [lx.to]
        dayLegs = []
        dayTot = zero()
      }
    }
    segmentTotals[seg.uid] = segTot
  }

  return { days, totals, endDate: first ? trip.startDate : date, walkDays, restDays, segmentTotals }
}

/** Set the end of the day that starts at `fromId` to `toId`, removing camps in between. */
export function setDayEnd(seg: SegmentState, route: RouteDef, fromId: string, toId: string): SegmentState {
  const { stops } = expandSegment(route, seg)
  const a = stops.findIndex((s) => s.id === fromId)
  const b = stops.findIndex((s) => s.id === toId)
  if (a < 0 || b <= a) return seg
  const between = new Set(stops.slice(a + 1, b).map((s) => s.id))
  const camps = seg.camps.filter((c) => !between.has(c))
  const isLast = b === stops.length - 1
  if (!isLast && !camps.includes(toId)) camps.push(toId)
  const rest = { ...seg.rest }
  between.forEach((id) => delete rest[id])
  return { ...seg, camps, rest }
}

export function removeCamp(seg: SegmentState, id: string): SegmentState {
  const rest = { ...seg.rest }
  delete rest[id]
  return { ...seg, camps: seg.camps.filter((c) => c !== id), rest }
}

export function addCamp(seg: SegmentState, id: string): SegmentState {
  return seg.camps.includes(id) ? seg : { ...seg, camps: [...seg.camps, id] }
}

/**
 * Carry edits from `from` (e.g. A–K) onto `to` (e.g. Full traverse) for the stretch of route
 * the two share before they branch: day ends, rest days, added stops and leg corrections.
 */
export function carryOver(from: SegmentState, fromRoute: RouteDef, to: SegmentState, toRoute: RouteDef): SegmentState {
  const shared = new Set<string>()
  for (let i = 0; i < Math.min(fromRoute.stops.length, toRoute.stops.length); i++) {
    if (fromRoute.stops[i].id !== toRoute.stops[i].id) break
    shared.add(fromRoute.stops[i].id)
  }
  if (!shared.size) return to
  const customs: CustomStop[] = []
  const anchors = new Set(shared)
  for (let added = true; added; ) {
    added = false
    for (const c of from.customStops) {
      if (!customs.includes(c) && anchors.has(c.afterId)) {
        customs.push(c)
        anchors.add(c.id)
        added = true
      }
    }
  }
  const carried = new Set([...shared, ...customs.map((c) => c.id)])
  const keep = (id: string) => !carried.has(id)
  return {
    ...to,
    camps: [...to.camps.filter(keep), ...from.camps.filter((c) => carried.has(c))],
    rest: {
      ...Object.fromEntries(Object.entries(to.rest).filter(([k]) => keep(k))),
      ...Object.fromEntries(Object.entries(from.rest).filter(([k]) => carried.has(k))),
    },
    customStops: [...to.customStops.filter((c) => !anchors.has(c.afterId) && !carried.has(c.id)), ...customs],
    legOverrides: {
      ...Object.fromEntries(Object.entries(to.legOverrides).filter(([k]) => k.split('>').some((x) => !shared.has(x)))),
      ...Object.fromEntries(Object.entries(from.legOverrides).filter(([k]) => k.split('>').every((x) => shared.has(x)))),
    },
    restBefore: from.restBefore,
    sameDayStart: from.sameDayStart,
  }
}

export function newSegment(route: RouteDef, enabled = true, restBefore = 0): SegmentState {
  return {
    uid: `${route.id}-${Math.random().toString(36).slice(2, 7)}`,
    routeId: route.id,
    enabled,
    camps: [...route.standardCamps],
    rest: {},
    customStops: [],
    legOverrides: {},
    restBefore,
    sameDayStart: false,
  }
}
