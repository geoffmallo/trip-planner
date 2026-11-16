import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { fmtDate, type DayPlan, type TripState } from './model'
import { clearOffline, downloadOffline, offlineStatus, type OfflineStatus } from './map/offline'
import { dayColor, type Focus } from './map/geo'

// MapLibre is ~1 MB; only load it when a map is on screen.
const TripMap = lazy(() => import('./map/TripMap'))

export function LazyMap(props: {
  days: DayPlan[]
  trip: TripState
  focus: Focus
  className?: string
  mini?: boolean
  onPickDay?: (day: number) => void
}) {
  return (
    <Suspense fallback={<div className={`trip-map ${props.className ?? ''}`}><div className="map-msg">Loading map…</div></div>}>
      <TripMap {...props} />
    </Suspense>
  )
}

function DayChips({ days, focus, setFocus }: { days: DayPlan[]; focus: Focus; setFocus: (f: Focus) => void }) {
  const walks = days.filter((d) => d.kind === 'walk')
  return (
    <div className="chips" role="list">
      <button className={`chip ${focus.kind === 'all' ? 'on' : ''}`} onClick={() => setFocus({ kind: 'all' })}>
        All
      </button>
      {walks.map((d, i) => {
        const walk = i + 1
        const on = focus.kind === 'day' && focus.day === d.idx
        return (
          <button
            key={d.idx}
            className={`chip ${on ? 'on' : ''}`}
            style={{ ['--c' as string]: dayColor(walk) }}
            onClick={() => setFocus({ kind: 'day', day: d.idx })}
            title={fmtDate(d.date)}
          >
            <i />D{walk}
          </button>
        )
      })}
    </div>
  )
}

function FocusCaption({ days, focus }: { days: DayPlan[]; focus: Focus }) {
  if (focus.kind !== 'day') return null
  const d = days[focus.day]
  if (!d || d.kind !== 'walk') return null
  return (
    <p className="map-caption">
      {fmtDate(d.date)} · {d.stops[0].wp.name} → {d.stops[d.stops.length - 1].wp.name} · {d.totals.km.toFixed(1)} km ↑{Math.round(d.totals.up)} m
    </p>
  )
}

/** The Map tab: whole trip, tap a day to zoom to it. */
export function MapTab({ days, trip, onOpenDay }: { days: DayPlan[]; trip: TripState; onOpenDay: (day: number) => void }) {
  const [focus, setFocus] = useState<Focus>({ kind: 'all' })
  return (
    <section className="map-tab">
      <DayChips days={days} focus={focus} setFocus={setFocus} />
      <LazyMap days={days} trip={trip} focus={focus} className="tall" onPickDay={(day) => setFocus({ kind: 'day', day })} />
      <FocusCaption days={days} focus={focus} />
      {focus.kind === 'day' && (
        <button className="mini" onClick={() => onOpenDay(focus.kind === 'day' ? focus.day : 0)}>
          Open day in itinerary ›
        </button>
      )}
      <OfflinePanel />
    </section>
  )
}

/** Full-screen map, opened from a section header or a day. */
export function MapOverlay({ days, trip, focus: initial, close }: { days: DayPlan[]; trip: TripState; focus: Focus; close: () => void }) {
  const [focus, setFocus] = useState<Focus>(initial)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [close])
  return (
    <div className="map-full">
      <div className="map-full-bar">
        <button onClick={close} aria-label="Close map">
          ✕
        </button>
        <DayChips days={days} focus={focus} setFocus={setFocus} />
      </div>
      <LazyMap days={days} trip={trip} focus={focus} className="fill" onPickDay={(day) => setFocus({ kind: 'day', day })} />
      <FocusCaption days={days} focus={focus} />
    </div>
  )
}

export function OfflinePanel() {
  const [st, setSt] = useState<OfflineStatus | null>(null)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [msg, setMsg] = useState('')
  const abort = useRef<AbortController | null>(null)
  const supported = typeof caches !== 'undefined'

  const refresh = () => offlineStatus().then(setSt).catch(() => setSt(null))
  useEffect(() => {
    if (supported) refresh()
    return () => abort.current?.abort()
  }, [supported])

  if (!supported) return <p className="muted small">Offline maps need a browser with Cache Storage (install the app from Safari).</p>
  const complete = st && st.saved >= st.total
  return (
    <div className="card pad offline">
      <h3>Offline map</h3>
      <p className="muted small">
        Saves the Super Topo map around every route (wide area to zoom 12, detail along the tracks to zoom 15), hillshade and fonts — about
        23 MB. Download on Wi-Fi before you go; the map then works with no signal. Your GPS dot works offline too.
      </p>
      {st && !busy && (
        <p className="small">
          {complete ? '✅ ' : ''}
          {st.saved} of {st.total} map pieces saved
          {st.bytes > 0 && <> · app storage {(st.bytes / 1048576).toFixed(1)} MB</>}
        </p>
      )}
      {busy && (
        <div className="progress" aria-label="Download progress">
          <i style={{ width: `${(busy.done / busy.total) * 100}%` }} />
          <span>
            {busy.done} / {busy.total}
          </span>
        </div>
      )}
      <div className="row gap wrap">
        {!busy && (
          <button
            className="primary"
            onClick={async () => {
              abort.current = new AbortController()
              setMsg('')
              setBusy({ done: 0, total: st?.total ?? 1 })
              const failed = await downloadOffline((done, total) => setBusy({ done, total }), abort.current.signal)
              setBusy(null)
              setMsg(abort.current.signal.aborted ? 'Stopped.' : failed ? `${failed} pieces failed — tap again to retry.` : 'Map saved for offline use.')
              refresh()
            }}
          >
            {complete ? 'Check for missing pieces' : st?.saved ? 'Resume download' : 'Download offline map'}
          </button>
        )}
        {busy && <button onClick={() => abort.current?.abort()}>Stop</button>}
        {!busy && !!st?.saved && (
          <button
            className="ghost"
            onClick={async () => {
              if (!confirm('Delete the saved offline map?')) return
              await clearOffline()
              setMsg('Offline map deleted.')
              refresh()
            }}
          >
            Delete saved map
          </button>
        )}
      </div>
      {msg && <p className="small">{msg}</p>}
    </div>
  )
}
