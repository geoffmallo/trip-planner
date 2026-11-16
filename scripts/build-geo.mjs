// Builds src/data/geo.json: a coordinate for every stop and a track line for every leg.
//
//   node scripts/build-geo.mjs <osm.json>
//
// <osm.json> is an Overpass `out body geom;` dump of highways, peaks, camps and named
// lakes around the Western Arthurs and Mt Anne (query in scripts/overpass.txt).
// Each leg is the shortest path along the OSM path/road network between its stops.
// Stops with no surveyed position (`interp`) are placed along the path by the
// research leg distances.
import { readFileSync, writeFileSync } from 'node:fs'
import { ROUTES } from '../src/data/routes.ts'

const osm = JSON.parse(readFileSync(process.argv[2], 'utf8')).elements

// ---------- geometry helpers ----------
const R = 6371000
const rad = (d) => (d * Math.PI) / 180
function dist([lon1, lat1], [lon2, lat2]) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
const round = ([lon, lat]) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]

function centroid(geom) {
  let x = 0, y = 0
  for (const p of geom) { x += p.lon; y += p.lat }
  return [x / geom.length, y / geom.length]
}

// Douglas–Peucker in a local metre projection.
function simplify(pts, tol = 6) {
  if (pts.length < 3) return pts
  const k = Math.cos(rad(pts[0][1]))
  const xy = pts.map(([lon, lat]) => [lon * 111320 * k, lat * 110540])
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = xy[a], [bx, by] = xy[b]
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1
    let best = -1, bi = -1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (xy[i][0] - ax) - dx * (xy[i][1] - ay)) / L
      if (d > best) { best = d; bi = i }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

// ---------- graph ----------
const coord = new Map() // node id -> [lon, lat]
const adj = new Map() // node id -> [[nbr, metres]]
for (const w of osm) {
  if (w.type !== 'way' || !w.tags?.highway) continue
  w.nodes.forEach((id, i) => coord.set(id, [w.geometry[i].lon, w.geometry[i].lat]))
  for (let i = 0; i + 1 < w.nodes.length; i++) {
    const a = w.nodes[i], b = w.nodes[i + 1]
    const d = dist(coord.get(a), coord.get(b))
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a).push([b, d])
    adj.get(b).push([a, d])
  }
}

function snap(ll) {
  let best = null, bd = Infinity
  for (const [id, c] of coord) {
    const d = dist(ll, c)
    if (d < bd) { bd = d; best = id }
  }
  return { id: best, d: bd }
}

function shortest(a, b) {
  const D = new Map([[a, 0]]), prev = new Map(), done = new Set()
  const heap = [[0, a]]
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top }
  while (heap.length) {
    const [d, u] = pop()
    if (done.has(u)) continue
    done.add(u)
    if (u === b) break
    for (const [v, w] of adj.get(u) ?? []) {
      const nd = d + w
      if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); prev.set(v, u); push([nd, v]) }
    }
  }
  if (!D.has(b)) return null
  const path = [b]
  while (path[0] !== a) path.unshift(prev.get(path[0]))
  return path.map((id) => coord.get(id))
}

// ---------- named features ----------
const named = (pred) => osm.filter((e) => e.tags && pred(e.tags))
function feature(name, pred = () => true) {
  const e = named((t) => t.name === name && pred(t))[0]
  if (!e) throw new Error(`OSM feature not found: ${name}`)
  if (e.type === 'node') return [e.lon, e.lat]
  if (e.geometry) return centroid(e.geometry)
  const outer = e.members.find((m) => m.role === 'outer' && m.geometry)
  return centroid(outer.geometry)
}
const lake = (n) => feature(n, (t) => t.natural === 'water')
const peak = (n) => feature(n, (t) => t.natural === 'peak')
const camp = (n) => feature(n, (t) => t.tourism)
const ll = (lat, lon) => [lon, lat]

