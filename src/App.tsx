import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { ROUTES } from './data/routes'
import {
  addCamp,
  buildItinerary,
  carryOver,
  expandSegment,
  fmtDate,
  fmtHrs,
  removeCamp,
  setDayEnd,
  type CustomStop,
  type DayPlan,
  type Leg,
  type LegX,
  type SegmentState,
  type SideTrip,
  type Stop,
  type Totals,
  type TripState,
} from './model'
import { decodeTrip, defaultTrip, downloadJson, shareUrl, useTrip } from './store'
import { legGuide, stopGuide } from './data/guide'
import type { Focus } from './map/geo'
import { LazyMap, MapOverlay, MapTab, OfflinePanel } from './MapViews'

type Tab = 'plan' | 'map' | 'routes' | 'notes'
type Sheet =
  | { kind: 'leg'; segUid: string; lx: LegX }
  | { kind: 'addStop'; segUid: string; afterId: string; afterName: string; suggestions: SideTrip[] }
  | { kind: 'stop'; stop: Stop }
  | { kind: 'menu' }
  | null

export default function App() {
  const { trip, update, undo, canUndo, replace } = useTrip()
  const [tab, setTab] = useState<Tab>('plan')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, setPending] = useState<TripState | null>(null)
  const [mapFocus, setMapFocus] = useState<Focus | null>(null)
  const it = useMemo(() => buildItinerary(trip, ROUTES), [trip])

  // Incoming share link
  useEffect(() => {
    const m = location.hash.match(/plan=([\w-]+)/)
    if (!m) return
    decodeTrip(m[1]).then((t) => {
      history.replaceState(null, '', location.pathname + location.search)
      if (t) setPending(t)
      else flash('That share link could not be read')
    })
  }, [])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  const updateSeg = (uid: string, fn: (s: SegmentState) => SegmentState) =>
    update((t) => ({ ...t, segments: t.segments.map((s) => (s.uid === uid ? fn(s) : s)) }))

  const pace = trip.pace || 1

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <input
            className="trip-name"
            value={trip.name}
            aria-label="Trip name"
            onChange={(e) => update((t) => ({ ...t, name: e.target.value }))}
          />
          <button className="icon-btn" disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo">
            ↶
          </button>
          <button className="icon-btn" onClick={() => setSheet({ kind: 'menu' })} aria-label="Menu" title="Share, export, settings">
            ⋯
          </button>
        </div>
        <div className="summary">
          <label className="start">
            <span>Start</span>
            <input
              type="date"
              value={trip.startDate}
              onChange={(e) => e.target.value && update((t) => ({ ...t, startDate: e.target.value }))}
            />
          </label>
          <div className="sum-cell">
            <b>{it.days.length}</b>
            <span>
              days · ends {fmtDate(it.endDate, { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
          <Stats t={it.totals} pace={pace} />
          <div className="sum-sub">
            {it.walkDays} walking · {it.restDays} rest/transfer
            {pace !== 1 && <> · pace ×{pace}</>}
          </div>
        </div>
      </header>
      <div className="sticky">
        <Timeline days={it.days} pace={pace} />
        <nav className="tabs">
          {(['plan', 'map', 'routes', 'notes'] as Tab[]).map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {k === 'plan' ? 'Itinerary' : k === 'map' ? 'Map' : k === 'routes' ? 'Routes' : 'Notes'}
            </button>
          ))}
        </nav>
      </div>

      <main>
        {tab === 'plan' && (
          <PlanView
            trip={trip}
            days={it.days}
            segTotals={it.segmentTotals}
            pace={pace}
            updateSeg={updateSeg}
            update={update}
            setSheet={setSheet}
            openMap={setMapFocus}
          />
        )}
        {tab === 'map' && (
          <MapTab
            days={it.days}
            trip={trip}
            onOpenDay={(day) => {
              setTab('plan')
              setTimeout(() => document.getElementById(`day-${day}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
            }}
          />
        )}
        {tab === 'routes' && <RoutesView trip={trip} update={update} updateSeg={updateSeg} segTotals={it.segmentTotals} pace={pace} />}
        {tab === 'notes' && (
          <section className="card pad">
            <h3>Trip notes</h3>
            <p className="muted">Permits, gear, transport, emergency contacts, tide of the plan — anything.</p>
            <NoteArea value={trip.notes} rows={14} onSave={(v) => update((t) => ({ ...t, notes: v }))} placeholder="e.g. Parks pass, PLB hired, car shuffle…" />
          </section>
        )}
        <p className="foot muted">
          Times are guidebook estimates × your pace. Figures are research estimates — tap any leg to correct it.
        </p>
      </main>

      {sheet && (
        <SheetView
          sheet={sheet}
          trip={trip}
          close={() => setSheet(null)}
          update={update}
          updateSeg={updateSeg}
          flash={flash}
          replace={replace}
        />
      )}

      {pending && (
        <div className="overlay" onClick={() => setPending(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Open shared plan?</h3>
            <p>
              “{pending.name}” starting {fmtDate(pending.startDate)}. This replaces the plan on this device (you can undo).
            </p>
            <div className="row gap">
              <button
                className="primary"
                onClick={() => {
                  replace({ ...pending, updatedAt: Date.now() })
                  setPending(null)
                  flash('Shared plan loaded')
                }}
              >
                Replace my plan
              </button>
              <button onClick={() => setPending(null)}>Keep mine</button>
            </div>
          </div>
        </div>
      )}
      {mapFocus && <MapOverlay days={it.days} trip={trip} focus={mapFocus} close={() => setMapFocus(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Stats({ t, pace, compact }: { t: Totals; pace: number; compact?: boolean }) {
  return (
    <div className={compact ? 'stats compact' : 'stats'}>
      <span title="Distance">{t.km.toFixed(1)} km</span>
      <span title="Ascent">↑{Math.round(t.up)} m</span>
      <span title="Descent">↓{Math.round(t.down)} m</span>
      <span title="Estimated time">⏱ {fmtHrs(t.hrs * pace)}</span>
    </div>
  )
}

function effort(hrs: number) {
  if (hrs <= 0) return 'e0'
  if (hrs < 4) return 'e1'
  if (hrs < 6.5) return 'e2'
  if (hrs < 9) return 'e3'
  return 'e4'
}

function Timeline({ days, pace }: { days: DayPlan[]; pace: number }) {
  return (
    <div className="timeline" role="list" aria-label="Trip timeline">
      {days.map((d) => {
        const color = d.route?.color ?? 'var(--muted)'
        const isRest = d.kind === 'rest'
        const label = d.kind === 'walk' ? d.stops[d.stops.length - 1].wp.name : d.before ? 'Transfer' : 'Rest'
        return (
          <button
            key={d.idx}
            role="listitem"
            className={`tl-day ${isRest ? 'rest' : effort(d.totals.hrs * pace)}`}
            style={{ ['--seg' as string]: color }}
            title={`${fmtDate(d.date)} — ${label}`}
            onClick={() => document.getElementById(`day-${d.idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <span className="tl-wd">{fmtDate(d.date, { weekday: 'narrow' })}</span>
            <span className="tl-d">{fmtDate(d.date, { day: 'numeric' })}</span>
            <span className="tl-bar" />
          </button>
        )
      })}
    </div>
  )
}

interface PlanProps {
  trip: TripState
  days: DayPlan[]
  segTotals: Record<string, Totals & { days: number }>
  pace: number
  updateSeg: (uid: string, fn: (s: SegmentState) => SegmentState) => void
  update: (fn: (t: TripState) => TripState) => void
  setSheet: (s: Sheet) => void
  openMap: (f: Focus) => void
}

function PlanView({ trip, days, segTotals, pace, updateSeg, update, setSheet, openMap }: PlanProps) {
  if (!days.length) return <p className="card pad">No routes enabled — switch some on in Routes.</p>
  const walkNos = days.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + (d.kind === 'walk' ? 1 : 0)], [])
  return (
    <div className="days">
      {days.map((d, i) => {
        const header =
          d.segUid !== days[i - 1]?.segUid && d.route ? (
            <SegHeader
              key={`h-${d.segUid}`}
              name={d.route.name}
              color={d.route.color}
              t={segTotals[d.segUid]}
              pace={pace}
              onMap={() => openMap({ kind: 'seg', segUid: d.segUid })}
            />
          ) : null
        const seg = trip.segments.find((s) => s.uid === d.segUid)!
        if (d.kind === 'rest') {
          return (
            <div key={d.idx} style={{ display: 'contents' }}>
              {header}
              <RestCard
                d={d}
                note={trip.dayNotes[d.noteKey] ?? ''}
                onNote={(v) => update((t) => ({ ...t, dayNotes: { ...t.dayNotes, [d.noteKey]: v } }))}
                onRemove={() =>
                  updateSeg(seg.uid, (s) =>
                    d.before
                      ? { ...s, restBefore: Math.max(0, s.restBefore - 1) }
                      : { ...s, rest: { ...s.rest, [d.restAt!]: Math.max(0, (s.rest[d.restAt!] ?? 1) - 1) } },
                  )
                }
              />
            </div>
          )
        }
        return (
          <div key={d.idx} style={{ display: 'contents' }}>
            {header}
            <DayCard
              d={d}
              n={walkNos[i]}
              seg={seg}
              pace={pace}
              trip={trip}
              updateSeg={updateSeg}
              update={update}
              setSheet={setSheet}
              days={days}
              openMap={openMap}
            />
          </div>
        )
      })}
    </div>
  )
}

