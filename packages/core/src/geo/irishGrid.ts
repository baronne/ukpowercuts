import proj4 from 'proj4';

// EPSG:29903 Irish Grid (TM65) with the OSi/OSNI 7-parameter datum shift to WGS84.
const IRISH_GRID =
  '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=1.000035 +x_0=200000 +y_0=250000 +ellps=mod_airy ' +
  '+towgs84=482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15 +units=m +no_defs';

const convert = proj4(IRISH_GRID, 'WGS84');

export function irishGridToWgs84(easting: number, northing: number): { lat: number; lon: number } {
  const [lon, lat] = convert.forward([easting, northing]) as [number, number];
  return { lat, lon };
}
