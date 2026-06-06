# GIS / CRS Policy & Spatial Migration Path

> Addresses COUNCIL-REPORT finding **C-3** (GIS architect veto).
> Status: policy + config now in place; native spatial-column migration is a
> separately-gated, HANA-only DB task (kept additive so SQLite dev is unaffected).

## 1. The problem

BIS assets are Australian infrastructure. Coordinates are currently stored as
`latitude`/`longitude` decimals (`db/schema.cds:28-29`) with WGS84-style ranges,
and geometry as a `geoJson` `LargeString` (`:87`). **No datum was declared.** For
Australian assets the correct datum is **GDA2020 (EPSG:7844)**. Treating the data
as plain WGS84 can mis-register bridges against official basemaps by up to ~1.8 m
(the GDA94↔GDA2020 plate-motion shift) and more if WGS84 realisations are mixed.

## 2. Policy (now in force)

- **Canonical datum: GDA2020 (EPSG:7844).**
- The active CRS is **config-driven**, not hardcoded: SystemConfig key
  `GIS_CRS_EPSG` (default `7844`), read via `system-config.js → getCrsEpsg()`.
- Display layers (Leaflet) render in Web Mercator (EPSG:3857) for tiles; the
  *stored* and *exchanged* datum remains GDA2020. Any transform must be explicit
  and lossless-logged, never implicit.
- GeoJSON coordinate order is `[longitude, latitude]` (RFC 7946).

## 3. Spatial-column migration (additive, HANA-gated — NOT yet applied)

To get spatial-index performance and datum integrity at the DB level, add native
spatial columns **alongside** the existing decimals (additive-only rule — the
lat/long fields stay):

```cds
// PROPOSED — apply only on HANA (SQLite has no ST_GEOMETRY).
extend bridge.management.Bridges with {
  location : hana.ST_POINT(7844);   // GDA2020 point, populated from lat/long
}
```

Migration steps (gated DB change, run in a maintenance window):
1. Add the `location` column (additive; nullable).
2. Backfill: `location = ST_GeomFromText('POINT(lon lat)', 7844)` for each row.
3. Create a spatial index on `location`.
4. Switch spatial queries (`/map/api`) to use the indexed column; keep lat/long
   as the human-readable / export representation.
5. Guard with a profile check so SQLite dev continues using lat/long only.

## 4. Why not done in this release

Changing storage to `ST_GEOMETRY` is HANA-only and would break local SQLite dev
and the test suite if applied unconditionally. It is therefore staged as a
profile-guarded DB migration with its own build/deploy gate, rather than bundled
into the standalone scaffolding release. The **policy and config plumbing are in
place now**, so the migration is a contained, low-risk follow-up.

## 5. Conformance checklist (for the follow-up)

- [ ] `GIS_CRS_EPSG` seeded in SystemConfig (admin tile) = 7844
- [ ] Native `ST_POINT(7844)` column added (HANA profile only)
- [ ] Spatial index created
- [ ] Datum-transform logging on any reprojection
- [ ] Map handler reads `getCrsEpsg()` instead of assuming WGS84
- [ ] Export/exchange documents declare EPSG:7844