// Stop positions. 'interp' = placed along the path by leg distance.
const STOPS = {
  'scotts-peak': ll(-43.0384, 146.2987), // McKays Track start, Huon Campground
  'junction-creek': camp('Junction Creek Campsite'),
  'moraine-a-foot': ll(-43.1049, 146.2515), // Moraine A Track leaves the Port Davey Track
  'moraine-a-top': ll(-43.1123, 146.2257),
  'capella-crags': peak('Capella Crags'),
  'lake-cygnus': camp('Lake Cygnus Campsite'),
  'mt-hayes': peak('Mount Hayes'),
  'procyon-peak': peak('Procyon Peak'),
  'square-lake': lake('Square Lake'),
  'orion-saddle': ll(-43.1461, 146.271), // Lake Oberon campsite track junction
  'lake-oberon': camp('Lake Oberon Campsite'),
  'mt-pegasus': peak('Mount Pegasus'),
  'mt-capricorn': peak('Mount Capricorn'),
  'high-moor': camp('High Moor Campsite'),
  'beggary-bumps': peak('Beggary Bumps'),
  'mt-taurus': peak('Mount Taurus'),
  'haven-lake': camp('Haven Lake Campsite'),
  'lake-sirona': lake('Lake Sirona'),
  'mt-scorpio': peak('Mount Scorpio'),
  'kappa-moraine-top': ll(-43.1575, 146.3494),
  'seven-mile-creek': camp('Seven Mile Creek Campsite'),
  'wullyawa-creek': 'interp',
  'two-mile-creek': 'interp',
  'junction-creek-r': camp('Junction Creek Campsite'),
  'scotts-peak-r': ll(-43.0384, 146.2987),
  'lake-vesta': lake('Lake Vesta'),
  'lake-juno': lake('Lake Juno'),
  'promontory-lake': camp('Promontory Lake Campsite'),
  'the-phoenix': peak('The Phoenix'),
  'west-portal-jn': peak('West Portal'),
  'crags-of-andromeda': 'interp',
  'lake-rosanne': camp('Lake Rosanne Camp Site'),
  'strike-creek-jn': ll(-43.167, 146.4695),
  'cracroft-jn': ll(-43.1464, 146.476),
  'condominium-creek': ll(-42.9581, 146.3625),
  'high-camp-hut': 'interp',
  'mt-eliza': peak('Mount Eliza'),
  'mt-anne-jn': ll(-42.9494, 146.4232),
  'shelf-camp': camp('Shelf Camp'),
  'the-notch': 'interp',
  'mt-lot': peak('Mount Lot'),
  'lonely-tarns': camp('Lonely Tarns Campsite'),
  'sarah-jane-jn': peak('Mount Sarah Jane'),
  'anne-river-jn': ll(-42.9979, 146.4252),
  'red-tape-creek': ll(-43.0192, 146.3659),
  'condominium-creek-r': ll(-42.9581, 146.3625),
}

// Side-trip destinations, matched to side trips by `at` + a word in the name.
const SIDE = [
  { at: 'moraine-a-top', match: 'hesperus', ll: peak('Mount Hesperus') },
  { at: 'mt-hayes', match: 'hayes', ll: peak('Mount Hayes') },
  { at: 'orion-saddle', match: 'orion', ll: peak('Mount Orion') },
  { at: 'orion-saddle', match: 'sirius', ll: peak('Mount Sirius') },
  { at: 'high-moor', match: 'columba', ll: peak('Mount Columba') },
  { at: 'high-moor', match: 'dorado', ll: peak('Dorado Peak') },
  { at: 'haven-lake', match: 'aldebaran', ll: peak('Mount Aldebaran') },
  { at: 'mt-scorpio', match: 'scorpio', ll: peak('Mount Scorpio') },
  { at: 'west-portal-jn', match: 'portal', ll: peak('West Portal') },
  { at: 'mt-anne-jn', match: 'anne', ll: peak('Mount Anne') },
  { at: 'anne-river-jn', match: 'judd', ll: lake('Lake Judd') },
  { at: 'lonely-tarns', match: 'lot', ll: peak('Lots Wife') },
  { at: 'capella-crags', match: 'fortuna', ll: lake('Lake Fortuna') },
  { at: 'sarah-jane-jn', match: 'sarah', ll: peak('Mount Sarah Jane') },
  { at: 'mt-anne-jn', match: 'eve', ll: peak('Eve Peak') },
  { at: 'kappa-moraine-top', match: 'carina', ll: peak('Carina Peak') },
  { at: 'west-portal-jn', match: 'venus', ll: lake('Lake Venus') },
  { at: 'west-portal-jn', match: 'canopus', ll: peak('Mount Canopus') },
]

