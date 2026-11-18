// The UTM grid the map draws, and the numbers that make it readable.
// Ported from malloMapWeb src/lib/geo/utm-grid.ts so both apps draw the same grid.

import type { Feature, FeatureCollection } from 'geojson'
import {
  latLonToUtm,
  utmToLatLon,
  getUtmZone,
  getZoneCentralMeridian,
} from "./utm";

export interface GridBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const UTM_GRID_SOURCE_ID = "utm-grid-src";

/**
 * Every layer the on-screen grid owns, topmost first. The export renderer
 * drops them and draws the grid itself, at a size read off the finished image.
 */
export const UTM_GRID_LAYER_IDS = [
  "utm-grid-labels",
  "utm-grid-major",
  "utm-grid-major-halo",
  "utm-grid-lines",
  "utm-grid-lines-halo",
] as const;

/**
 * Spacings we draw, metres, finest first. Decimal steps only: a grid reference
 * is read off the km figures, so anything that isn't a power of ten between
 * 1 km and 100 km would make the numbers lie.
 */
const SPACINGS = [1_000, 10_000, 100_000] as const;

/**
 * How small a grid square may get before the next spacing up takes over.
 * Below this a square is too tight to interpolate a reference inside by eye,
 * and the lines start reading as hatching rather than a grid.
 */
const MIN_CELL_PX = 40;

/** Above this a square has room for a number against every line. */
const ROOM_FOR_EVERY_LINE_PX = 64;

/** Samples along each line. Also the granularity of the margin labels. */
const POINTS_PER_LINE = 48;

/** Every tenth line is drawn heavier — 10 km on a 1 km grid, and so on. */
const MAJOR_EVERY = 10;

/** How far in from the edge the margin numbers sit, as a fraction of the view. */
const LABEL_INSET = 0.05;

/** Refuse to draw a zone block that would need more lines than this per axis. */
const MAX_LINES_PER_AXIS = 240;

const DEG2RAD = Math.PI / 180;

export interface GridPlan {
  /** Metres between lines. */
  spacing: number;
  /** Number every nth line — 1 for all of them, 2 when they are close. */
  labelEvery: number;
}

/**
 * What grid to draw over `bounds` on a surface this size, or null when even a
 * 100 km grid would be too dense to be worth drawing — the signal to draw
 * nothing at all.
 *
 * Spacing follows how big a square would actually land rather than the zoom,
 * so the same decision serves the screen and a print of any size: pass `scale`
 * to say how much bigger than a screen the surface is, and an export keeps the
 * proportions of the map it came from.
 */
export function planUtmGrid(
  bounds: GridBounds,
  widthPx: number,
  heightPx: number,
  scale = 1,
): GridPlan | null {
  if (!(widthPx > 0) || !(heightPx > 0) || !(scale > 0)) return null;
  const midLat = (bounds.south + bounds.north) / 2;
  const mppX =
    ((bounds.east - bounds.west) * 111_320 * Math.cos(midLat * DEG2RAD)) / widthPx;
  const mppY = ((bounds.north - bounds.south) * 110_574) / heightPx;
  const mpp = Math.max(mppX, mppY);
  if (!(mpp > 0)) return null;

  for (const spacing of SPACINGS) {
    const cellPx = spacing / mpp;
    if (cellPx < MIN_CELL_PX * scale) continue;
    // Every line carries its number where there is room; where the squares are
    // tight, every second one does, which still leaves a reference one line
    // away at worst.
    return { spacing, labelEvery: cellPx >= ROOM_FOR_EVERY_LINE_PX * scale ? 1 : 2 };
  }
  return null;
}

/**
 * The number a topo sheet prints against a grid line: two large principal
 * figures — the tens and units of a kilometre — behind a smaller prefix that
 * says which 100 km square they belong to. `334000E` reads as a small 3 and a
 * large 34, so a reference taken off the map is the principal figures alone.
 *
 * At 100 km spacing the principal figures would be `00` on every line, so the
 * whole kilometre value is the number instead.
 */
function gridLabel(
  value: number,
  spacing: number,
): { prefix: string; principal: string } {
  const km = Math.round(value / 1000);
  if (spacing >= 100_000) return { prefix: "", principal: String(km) };
  return {
    prefix: String(Math.floor(km / 100)),
    principal: String(km % 100).padStart(2, "0"),
  };
}

function insetBounds(bounds: GridBounds, fraction: number): GridBounds {
  const dx = (bounds.east - bounds.west) * fraction;
  const dy = (bounds.north - bounds.south) * fraction;
  return {
    west: bounds.west + dx,
    east: bounds.east - dx,
    south: bounds.south + dy,
    north: bounds.north - dy,
  };
}