function SegHeader({
  name,
  color,
  t,
  pace,
  onMap,
}: {
  name: string
  color: string
  t?: Totals & { days: number }
  pace: number
  onMap: () => void
}) {
  return (
    <div className="seg-head" style={{ ['--seg' as string]: color }}>
      <div className="row between">
        <h2>{name}</h2>
        <button className="mini" onClick={onMap}>
          🗺 Map
        </button>
      </div>
      {t && (
        <div className="muted small">
          {t.days} days · <Stats t={t} pace={pace} compact />
        </div>
      )}
    </div>
  )
}

function DayCard({
  d,
  n,
  seg,
  pace,
  trip,
  updateSeg,
  update,
  setSheet,
  days,
  openMap,
}: {
  d: Extract<DayPlan, { kind: 'walk' }>
  n: number
  seg: SegmentState
  pace: number
  trip: TripState
  updateSeg: PlanProps['updateSeg']
  update: PlanProps['update']
  setSheet: (s: Sheet) => void
  days: DayPlan[]
  openMap: (f: Focus) => void
}) {
  const [open, setOpen] = useState(false)
  const start = d.stops[0]
  const end = d.stops[d.stops.length - 1]
  const route = d.route
  const all = useMemo(() => expandSegment(route, seg).stops, [route, seg])
  const endIdx = all.findIndex((s) => s.id === end.id)
  const startIdx = all.findIndex((s) => s.id === start.id)
  const canShorten = endIdx - startIdx > 1
  const canExtend = endIdx < all.length - 1
  const hrs = d.totals.hrs * pace
  const restCount = seg.rest[end.id] ?? 0

  const endAt = (id: string) => updateSeg(seg.uid, (s) => setDayEnd(s, route, start.id, id))
  const shorten = () => {
    const prev = all[endIdx - 1]
    updateSeg(seg.uid, (s) => {
      let x = removeCamp(s, end.id)
      if (d.isSegmentEnd) x = addCamp(x, prev.id)
      else x = addCamp(x, prev.id)
      // keep any rest days with the new end
      if (s.rest[end.id]) x = { ...x, rest: { ...x.rest, [prev.id]: s.rest[end.id] } }
      return x
    })
  }
  const extend = () => endAt(all[endIdx + 1].id)

  return (
    <article className={`card day ${effort(hrs)}`} id={`day-${d.idx}`} style={{ ['--seg' as string]: route.color }}>
      <div className="day-top" onClick={() => setOpen((o) => !o)}>
        <div className="day-date">
          <span className="dn">Day {n}</span>
          <span className="dd">{fmtDate(d.date)}</span>
        </div>
        <div className="day-main">
          <h3>
            {start.wp.name} → {end.wp.name}
          </h3>
          <div className="via">
            {d.stops.map((s, i) => (
              <span key={s.key} className={s.wp.custom ? 'custom' : ''}>
                {i > 0 && <span className="sep"> – </span>}
                {s.wp.name}
              </span>
            ))}
          </div>
          <Stats t={d.totals} pace={pace} />
        </div>
        <span className={`chev ${open ? 'open' : ''}`} aria-hidden>
          ›
        </span>
      </div>

      <div className="day-ctrl">
        <button disabled={!canShorten} onClick={shorten} title="End the day one stop earlier">
          ◀ Shorter
        </button>
        <select
          aria-label="Day ends at"
          value={end.id}
          onChange={(e) => {
            const id = e.target.value
            const idx = all.findIndex((s) => s.id === id)
            if (idx > endIdx) endAt(id)
            else if (idx < endIdx) {
              // shorten to an earlier stop within the day
              updateSeg(seg.uid, (s) => addCamp(d.isSegmentEnd ? s : removeCamp(s, end.id), id))
            }
          }}
        >
          {all.slice(startIdx + 1).map((s) => (
            <option key={s.key} value={s.id}>
              {s.wp.camp ? '⛺ ' : ''}
              {s.wp.name}
            </option>
          ))}
        </select>
        <button disabled={!canExtend} onClick={extend} title="Walk on to the next stop">
          Longer ▶
        </button>
      </div>

      {open && (
        <div className="day-body">
          <div className="day-map" onClick={() => openMap({ kind: 'day', day: d.idx })} role="button" aria-label="Open full-screen map">
            <LazyMap days={days} trip={trip} focus={{ kind: 'day', day: d.idx }} mini className="mini" />
            <span className="map-expand" aria-hidden>
              ⤢
            </span>
          </div>
          <ol className="stops">
            {d.stops.map((s, i) => {
              const lx = d.legs[i]
              const isFirst = i === 0
              const isLast = i === d.stops.length - 1
              return (
                <li key={s.key}>
                  <div className={`stop ${isFirst || isLast ? 'ends' : ''}`}>
                    <span className="dot" />
                    <button className="stop-name" onClick={() => setSheet({ kind: 'stop', stop: s })}>
                      {s.wp.name}
                      {s.wp.elev != null && <small> {s.wp.elev} m</small>}
                      {s.wp.camp && <small title="Campsite"> ⛺</small>}
                      {trip.stopNotes[s.id] && <small title="Has your notes"> 📝</small>}
                    </button>
                    {!isFirst && !isLast && (
                      <button className="mini" onClick={() => endAt(s.id)}>
                        End day here
                      </button>
                    )}
                  </div>
                  {s.wp.note && <div className="stop-note">{s.wp.note}</div>}
                  {stopGuide(s.id) && <div className="stop-note guide">{stopGuide(s.id)}</div>}
                  {s.wp.water && <div className="stop-note">💧 {s.wp.water}</div>}
                  {trip.stopNotes[s.id] && <div className="stop-note mine">📝 {trip.stopNotes[s.id]}</div>}
                  <SideTrips trips={(route.sideTrips ?? []).filter((t) => t.at === s.id)} seg={seg} afterId={s.id} updateSeg={updateSeg} pace={pace} />
                  {lx && (
                    <div className="leg">
                      <button className="leg-stats" onClick={() => setSheet({ kind: 'leg', segUid: seg.uid, lx })}>
                        {lx.leg.km.toFixed(1)} km · ↑{lx.leg.up} ↓{lx.leg.down} · {fmtHrs(lx.leg.hrs * pace)}
                        {lx.overridden && <em> (edited)</em>}
                        {' '}✎
                      </button>
                      {lx.editable !== 'custom' && legGuide(lx.baseKey) && (
                        <p className="track-notes">
                          {lx.editable === 'remainder' && <b>{lx.baseKey.split('>').map((id) => route.stops.find((w) => w.id === id)?.name).join(' → ')}: </b>}
                          {legGuide(lx.baseKey)}
                        </p>
                      )}
                      {lx.leg.note && <div className="leg-note">{lx.leg.note}</div>}
                      <button
                        className="mini ghost"
                        onClick={() =>
                          setSheet({
                            kind: 'addStop',
                            segUid: seg.uid,
                            afterId: s.id,
                            afterName: s.wp.name,
                            suggestions: (route.sideTrips ?? []).filter((t) => t.at === s.id),
                          })
                        }
                      >
                        + stop / side trip
                        {(route.sideTrips ?? []).some((t) => t.at === s.id) && ' ⛰'}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          <div className="row gap wrap">
            {d.endIsCamp && (
              <button onClick={() => updateSeg(seg.uid, (s) => ({ ...s, rest: { ...s.rest, [end.id]: restCount + 1 } }))}>
                + Rest / weather day at {end.wp.name}
              </button>
            )}
            {d.endIsCamp && (
              <button onClick={() => updateSeg(seg.uid, (s) => removeCamp(s, end.id))} title="Merge with the next day">
                Don’t camp here (merge with next day)
              </button>
            )}
          </div>
          <NoteArea
            value={trip.dayNotes[d.noteKey] ?? ''}
            placeholder="Day notes — water, side trips, bail-out options…"
            onSave={(v) => update((t) => ({ ...t, dayNotes: { ...t.dayNotes, [d.noteKey]: v } }))}
          />
        </div>
      )}
      {!open && trip.dayNotes[d.noteKey] && <p className="day-note-preview">📝 {trip.dayNotes[d.noteKey]}</p>}
      {hrs >= 9 && <p className="warn small pad-x">Long day — {fmtHrs(hrs)} at your pace.</p>}
    </article>
  )
}

function SideTrips({
  trips,
  seg,
  afterId,
  updateSeg,
  pace,
}: {
  trips: SideTrip[]
  seg: SegmentState
  afterId: string
  updateSeg: PlanProps['updateSeg']
  pace: number
}) {
  if (!trips.length) return null
  return (
    <div className="side-trips">
      {trips.map((t) => {
        const added = seg.customStops.find((c) => c.side && c.name === t.name)
        return (
          <details key={t.name} className="side-trip">
            <summary>
              <span>⛰ {t.name}</span>
              <small>
                {t.km} km · ↑{t.up} m · {fmtHrs(t.hrs * pace)} return{added && ' · ✓ in plan'}
              </small>
            </summary>
            {t.note && <p>{t.note}</p>}
            {added ? (
              <button
                className="mini ghost"
                onClick={() =>
                  updateSeg(seg.uid, (s) => ({
                    ...s,
                    customStops: s.customStops
                      .filter((c) => c.id !== added.id)
                      .map((c) => (c.afterId === added.id ? { ...c, afterId: added.afterId } : c)),
                  }))
                }
              >
                Remove from day
              </button>
            ) : (
              <button
                className="mini"
                onClick={() => {
                  const id = `c-${Math.random().toString(36).slice(2, 8)}`
                  updateSeg(seg.uid, (s) => ({
                    ...s,
                    customStops: [
                      ...s.customStops.map((x) => (x.afterId === afterId ? { ...x, afterId: id } : x)),
                      { id, name: t.name, afterId, note: t.note, side: true, km: t.km, up: t.up, down: t.up, hrs: t.hrs },
                    ],
                  }))
                }}
              >
                + Add to this day
              </button>
            )}
          </details>
        )
      })}
    </div>
  )
}

function RestCard({
  d,
  note,
  onNote,
  onRemove,
}: {
  d: Extract<DayPlan, { kind: 'rest' }>
  note: string
  onNote: (v: string) => void
  onRemove: () => void
}) {
  return (
    <article className="card rest-card" id={`day-${d.idx}`}>
      <div className="day-top">
        <div className="day-date">
          <span className="dn">{d.before ? 'Transfer' : 'Rest'}</span>
          <span className="dd">{fmtDate(d.date)}</span>
        </div>
        <div className="day-main">
          <h3>{d.label}</h3>
          <NoteArea value={note} rows={2} placeholder="Notes…" onSave={onNote} />
        </div>
        <button className="icon-btn" onClick={onRemove} aria-label="Remove this day" title="Remove this day">
          ✕
        </button>
      </div>
    </article>
  )
}

function NoteArea({ value, onSave, placeholder, rows = 3 }: { value: string; onSave: (v: string) => void; placeholder?: string; rows?: number }) {
  const [v, setV] = useState(value)
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      setV(value)
      last.current = value
    }
  }, [value])
  return (
    <textarea
      className="note"
      rows={rows}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== last.current) {
          last.current = v
          onSave(v)
        }
      }}
    />
  )
}