// ---------- build ----------
const stops = {}
const legs = {}
const warnings = []
const snaps = new Map()
const snapOf = (id) => {
  if (!snaps.has(id)) {
    const s = snap(STOPS[id])
    if (s.d > 300) warnings.push(`${id}: nearest track is ${Math.round(s.d)} m away`)
    snaps.set(id, s)
  }
  return snaps.get(id).id
}

for (const route of Object.values(ROUTES)) {
  const ids = route.stops.map((s) => s.id)
  for (const id of ids) if (!(id in STOPS)) throw new Error(`No position for stop ${id}`)
  const anchors = ids.map((id, i) => (STOPS[id] === 'interp' ? -1 : i)).filter((i) => i >= 0)
  for (let k = 0; k + 1 < anchors.length; k++) {
    const a = anchors[k], b = anchors[k + 1]
    let path = shortest(snapOf(ids[a]), snapOf(ids[b]))
    if (!path) {
      warnings.push(`${ids[a]} → ${ids[b]}: no connected path, drawn straight`)
      path = [STOPS[ids[a]], STOPS[ids[b]]]
    }
    // cumulative metres along the path
    const cum = [0]
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]))
    const total = cum.at(-1)
    const legKm = route.legs.slice(a, b).map((l) => l.km)
    const sumKm = legKm.reduce((x, y) => x + y, 0) || 1
    // Cut points (metres) for each stop a..b
    const cuts = [0]
    for (const km of legKm) cuts.push(cuts.at(-1) + (km / sumKm) * total)
    const pointAt = (m) => {
      const i = Math.max(1, cum.findIndex((c) => c >= m))
      const t = (m - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)
      return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])]
    }
    const slice = (m0, m1) => {
      const out = [pointAt(m0)]
      for (let i = 0; i < path.length; i++) if (cum[i] > m0 && cum[i] < m1) out.push(path[i])
      out.push(pointAt(m1))
      return out
    }
    for (let i = a; i <= b; i++) {
      if (!(ids[i] in stops)) stops[ids[i]] = round(STOPS[ids[i]] === 'interp' ? pointAt(cuts[i - a]) : STOPS[ids[i]])
    }
    for (let i = a; i < b; i++) {
      const key = `${ids[i]}>${ids[i + 1]}`
      if (legs[key]) continue
      // Single-leg spans keep the exact path; multi-leg spans are cut by research distance.
      const line = b - a === 1 ? path : slice(cuts[i - a], cuts[i - a + 1])
      const m = b - a === 1 ? total : cuts[i - a + 1] - cuts[i - a]
      legs[key] = { km: Math.round(m / 100) / 10, line: simplify(line).map(round) }
    }
  }
}

const side = SIDE.map((s) => ({ ...s, ll: round(s.ll) }))
const all = [...Object.values(stops), ...side.map((s) => s.ll)]
const bounds = [
  Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])),
  Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1])),
]

writeFileSync(new URL('../src/data/geo.json', import.meta.url), JSON.stringify({ bounds, stops, legs, side }))
const pts = Object.values(legs).reduce((n, l) => n + l.line.length, 0)
console.log(`${Object.keys(stops).length} stops, ${Object.keys(legs).length} legs, ${pts} points`)
for (const [k, l] of Object.entries(legs)) console.log(`  ${k.padEnd(40)} ${l.km} km (OSM)`)
for (const w of warnings) console.warn('WARN', w)