/**
 * Grid lines and their numbers over `bounds`, as GeoJSON.
 *
 * Lines carry `t: "major" | "minor"`; numbers carry `t: "label"` with the two
 * halves of the figure in `pre` and `num`. A numbered line gets one at each
 * end, sitting just inside the edge the way a topo sheet numbers its margin —
 * so wherever the map is panned, the two figures needed for a reference are
 * both on screen without hunting for the line's origin.
 */
export function buildUtmGrid(
  bounds: GridBounds,
  plan: GridPlan,
): FeatureCollection {
  const { spacing, labelEvery } = plan;
  const features: Feature[] = [];

  const south = Math.max(bounds.south, -80);
  const north = Math.min(bounds.north, 84);
  if (south >= north) return { type: "FeatureCollection", features };

  const labelBox = insetBounds({ ...bounds, south, north }, LABEL_INSET);

  const westZone = getUtmZone(Math.max(bounds.west, -180));
  const eastZone = getUtmZone(Math.min(bounds.east, 180));

  for (let zone = westZone; zone <= eastZone; zone++) {
    const cm = getZoneCentralMeridian(zone);
    const zoneWest = cm - 3;
    const zoneEast = cm + 3;

    const visWest = Math.max(bounds.west, zoneWest);
    const visEast = Math.min(bounds.east, zoneEast);
    if (visWest >= visEast) continue;

    const hemispheres: boolean[] = [];
    if (north > 0) hemispheres.push(true);
    if (south < 0) hemispheres.push(false);

    for (const northern of hemispheres) {
      const hSouth = northern ? Math.max(south, 0.001) : south;
      const hNorth = northern ? north : Math.min(north, -0.001);
      if (hSouth >= hNorth) continue;

      const corners = [
        latLonToUtm(hSouth, visWest),
        latLonToUtm(hSouth, visEast),
        latLonToUtm(hNorth, visWest),
        latLonToUtm(hNorth, visEast),
      ];

      const minE = Math.min(...corners.map((c) => c.easting));
      const maxE = Math.max(...corners.map((c) => c.easting));
      const minN = Math.min(...corners.map((c) => c.northing));
      const maxN = Math.max(...corners.map((c) => c.northing));

      if (
        (maxE - minE) / spacing > MAX_LINES_PER_AXIS ||
        (maxN - minN) / spacing > MAX_LINES_PER_AXIS
      ) {
        continue;
      }

      const startE = Math.floor(minE / spacing) * spacing;
      const endE = Math.ceil(maxE / spacing) * spacing;
      const startN = Math.floor(minN / spacing) * spacing;
      const endN = Math.ceil(maxN / spacing) * spacing;

      // Vertical lines — constant easting.
      for (let e = startE; e <= endE; e += spacing) {
        if (e < 100_000 || e > 900_000) continue;
        const coords: [number, number][] = [];
        for (let i = 0; i <= POINTS_PER_LINE; i++) {
          const n = minN + ((maxN - minN) * i) / POINTS_PER_LINE;
          const [lat, lon] = utmToLatLon(e, n, zone, northern);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (lon >= zoneWest - 0.1 && lon <= zoneEast + 0.1) coords.push([lon, lat]);
        }
        pushLine(features, coords, e, spacing, labelEvery, "e", labelBox);
      }

      // Horizontal lines — constant northing.
      for (let n = startN; n <= endN; n += spacing) {
        const coords: [number, number][] = [];
        for (let i = 0; i <= POINTS_PER_LINE; i++) {
          const e = minE + ((maxE - minE) * i) / POINTS_PER_LINE;
          if (e < 100_000 || e > 900_000) continue;
          const [lat, lon] = utmToLatLon(e, n, zone, northern);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (lon >= zoneWest - 0.1 && lon <= zoneEast + 0.1) coords.push([lon, lat]);
        }
        pushLine(features, coords, n, spacing, labelEvery, "n", labelBox);
      }
    }
  }

  return { type: "FeatureCollection", features };
}

function pushLine(
  features: Feature[],
  coords: [number, number][],
  value: number,
  spacing: number,
  labelEvery: number,
  axis: "e" | "n",
  labelBox: GridBounds,
) {
  if (coords.length < 2) return;

  features.push({
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: { t: (value / spacing) % MAJOR_EVERY === 0 ? "major" : "minor" },
  });

  if ((value / spacing) % labelEvery !== 0) return;

  // The margin numbers: the first and last sample that falls inside the inset
  // box, which is where the line enters and leaves the visible map.
  const inside = coords.filter(
    ([lon, lat]) =>
      lon >= labelBox.west &&
      lon <= labelBox.east &&
      lat >= labelBox.south &&
      lat <= labelBox.north,
  );
  if (inside.length === 0) return;

  const { prefix, principal } = gridLabel(value, spacing);
  const ends =
    inside.length > 1 ? [inside[0], inside[inside.length - 1]] : [inside[0]];
  for (const at of ends) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: at },
      properties: { t: "label", pre: prefix, num: principal, axis },
    });
  }
}