// ---------------- Routes tab ----------------

function RoutesView({
  trip,
  update,
  updateSeg,
  segTotals,
  pace,
}: {
  trip: TripState
  update: PlanProps['update']
  updateSeg: PlanProps['updateSeg']
  segTotals: Record<string, Totals & { days: number }>
  pace: number
}) {
  const move = (i: number, dir: -1 | 1) =>
    update((t) => {
      const segs = [...t.segments]
      const j = i + dir
      if (j < 0 || j >= segs.length) return t
      ;[segs[i], segs[j]] = [segs[j], segs[i]]
      return { ...t, segments: segs }
    })

  const toggle = (seg: SegmentState) =>
    update((t) => {
      const route = ROUTES[seg.routeId]
      const segs = [...t.segments]
      const i = segs.findIndex((s) => s.uid === seg.uid)
      if (seg.enabled) {
        segs[i] = { ...seg, enabled: false }
        return { ...t, segments: segs }
      }
      // alternatives in the same group (A–K vs Full traverse) are exclusive:
      // switching carries your edits on the shared section across and takes the sibling's place.
      const j = route.group ? segs.findIndex((s) => s.enabled && s.uid !== seg.uid && ROUTES[s.routeId]?.group === route.group) : -1
      if (j < 0) {
        segs[i] = { ...seg, enabled: true }
        return { ...t, segments: segs }
      }
      const sib = segs[j]
      const next = { ...carryOver(sib, ROUTES[sib.routeId], seg, route), enabled: true }
      segs[j] = next
      segs[i] = { ...sib, enabled: false }
      return { ...t, segments: segs }
    })

  return (
    <div className="routes">
      <p className="muted pad-x">Order, include or swap route groups. A–K and the Full Traverse are alternatives.</p>
      {trip.segments.map((seg, i) => {
        const r = ROUTES[seg.routeId]
        if (!r) return null
        const t = segTotals[seg.uid]
        const nonStd =
          seg.camps.length !== r.standardCamps.length || seg.camps.some((c) => !r.standardCamps.includes(c)) || seg.customStops.length > 0
        return (
          <section key={seg.uid} className={`card pad route ${seg.enabled ? '' : 'off'}`} style={{ ['--seg' as string]: r.color }}>
            <div className="row between">
              <label className="row gap">
                <input type="checkbox" checked={seg.enabled} onChange={() => toggle(seg)} />
                <h3>{r.name}</h3>
              </label>
              <div className="row">
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === trip.segments.length - 1} aria-label="Move down">
                  ↓
                </button>
              </div>
            </div>
            <p className="muted small">{r.description}</p>
            {seg.enabled && t && (
              <p className="small">
                {t.days} days · <Stats t={t} pace={pace} compact />
              </p>
            )}
            {seg.enabled && (
              <div className="row gap wrap">
                <label className="row gap small">
                  Transfer/rest days before
                  <input
                    type="number"
                    min={0}
                    max={14}
                    value={seg.restBefore}
                    onChange={(e) => updateSeg(seg.uid, (s) => ({ ...s, restBefore: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </label>
                <label className="row gap small">
                  <input type="checkbox" checked={seg.sameDayStart} onChange={(e) => updateSeg(seg.uid, (s) => ({ ...s, sameDayStart: e.target.checked }))} />
                  Start same day previous route ends
                </label>
                {nonStd && (
                  <button
                    className="small"
                    onClick={() =>
                      confirm('Reset this route to the standard stages? Your added stops and rest days on it are removed; notes stay.') &&
                      updateSeg(seg.uid, (s) => ({ ...s, camps: [...r.standardCamps], rest: {}, customStops: [] }))
                    }
                  >
                    Reset to standard stages
                  </button>
                )}
              </div>
            )}
            <details>
              <summary className="small">Standard stages</summary>
              <ol className="small std">
                {stdStages(r).map((s, k) => (
                  <li key={k}>{s}</li>
                ))}
              </ol>
            </details>
          </section>
        )
      })}
    </div>
  )
}

function stdStages(r: (typeof ROUTES)[string]) {
  const ends = [...r.standardCamps, r.stops[r.stops.length - 1].id]
  const out: string[] = []
  let from = r.stops[0].name
  for (const id of ends) {
    const to = r.stops.find((s) => s.id === id)?.name ?? id
    out.push(`${from} → ${to}`)
    from = to
  }
  return out
}

// ---------------- Sheets (modals) ----------------

function SheetView({
  sheet,
  trip,
  close,
  update,
  updateSeg,
  flash,
  replace,
}: {
  sheet: NonNullable<Sheet>
  trip: TripState
  close: () => void
  update: PlanProps['update']
  updateSeg: PlanProps['updateSeg']
  flash: (m: string) => void
  replace: (t: TripState) => void
}) {
  return (
    <div className="overlay" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {sheet.kind === 'leg' && <LegSheet sheet={sheet} trip={trip} close={close} updateSeg={updateSeg} />}
        {sheet.kind === 'addStop' && <AddStopSheet sheet={sheet} close={close} updateSeg={updateSeg} />}
        {sheet.kind === 'stop' && (
          <>
            <h3>{sheet.stop.wp.name}</h3>
            {sheet.stop.wp.elev != null && <p className="muted">{sheet.stop.wp.elev} m{sheet.stop.wp.camp ? ' · campsite' : ''}</p>}
            {sheet.stop.wp.note && <p>{sheet.stop.wp.note}</p>}
            {stopGuide(sheet.stop.id) && <p>{stopGuide(sheet.stop.id)}</p>}
            {sheet.stop.wp.water && <p>💧 {sheet.stop.wp.water}</p>}
            <label className="field">
              Your notes for this place
              <NoteArea
                value={trip.stopNotes[sheet.stop.id] ?? ''}
                rows={4}
                onSave={(v) => update((t) => ({ ...t, stopNotes: { ...t.stopNotes, [sheet.stop.id]: v } }))}
              />
            </label>
            <button className="primary" onClick={close}>
              Done
            </button>
          </>
        )}
        {sheet.kind === 'menu' && <MenuSheet trip={trip} close={close} update={update} flash={flash} replace={replace} />}
      </div>
    </div>
  )
}

function num(v: string) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function LegFields({ v, set }: { v: Leg; set: (l: Leg) => void }) {
  return (
    <div className="grid4">
      <label className="field">
        km
        <input inputMode="decimal" type="number" step="0.1" value={v.km} onChange={(e) => set({ ...v, km: num(e.target.value) })} />
      </label>
      <label className="field">
        ↑ m
        <input inputMode="numeric" type="number" value={v.up} onChange={(e) => set({ ...v, up: num(e.target.value) })} />
      </label>
      <label className="field">
        ↓ m
        <input inputMode="numeric" type="number" value={v.down} onChange={(e) => set({ ...v, down: num(e.target.value) })} />
      </label>
      <label className="field">
        hours
        <input inputMode="decimal" type="number" step="0.25" value={v.hrs} onChange={(e) => set({ ...v, hrs: num(e.target.value) })} />
      </label>
    </div>
  )
}

function LegSheet({
  sheet,
  trip,
  close,
  updateSeg,
}: {
  sheet: Extract<NonNullable<Sheet>, { kind: 'leg' }>
  trip: TripState
  close: () => void
  updateSeg: PlanProps['updateSeg']
}) {
  const seg = trip.segments.find((s) => s.uid === sheet.segUid)!
  const route = ROUTES[seg.routeId]
  const { lx } = sheet

  if (lx.editable === 'custom') {
    const c = seg.customStops.find((s) => s.id === lx.to.id)!
    return <CustomStopEditor c={c} seg={seg} close={close} updateSeg={updateSeg} />
  }

  const [fromId, toId] = lx.baseKey.split('>')
  const i = route.stops.findIndex((s) => s.id === fromId)
  const orig = route.legs[i]
  const cur: Leg = { ...orig, ...(seg.legOverrides[lx.baseKey] ?? {}) }
  return (
    <LegEditor
      title={`${route.stops[i].name} → ${route.stops.find((s) => s.id === toId)?.name}`}
      subtitle={lx.editable === 'remainder' ? 'Editing the whole leg; your added stops are subtracted from it.' : undefined}
      orig={orig}
      cur={cur}
      close={close}
      onSave={(l) =>
        updateSeg(seg.uid, (s) => ({
          ...s,
          legOverrides: { ...s.legOverrides, [lx.baseKey]: { km: l.km, up: l.up, down: l.down, hrs: l.hrs, note: l.note } },
        }))
      }
      onReset={
        seg.legOverrides[lx.baseKey]
          ? () =>
              updateSeg(seg.uid, (s) => {
                const o = { ...s.legOverrides }
                delete o[lx.baseKey]
                return { ...s, legOverrides: o }
              })
          : undefined
      }
    />
  )
}

function LegEditor({
  title,
  subtitle,
  orig,
  cur,
  close,
  onSave,
  onReset,
}: {
  title: string
  subtitle?: string
  orig: Leg
  cur: Leg
  close: () => void
  onSave: (l: Leg) => void
  onReset?: () => void
}) {
  const [v, setV] = useState<Leg>(cur)
  return (
    <>
      <h3>{title}</h3>
      {subtitle && <p className="muted small">{subtitle}</p>}
      <p className="muted small">
        Research figure: {orig.km} km · ↑{orig.up} ↓{orig.down} · {fmtHrs(orig.hrs)}
        {orig.conf && ` · confidence ${orig.conf}`}
      </p>
      <LegFields v={v} set={setV} />
      <label className="field">
        Note
        <textarea className="note" rows={3} value={v.note ?? ''} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      <div className="row gap wrap">
        <button
          className="primary"
          onClick={() => {
            onSave(v)
            close()
          }}
        >
          Save
        </button>
        {onReset && (
          <button
            onClick={() => {
              onReset()
              close()
            }}
          >
            Reset to research figure
          </button>
        )}
        <button onClick={close}>Cancel</button>
      </div>
    </>
  )
}

function CustomStopEditor({
  c,
  seg,
  close,
  updateSeg,
}: {
  c: CustomStop
  seg: SegmentState
  close: () => void
  updateSeg: PlanProps['updateSeg']
}) {
  const [name, setName] = useState(c.name)
  const [note, setNote] = useState(c.note ?? '')
  const [v, setV] = useState<Leg>({ km: c.km, up: c.up, down: c.down, hrs: c.hrs })
  return (
    <>
      <h3>Your stop</h3>
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="muted small">From the previous point to here:</p>
      <LegFields v={v} set={setV} />
      <label className="field">
        Note
        <textarea className="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row gap wrap">
        <button
          className="primary"
          onClick={() => {
            updateSeg(seg.uid, (s) => ({
              ...s,
              customStops: s.customStops.map((x) => (x.id === c.id ? { ...x, name: name || x.name, note, ...v } : x)),
            }))
            close()
          }}
        >
          Save
        </button>
        <button
          className="danger"
          onClick={() => {
            updateSeg(seg.uid, (s) => ({
              ...s,
              // re-link anything chained after this stop
              customStops: s.customStops.filter((x) => x.id !== c.id).map((x) => (x.afterId === c.id ? { ...x, afterId: c.afterId } : x)),
              camps: s.camps.filter((x) => x !== c.id),
              rest: Object.fromEntries(Object.entries(s.rest).filter(([k]) => k !== c.id)),
            }))
            close()
          }}
        >
          Delete stop
        </button>
        <button onClick={close}>Cancel</button>
      </div>
    </>
  )
}

function AddStopSheet({
  sheet,
  close,
  updateSeg,
}: {
  sheet: Extract<NonNullable<Sheet>, { kind: 'addStop' }>
  close: () => void
  updateSeg: PlanProps['updateSeg']
}) {
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [camp, setCamp] = useState(false)
  const [side, setSide] = useState(false)
  const [v, setV] = useState<Leg>({ km: 1, up: 0, down: 0, hrs: 0.5 })
  const pick = (t: SideTrip) => {
    setName(t.name)
    setNote(t.note ?? 'Side trip (return)')
    setSide(true)
    setCamp(false)
    setV({ km: t.km, up: t.up, down: t.up, hrs: t.hrs })
  }
  return (
    <>
      <h3>Add after {sheet.afterName}</h3>
      {sheet.suggestions.length > 0 && (
        <div className="col gap">
          <span className="muted small">Side trips from here:</span>
          {sheet.suggestions.map((t) => (
            <button key={t.name} className="suggest" onClick={() => pick(t)}>
              ⛰ {t.name} <small>· {t.km} km return · {fmtHrs(t.hrs)}</small>
            </button>
          ))}
        </div>
      )}
      <label className="field">
        Name
        <input value={name} placeholder="e.g. lunch spot, water, summit" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="row gap small">
        <input type="checkbox" checked={side} onChange={(e) => setSide(e.target.checked)} /> Side trip (out-and-back: adds to the day)
      </label>
      <p className="muted small">
        {side
          ? 'Return distance, climb and time for the side trip:'
          : `Distance, climb and time from ${sheet.afterName} to this stop (taken out of the leg it sits in):`}
      </p>
      <LegFields v={v} set={setV} />
      <label className="field">
        Note
        <textarea className="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {!side && (
        <label className="row gap small">
          <input type="checkbox" checked={camp} onChange={(e) => setCamp(e.target.checked)} /> Camp here (end the day)
        </label>
      )}
      <div className="row gap">
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() => {
            const id = `c-${Math.random().toString(36).slice(2, 8)}`
            updateSeg(sheet.segUid, (s) => ({
              ...s,
              // insert directly after afterId: anything previously chained there now follows the new stop
              customStops: [
                ...s.customStops.map((x) => (x.afterId === sheet.afterId ? { ...x, afterId: id } : x)),
                { id, name: name.trim(), afterId: sheet.afterId, note, side, ...v },
              ],
              camps: camp && !side ? [...s.camps, id] : s.camps,
            }))
            close()
          }}
        >
          Add
        </button>
        <button onClick={close}>Cancel</button>
      </div>
    </>
  )
}

