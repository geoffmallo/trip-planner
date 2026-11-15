// Route data. Stage totals are anchored to Parks & Wildlife Service Tasmania walk notes;
// per-leg splits, ascent/descent and many elevations are derived estimates (conf: 'low').
// Expect GPS distance/ascent to read 10–20% higher. Tap a leg in the app to correct it.
//
// Sources: parks.tas.gov.au walk notes (Western Arthur Range, Mt Anne Circuit),
// trailhiking.com.au planning guides, halfwayanywhere.com, bushwalk.com forum,
// bushwalktracknotes.blogspot.com, adelaidebushwalkers.org.
import type { Leg, RouteDef, Waypoint } from '../model'

type W = Waypoint
type L = Leg

// ---------- Western Arthurs: shared west/central section ----------
const waStart: W[] = [
  { id: 'scotts-peak', name: 'Scotts Peak Dam', elev: 320, camp: true, water: 'Untreated tank/creek at Huon Campground; toilets', note: 'Trailhead / Huon Campground. Register with PWS (daily cap applies).' },
  { id: 'junction-creek', name: 'Junction Creek', elev: 260, camp: true, water: 'Creek, reliable', note: 'Pit toilet, sheltered forest. Floods in heavy rain — drier sites south of the creek.' },
  { id: 'moraine-a-foot', name: 'Foot of Moraine A', elev: 300, camp: true, water: 'Reliable stream at the base', note: 'Informal: a few tent spaces, no toilet. Port Davey Track turns off just before.' },
  { id: 'moraine-a-top', name: 'Top of Moraine A (Hesperus jn)', elev: 1050, water: 'None reliable', note: '~800 m climb in ~3 km. Exposed crest. Tiny emergency site behind rocks.' },
  { id: 'capella-crags', name: 'Capella Crags', elev: 1000, water: 'Small moorland pools only', note: 'Boulder hopping and scrambling, then steep descent to Lake Cygnus.' },
  { id: 'lake-cygnus', name: 'Lake Cygnus', elev: 877, camp: true, water: 'Lake and streams; filter', note: 'Platforms + hardened ground (~10 tents), toilet. Detour below the route — climb back next day.' },
  { id: 'mt-hayes', name: 'Mt Hayes', elev: 1060, water: 'None', note: 'Exposed crest. Summit 1119 m.' },
  { id: 'procyon-peak', name: 'Procyon Peak', elev: 1050, water: 'None', note: 'Rocky gullies, steep climbs and descents. Route skirts the 1136 m summit.' },
  { id: 'square-lake', name: 'Square Lake', elev: 900, camp: true, water: 'Lake', note: 'Informal sites at/above the lake (not a PWS platform site).' },
  { id: 'orion-saddle', name: 'Mt Orion saddle', elev: 1000, water: 'None', note: 'Lake Oberon junction. Steep rough scree to the lake. Epsilon Moraine = emergency bail-out.' },
  { id: 'lake-oberon', name: 'Lake Oberon', elev: 862, camp: true, water: 'Lake; filter', note: '4 platforms + sandy area, toilet. Crowded in season. PWS: turn back here if it has been too hard.' },
  { id: 'mt-pegasus', name: 'Mt Pegasus', elev: 1040, water: 'None', note: 'Main crux: rock step, likely pack hauling, squeeze through a hole. Fair weather only; queues — start early.' },
  { id: 'mt-capricorn', name: 'Mt Capricorn', elev: 1037, water: 'None reliable', note: 'Steep bare slabs, tricky navigation. Bivvy cave on descent (fits ~3).' },
  { id: 'high-moor', name: 'High Moor', elev: 950, camp: true, water: 'Small stream, often nearly dry — carry from Oberon', note: '2 platforms (~9 tents), pit toilet. Very exposed to fronts.' },
  { id: 'beggary-bumps', name: 'Beggary Bumps', elev: 1006, water: 'None — carry 4–5 h worth', note: 'With Tilted Chasm, the hardest section (PWS). Passes above Lake Ganymede.' },
  { id: 'mt-taurus', name: 'Mt Taurus shoulder', elev: 980, water: 'None', note: 'After Tilted Chasm (steep loose descent, possible pack haul) and The Dragon. Fine-weather saddle sites ~15–20 min before Haven.' },
  { id: 'haven-lake', name: 'Haven Lake', elev: 880, camp: true, water: 'Lake / outlet; filter', note: '4 small platforms, toilet. Sheltered.' },
  { id: 'lake-sirona', name: 'Lake Sirona', elev: 900, camp: true, water: 'Lake', note: 'Informal sites, fully exposed to the west. Steep eroded descent with short scramble.' },
  { id: 'mt-scorpio', name: 'Mt Scorpio', elev: 1090, water: 'None', note: 'Easy moorland. Last reliable mobile coverage.' },
  { id: 'kappa-moraine-top', name: 'Top of Kappa Moraine', elev: 1000, water: 'None', note: 'Branch: NE down Kappa (A–K) or S to Lake Vesta (full traverse).' },
]

