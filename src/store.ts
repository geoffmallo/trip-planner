import { useCallback, useEffect, useRef, useState } from 'react'
import { newSegment, type TripState } from './model'
import { ROUTES } from './data/routes'

const KEY = 'trip-planner:v1'

export function defaultTrip(): TripState {
  return {
    v: 1,
    name: 'Western Arthurs & Mt Anne',
    startDate: '2026-12-09',
    pace: 1,
    notes: '',
    segments: [
      newSegment(ROUTES['wa-ak'], true),
      newSegment(ROUTES['wa-full'], false),
      newSegment(ROUTES['mt-anne'], true, 1),
    ],
    dayNotes: {},
    stopNotes: {},
    updatedAt: Date.now(),
  }
}

function load(): TripState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const t = JSON.parse(raw) as TripState
      if (t && t.v === 1 && Array.isArray(t.segments)) return t
    }
  } catch {
    /* ignore */
  }
  return defaultTrip()
}

export function useTrip() {
  const [trip, setTrip] = useState<TripState>(load)
  const current = useRef(trip)
  const history = useRef<TripState[]>([])
  const [canUndo, setCanUndo] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(trip))
    } catch {
      /* storage full or blocked */
    }
  }, [trip])

  const commit = useCallback((next: TripState) => {
    history.current.push(current.current)
    if (history.current.length > 50) history.current.shift()
    current.current = next
    setTrip(next)
    setCanUndo(true)
  }, [])

  const update = useCallback(
    (fn: (t: TripState) => TripState) => {
      const next = fn(current.current)
      if (next !== current.current) commit({ ...next, updatedAt: Date.now() })
    },
    [commit],
  )

  const undo = useCallback(() => {
    const prev = history.current.pop()
    if (prev) {
      current.current = prev
      setTrip(prev)
    }
    setCanUndo(history.current.length > 0)
  }, [])

  const replace = useCallback((t: TripState) => commit(t), [commit])

  return { trip, update, undo, canUndo, replace }
}

// ---- Share links: the whole plan compressed into the URL hash (no server, no login) ----

function toB64Url(bytes: Uint8Array) {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeTrip(t: TripState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(t))
  return toB64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeTrip(s: string): Promise<TripState | null> {
  try {
    const bytes = await pipe(fromB64Url(s), new DecompressionStream('deflate-raw'))
    const t = JSON.parse(new TextDecoder().decode(bytes)) as TripState
    return t && t.v === 1 && Array.isArray(t.segments) ? t : null
  } catch {
    return null
  }
}

export async function shareUrl(t: TripState) {
  const base = location.href.split('#')[0]
  return `${base}#plan=${await encodeTrip(t)}`
}

export function downloadJson(t: TripState) {
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${t.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'trip'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