function MenuSheet({
  trip,
  close,
  update,
  flash,
  replace,
}: {
  trip: TripState
  close: () => void
  update: PlanProps['update']
  flash: (m: string) => void
  replace: (t: TripState) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <h3>Plan</h3>
      <label className="field">
        Walking pace (multiplier on guidebook times)
        <div className="row gap">
          <input
            type="range"
            min={0.7}
            max={1.6}
            step={0.05}
            value={trip.pace}
            onChange={(e) => update((t) => ({ ...t, pace: Number(e.target.value) }))}
          />
          <b>×{trip.pace.toFixed(2)}</b>
        </div>
      </label>
      <p className="muted small">1.0 = guidebook. Use 1.2–1.4 for heavy packs, wet scrub or a slower group.</p>

      <h3>Move between devices</h3>
      <p className="muted small">
        No login: the whole plan is packed into a link. Open it on your other device and choose “Replace my plan”.
      </p>
      <div className="col gap">
        <button
          className="primary"
          onClick={async () => {
            const url = await shareUrl(trip)
            try {
              if (navigator.share) await navigator.share({ title: trip.name, url })
              else {
                await navigator.clipboard.writeText(url)
                flash('Link copied')
              }
            } catch {
              /* user cancelled share */
            }
          }}
        >
          Share / copy plan link
        </button>
        <button onClick={() => downloadJson(trip)}>Export backup (.json)</button>
        <button onClick={() => fileRef.current?.click()}>Import backup…</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              const t = JSON.parse(await f.text()) as TripState
              if (t.v !== 1 || !Array.isArray(t.segments)) throw new Error()
              replace(t)
              flash('Plan imported')
              close()
            } catch {
              flash('Not a valid plan file')
            }
          }}
        />
        <button
          className="danger"
          onClick={() => {
            if (confirm('Start over with the default plan? (You can undo.)')) {
              replace(defaultTrip())
              close()
            }
          }}
        >
          Reset to default plan
        </button>
      </div>
      <OfflinePanel />
      <p className="muted small">Saved on this device automatically · last change {new Date(trip.updatedAt).toLocaleString()}</p>
      <button onClick={close}>Close</button>
    </>
  )
}