const waStartLegs: L[] = [
  { km: 8.4, up: 150, down: 210, hrs: 3.5, conf: 'high', note: 'PWS 8.4 km, 3–4 h. Gentle hills, mud, creek crossings.' },
  { km: 2.5, up: 60, down: 20, hrs: 0.75, conf: 'low', note: 'Muddy, braided. Keep straight at the Port Davey Track sign.' },
  { km: 2.5, up: 760, down: 10, hrs: 2.5, conf: 'med', note: 'Steep, eroded climb up Moraine A.' },
  { km: 1.3, up: 80, down: 130, hrs: 1, conf: 'low', note: 'Exposed moor past Mt Hesperus.' },
  { km: 1.2, up: 30, down: 150, hrs: 1, conf: 'low', note: 'Junction Ck → Cygnus stage: PWS 7.3 km, 4–6 h.' },
  { km: 1.0, up: 200, down: 15, hrs: 1, conf: 'low', note: 'Climb back to the junction, then up Mt Hayes.' },
  { km: 0.8, up: 60, down: 70, hrs: 0.75, conf: 'low' },
  { km: 0.9, up: 20, down: 170, hrs: 0.75, conf: 'low' },
  { km: 0.8, up: 110, down: 10, hrs: 0.75, conf: 'low' },
  { km: 0.7, up: 0, down: 140, hrs: 0.75, conf: 'low', note: 'Cygnus → Oberon stage: PWS 4.2 km, 2.5–4 h (others say 5–6 h).' },
  { km: 1.0, up: 200, down: 20, hrs: 1.75, conf: 'low', note: 'Pack hauling likely.' },
  { km: 1.3, up: 160, down: 165, hrs: 1.75, conf: 'low' },
  { km: 2.0, up: 120, down: 207, hrs: 2, conf: 'low', note: 'Oberon → High Moor stage: PWS 4.3 km, 5–7 h. Little water.' },
  { km: 1.2, up: 110, down: 54, hrs: 1.5, conf: 'low' },
  { km: 1.6, up: 180, down: 206, hrs: 2.25, conf: 'low', note: 'Tilted Chasm and The Dragon.' },
  { km: 1.0, up: 20, down: 120, hrs: 0.75, conf: 'low', note: 'High Moor → Haven stage: PWS 3.8 km, 4–6 h.' },
  { km: 1.2, up: 100, down: 80, hrs: 0.6, conf: 'med' },
  { km: 1.0, up: 190, down: 0, hrs: 0.75, conf: 'low' },
  { km: 1.2, up: 20, down: 110, hrs: 0.5, conf: 'med' },
]

