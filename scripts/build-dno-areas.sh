#!/usr/bin/env bash
# Builds web/public/dno-areas.geojson: the seven network areas, the borders between them, and one label point each.
# Run by hand when NESO publishes a newer boundary file; the output is committed, so normal builds and CI never need it.
#
#   scripts/build-dno-areas.sh <neso-dno-licence-areas.geojson> <ons-countries-bgc-or-buc.geojson>
#
# Inputs (download them yourself, keep them out of git):
#  - NESO "GIS Boundaries for GB DNO Licence Areas" (GeoJSON, EPSG:27700), NESO Open Data Licence:
#      https://www.neso.energy/data-portal/gis-boundaries-gb-dno-license-areas
#  - ONS "Countries (December 2024) Boundaries UK BUC" (GeoJSON, WGS84), Open Government Licence. Only used for the
#    Northern Ireland outline, because NESO's file covers Great Britain only.
# The NESO boundaries are approximate; the page says so and so does the map.
set -euo pipefail

NESO=${1:?usage: $0 <neso.geojson> <ons-countries.geojson>}
ONS=${2:?usage: $0 <neso.geojson> <ons-countries.geojson>}
MAPSHAPER="npx --yes mapshaper@0.7.101"   # pinned: reproducible output
OUT="$(cd "$(dirname "$0")/.." && pwd)/web/public/dno-areas.geojson"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. Great Britain: reproject from British National Grid, merge the 14 licence areas into our network ids (ukpn, nged, ssen, spen, npg, enwl)
$MAPSHAPER "$NESO" -proj wgs84 from=EPSG:27700 -each 'network = DNO.toLowerCase()' -dissolve network -o "$TMP/gb.json"
# 2. Northern Ireland: the country outline, as NIE Networks' area
$MAPSHAPER "$ONS" -filter 'CTRY24NM == "Northern Ireland"' -each 'network = "nie"' -dissolve network -o "$TMP/ni.json"

# 3. Combine, simplify hard (borders only need to be right at regional zoom), and cut three layers:
#    area (polygons), border (lines only where two networks meet, so coastlines aren't drawn twice) and label (a point inside each)
$MAPSHAPER -i "$TMP/gb.json" "$TMP/ni.json" combine-files \
  -merge-layers name=area \
  -simplify visvalingam 4% keep-shapes \
  -each 'kind = "area"' \
  -innerlines + name=border \
  -each 'kind = "border"' \
  -target area -points inner + name=label \
  -each 'kind = "label"' \
  -o "$TMP/area.json" format=geojson precision=0.001 target=area \
  -o "$TMP/border.json" format=geojson precision=0.001 target=border \
  -o "$TMP/label.json" format=geojson precision=0.001 target=label

# 4. One file, keeping only the properties the map uses
python3 - "$TMP" "$OUT" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
feats = []
for kind in ('area', 'border', 'label'):
    for f in json.load(open(f'{src}/{kind}.json'))['features']:
        p = f.get('properties') or {}
        f['properties'] = {'kind': kind, **({'network': p['network']} if 'network' in p else {})}
        feats.append(f)
with open(dst, 'w') as fh:
    json.dump({'type': 'FeatureCollection', 'features': feats}, fh, separators=(',', ':'))
print(f'wrote {dst}: {len(feats)} features')
PY
ls -l "$OUT"
