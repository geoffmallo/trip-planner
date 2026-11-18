// UTM <-> lat/lon (WGS84), ported from malloMapWeb src/lib/utm.ts.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const a = 6378137.0;
const f = 1 / 298.257223563;
const e2 = 2 * f - f * f;
const ep2 = e2 / (1 - e2);
const k0 = 0.9996;

export function getUtmZone(lon: number): number {
  return Math.floor(((lon + 180) % 360) / 6) + 1;
}

export function getZoneCentralMeridian(zone: number): number {
  return (zone - 1) * 6 - 180 + 3;
}

export function latLonToUtm(lat: number, lon: number) {
  const zone = getUtmZone(lon);
  const lon0 = getZoneCentralMeridian(zone) * DEG2RAD;
  const latR = lat * DEG2RAD;
  const lonR = lon * DEG2RAD;
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const tanLat = Math.tan(latR);

  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ep2 * cosLat * cosLat;
  const A = cosLat * (lonR - lon0);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * latR -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) *
        Math.sin(2 * latR) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) *
        Math.sin(4 * latR) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * latR));

  const easting =
    k0 *
      N *
      (A +
        ((1 - T + C) * A * A * A) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A * A * A * A * A) /
          120) +
    500000;

  let northing =
    k0 *
    (M +
      N *
        tanLat *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) *
            A *
            A *
            A *
            A *
            A *
            A) /
            720));
  if (lat < 0) northing += 10000000;

  return { easting, northing, zone, northern: lat >= 0 };
}

export function utmToLatLon(
  easting: number,
  northing: number,
  zone: number,
  northern: boolean,
): [number, number] {
  const x = easting - 500000;
  const y = northern ? northing : northing - 10000000;
  const M = y / k0;
  const mu =
    M /
    (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) *
      Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D) /
          24 +
        ((61 +
          90 * T1 +
          298 * C1 +
          45 * T1 * T1 -
          252 * ep2 -
          3 * C1 * C1) *
          D *
          D *
          D *
          D *
          D *
          D) /
          720);

  const lon0 = getZoneCentralMeridian(zone) * DEG2RAD;
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D * D * D) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) *
        D *
        D *
        D *
        D *
        D) /
        120) /
      cosPhi1;

  return [lat * RAD2DEG, lon * RAD2DEG];
}