// ---------- Walk-out across the Arthur Plains (shared) ----------
const plains: W[] = [
  { id: 'seven-mile-creek', name: 'Seven Mile Creek', elev: 330, camp: true, water: 'Creek', note: 'Foot of Kappa, on McKays Track. Sheltered sites for 4–5 tents, no toilet.' },
  { id: 'wullyawa-creek', name: 'Wullyawa Creek', elev: 300, camp: true, water: 'Creek', note: 'Informal, 2–3 sites. Creeks hard to cross after heavy rain.' },
  { id: 'two-mile-creek', name: 'Two Mile Creek', elev: 290, camp: true, water: 'Creek', note: 'Informal, plenty of camping.' },
  { id: 'junction-creek-r', name: 'Junction Creek', elev: 260, camp: true, water: 'Creek, reliable', note: 'Pit toilet.' },
  { id: 'scotts-peak-r', name: 'Scotts Peak Dam', elev: 320, note: 'Finish. Sign out with PWS.' },
]
const plainsLegs: L[] = [
  // seven-mile -> wullyawa, wullyawa -> two-mile, two-mile -> junction, junction -> scotts
  { km: 5.0, up: 60, down: 90, hrs: 2, conf: 'low', note: 'McKays Track west across the plains: mud, buttongrass, creek crossings.' },
  { km: 2.25, up: 30, down: 40, hrs: 0.75, conf: 'low' },
  { km: 2.25, up: 30, down: 60, hrs: 0.75, conf: 'low', note: 'Haven → Junction Ck stage: PWS 18.5 km, 7–10 h.' },
  { km: 8.4, up: 210, down: 150, hrs: 3.5, conf: 'high', note: 'PWS 8.4 km, 3–4 h.' },
]

// ---------- A–K: Kappa Moraine descent ----------
const kappaLeg: L = { km: 5.5, up: 30, down: 700, hrs: 2.5, conf: 'low', note: 'Long descent of Kappa Moraine to the Arthur Plains. (Unmarked shortcut to Junction Ck saves ~4 km.)' }

// ---------- Full traverse: eastern continuation ----------
const east: W[] = [
  { id: 'lake-vesta', name: 'Lake Vesta', elev: 860, camp: true, water: 'Lake', note: 'Emergency-use sites on NE side. Steep gully descent from the Kappa junction.' },
  { id: 'lake-juno', name: 'Lake Juno', elev: 760, water: 'Lake', note: 'Steep descent from Vesta.' },
  { id: 'promontory-lake', name: 'Promontory Lake', elev: 860, camp: true, water: 'Lake; filter', note: 'Designated site at SE corner; poorly sheltered.' },
  { id: 'the-phoenix', name: 'The Phoenix', elev: 1091, water: 'None', note: 'Faint pad past The Sculpture; boulder-strewn summit.' },
  { id: 'west-portal-jn', name: 'West Portal ridge (pack drop)', elev: 1100, water: 'None', note: 'After ~3 km of Centaurus Ridge, overgrown in parts. Leave packs for West Portal summit.' },
  { id: 'crags-of-andromeda', name: 'Crags of Andromeda', elev: 1080, water: 'None', note: 'Exposed crest by high cliffs.' },
  { id: 'lake-rosanne', name: 'Lake Rosanne', elev: 633, camp: true, water: 'Lake', note: 'Sheltered sites behind the sandy beach. Descent contours through thick scrub.' },
  { id: 'strike-creek-jn', name: 'Strike Creek junction', elev: 230, water: 'Strike Creek', note: 'Junction with Eastern Arthurs track. Vague until boardwalks; boot-wash point.' },
  { id: 'cracroft-jn', name: 'Cracroft junction (McKays/Huon)', elev: 320, camp: true, water: 'Cracroft River nearby', note: 'Dry flat sites at forest edge.' },
]
const eastLegs: L[] = [
  { km: 0.8, up: 10, down: 150, hrs: 1, conf: 'low' },
  { km: 0.5, up: 0, down: 100, hrs: 0.75, conf: 'low' },
  { km: 0.9, up: 110, down: 10, hrs: 1, conf: 'low', note: 'Haven → Promontory stage: ~5 km, 5 h (trailhiking).' },
  { km: 1.5, up: 240, down: 10, hrs: 1.5, conf: 'low' },
  { km: 4.0, up: 220, down: 210, hrs: 3, conf: 'low', note: 'Centaurus Ridge.' },
  { km: 1.5, up: 60, down: 80, hrs: 1, conf: 'low' },
  { km: 3.0, up: 20, down: 467, hrs: 2.5, conf: 'low', note: 'Promontory → Rosanne stage: ~11 km, 9 h incl. West Portal (trailhiking).' },
  { km: 3.5, up: 30, down: 433, hrs: 1.75, conf: 'low', note: '~400 m descent of moraine onto Strike Creek Plains. Lucifer Ridge is NOT the exit (PWS discourages it).' },
  { km: 3.5, up: 140, down: 50, hrs: 1.5, conf: 'low', note: 'Wet buttongrass then ~2 km on Razorback Ridge.' },
  { km: 7.0, up: 150, down: 140, hrs: 2.75, conf: 'low', note: 'McKays Track round Razorback, then NW across the plains. Rosanne → Seven Mile: ~14 km, 6 h.' },
]

export const waAk: RouteDef = {
  id: 'wa-ak',
  name: 'Western Arthurs A–K',
  short: 'WA A–K',
  group: 'wa',
  color: '#2f7a55',
  description:
    'Moraine A to Kappa Moraine, out across the Arthur Plains. PWS Grade 5, ~55 km, 5–7 days + weather days. Carry ~15–20 m rope; PLB recommended.',
  stops: [...waStart, ...plains],
  legs: [...waStartLegs, kappaLeg, ...plainsLegs],
  standardCamps: ['junction-creek', 'lake-cygnus', 'lake-oberon', 'high-moor', 'haven-lake', 'junction-creek-r'],
  sideTrips: [
    { at: 'moraine-a-top', name: 'Mt Hesperus (1098 m)', km: 1.0, hrs: 0.75, up: 50 },
    { at: 'mt-hayes', name: 'Mt Hayes summit (1119 m)', km: 0.6, hrs: 0.67, up: 60 },
    { at: 'orion-saddle', name: 'Mt Orion / Mt Sirius (1151 m)', km: 0.6, hrs: 0.75, up: 150 },
    { at: 'high-moor', name: 'Mt Columba (1042 m)', km: 0.5, hrs: 0.25, up: 90 },
    { at: 'high-moor', name: 'Dorado Peak (1068 m)', km: 1.2, hrs: 2, up: 120 },
    { at: 'haven-lake', name: 'Mt Aldebaran (1107 m)', km: 2.2, hrs: 2, up: 230 },
    { at: 'mt-scorpio', name: 'Mt Scorpio summit (1106 m)', km: 0.1, hrs: 0.17, up: 16 },
  ],
}

export const waFull: RouteDef = {
  id: 'wa-full',
  name: 'Western Arthurs Full Traverse',
  short: 'WA Full',
  group: 'wa',
  color: '#1f5d8a',
  description:
    'A–K then on past Lake Vesta, Promontory Lake, West Portal and Lake Rosanne, out via Strike Creek and McKays Track. ~76–79 km; operators say 9–10 days, Chapman 10–12.',
  stops: [...waStart, ...east, ...plains],
  legs: [...waStartLegs, ...eastLegs, ...plainsLegs],
  standardCamps: [
    'junction-creek',
    'lake-cygnus',
    'lake-oberon',
    'high-moor',
    'haven-lake',
    'promontory-lake',
    'lake-rosanne',
    'seven-mile-creek',
  ],
  sideTrips: [
    ...(waAk.sideTrips ?? []),
    { at: 'west-portal-jn', name: 'West Portal summit (~1185 m)', km: 0.8, hrs: 0.75, up: 90 },
  ],
}

export const mtAnne: RouteDef = {
  id: 'mt-anne',
  name: 'Mt Anne Circuit',
  short: 'Mt Anne',
  color: '#9a5a1f',
  description:
    'Condominium Creek → High Camp → Shelf Camp → The Notch → Lonely Tarns → Red Tape Creek, then 8.2 km road walk (or car shuffle). Grade 5; Shelf & Lonely Tarns capped ~12/day.',
  stops: [
    { id: 'condominium-creek', name: 'Condominium Creek car park', elev: 330, water: 'Creek near car park', note: 'Register with PWS. Clean boots (phytophthora).' },
    { id: 'high-camp-hut', name: 'High Camp Hut', elev: 1040, camp: true, water: 'Rainwater tank — stock up, little until Lonely Tarns', note: 'Emergency hut (5–6 in loft), toilet, tent sites 150 m west.' },
    { id: 'mt-eliza', name: 'Mt Eliza', elev: 1289, water: 'Seasonal tarns beyond', note: 'Steep boulder scramble; exposed.' },
    { id: 'mt-anne-jn', name: 'Mt Anne summit junction', elev: 1250, water: 'Seasonal tarns', note: 'Near Eve Peak. Boulder fields and cairns; navigation needed.' },
    { id: 'shelf-camp', name: 'Shelf Camp', elev: 1170, camp: true, water: 'Tarns', note: 'Rock slab, extremely exposed to NE. Freestanding tent anchored with rocks. Toilet pod.' },
    { id: 'the-notch', name: 'The Notch', elev: 1150, water: 'None', note: 'Pack hauling likely; carry ~15 m rope. Site of many rescues.' },
    { id: 'mt-lot', name: 'Mt Lot', elev: 1200, water: 'None', note: 'Rough rock traverse, then Lightning Ridge.' },
    { id: 'lonely-tarns', name: 'Lonely Tarns', elev: 900, camp: true, water: 'Tarn beside camp', note: 'Past Lake Picone. Platforms with chains, toilet pod.' },
    { id: 'sarah-jane-jn', name: 'Mt Sarah Jane junction', elev: 950, water: 'Seasonal', note: 'Muddy plateau. Optional Mt Sarah Jane ascent.' },
    { id: 'anne-river-jn', name: 'Anne River / Lake Judd jn', elev: 380, water: 'Anne River', note: 'Steep, overgrown, slippery ~600 m descent. Lake Judd side camp 30–45 min away.' },
    { id: 'red-tape-creek', name: 'Red Tape Creek trailhead', elev: 330, water: 'Creek', note: 'Car shuffle point.' },
    { id: 'condominium-creek-r', name: 'Condominium Creek (road walk)', elev: 330, note: 'Set the last leg to 0 if you car-shuffle.' },
  ],
  legs: [
    { km: 3.6, up: 750, down: 40, hrs: 2.5, conf: 'high', note: 'PWS 3.6 km, 2–3 h, steep climb.' },
    { km: 1.0, up: 250, down: 0, hrs: 1, conf: 'med' },
    { km: 1.3, up: 60, down: 100, hrs: 1, conf: 'low' },
    { km: 0.8, up: 20, down: 100, hrs: 0.75, conf: 'low', note: 'High Camp → Shelf stage: PWS 3.1 km, 2–3 h.' },
    { km: 1.0, up: 40, down: 60, hrs: 1.5, conf: 'low' },
    { km: 0.8, up: 120, down: 70, hrs: 1.5, conf: 'low' },
    { km: 1.5, up: 30, down: 330, hrs: 2, conf: 'low', note: 'Shelf → Lonely Tarns stage: PWS 3 km, 4.5–6.5 h.' },
    { km: 2.0, up: 100, down: 50, hrs: 1, conf: 'low' },
    { km: 5.0, up: 20, down: 590, hrs: 2.25, conf: 'low' },
    { km: 5.0, up: 40, down: 90, hrs: 1.75, conf: 'low', note: 'Lonely Tarns → Red Tape Ck stage: PWS 12 km, 4.5–7 h.' },
    { km: 8.2, up: 60, down: 60, hrs: 2, conf: 'med', note: 'Road walk, or car shuffle / hitch.' },
  ],
  standardCamps: ['high-camp-hut', 'shelf-camp', 'lonely-tarns'],
  sideTrips: [
    { at: 'mt-anne-jn', name: 'Mt Anne summit (1423 m)', km: 2, hrs: 2, up: 180, note: 'Extremely exposed scramble. Not in poor weather.' },
    { at: 'anne-river-jn', name: 'Lake Judd', km: 2.2, hrs: 1.5, up: 170 },
  ],
}

export const ROUTES: Record<string, RouteDef> = { 'wa-ak': waAk, 'wa-full': waFull, 'mt-anne': mtAnne }

// sanity: legs must be stops - 1
for (const r of Object.values(ROUTES)) {
  if (r.legs.length !== r.stops.length - 1) console.error(`Route ${r.id}: ${r.stops.length} stops but ${r.legs.length} legs`)
}
