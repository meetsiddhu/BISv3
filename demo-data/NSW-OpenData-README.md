# NSW Open-Data Bridge & Culvert Register — loadable demo dataset

**File:** `NSW-OpenData-Bridges-Culverts.csv` — 1,506 records, in the exact 58-column
Mass Upload "Bridges" template (loads via the **Mass Upload** tile, dataset *Bridges*).

## Source & licence
- **OpenStreetMap** contributors, **ODbL** — https://www.openstreetmap.org/copyright
- Extracted via the **Overpass API** (`overpass-api.de`) over the New South Wales
  administrative area: named `bridge=*` ways + named `tunnel=culvert` / `man_made=culvert` ways.
- Each row records its provenance: `dataSource = "OpenStreetMap (open data, ODbL)"`,
  `sourceReferenceUrl = https://www.openstreetmap.org/way/<id>`, `openDataReference`, `sourceRecordId`.
- This is a **sample of ~23,900 named NSW bridge/culvert assets in OSM** (capped for a loadable
  demo). OSM is community data — partial coverage, **not** the authoritative TfNSW asset register
  (which is not published as open asset-level data; only derived sets like bridge vertical
  clearances appear on data.nsw.gov.au).

## What's in it
| | |
|---|---|
| Records | 1,506 (after de-dup) |
| Asset classes | 1,007 Road Bridge · 391 Culvert · 57 Rail Bridge · 32 Pedestrian · 19 Shared Path |
| Regions | 13 (Sydney Metro, Hunter, Illawarra, Central West, Mid North Coast, …) |
| Geometry | **every record** has latitude/longitude (centroid) + a GeoJSON `LineString` of the span |
| Derived | `totalLength` (computed from geometry), `region` (lat/long → NSW region), `numberOfLanes`, posted `loadRating` (from `maxweight`) |

## Data quality (the important part)
Open data gives **geometry + identity** (name, ref, structure type, lanes, posted limits) but
**not engineering data** (condition, inspection, capacity, owner). So:

- **Geometry is always present** → records pass the Geometry DQ rules.
- **Condition, conditionRating, lastInspectionDate are left blank** (genuinely unknown from open
  data) → records are flagged **incomplete**.
- **assetOwner, region, importanceLevel are INFERRED** (from road class + location) and tagged
  *"(inferred)" / "verify"* — never presented as confirmed.
- Every row carries an explicit `remarks` note, e.g.
  `OPEN DATA (OpenStreetMap, ODbL). DQ: INCOMPLETE - geometry & identity captured; owner/region/
  importance INFERRED (verify). Missing: condition, conditionRating, lastInspectionDate, lga, …`

The app flags these automatically: the **Data Quality** view (`/quality/api`) scores each asset on
the completeness fields and raises issues against the seeded `DataQualityRules`
(Condition / Inspection / Geometry / Ownership / Location). In testing, a 27-record load produced
issues *Inspection (all), Condition (27)* with *Geometry passing* — i.e. "we know where it is, we
don't yet know its condition."

## How to load
1. Open the **Mass Upload** tile → dataset **Bridges** → upload `NSW-OpenData-Bridges-Culverts.csv`, mode **Create**.
2. **Then** dataset **Restrictions** → upload `NSW-OpenData-HV-Restrictions.csv` (load bridges *first* so the
   restrictions link by `bridgeRef`).
3. Review the per-row results; open **Data Quality** to see incomplete assets flagged.
4. (Optional) **BHI/BSI** & **Prioritisation** stay empty for open-data assets until condition/inspection data is
   added — the correct behaviour.

## Heavy vehicle / NHVR layer
The NHVR's National Network Map / Route Planner is itself **powered by OpenStreetMap**, so posted heavy-vehicle
attributes live in OSM tags and are mapped here:

- **On the bridges** (`NSW-OpenData-Bridges-Culverts.csv`): `loadRating` (← `maxweight`/`maxweight:signed`),
  `clearanceHeight` (← `maxheight`), `freightRoute` (← `hgv=designated` **plus a spatial join**: a bridge within
  250 m of an OSM freight road is on the network — 11 added that way), `postingStatus=Restricted`. **78 assets**
  carry HV attributes.
- **Companion file** `NSW-OpenData-HV-Restrictions.csv` — **72 heavy-vehicle access restrictions** (53 load-limit,
  15 height-limit, 4 axle-group), in the Restrictions template, linking to their bridge by `bridgeRef`. Validated:
  72/72 load and link. (`restrictionCategory` = permanence = *Permanent*; `restrictionType` = *Load Limit* /
  *Height Limit* / *Axle Group Limit*.)
- **NHVR DQ gap (confirmed):** the **gazetted route approvals** (B-double / road-train / HML; `bDoubleApproved`,
  `hmlApproved`, `overMassRoute`, `pbsApprovalClass`, `gazetteReference`) are left **blank + flagged**. These are
  NOT available as open downloadable data: the DITRDCSA *National HV Network Map* catalogue page is access-
  restricted, the TfNSW RAV map is an interactive Google-overlay (no open GeoJSON/FeatureServer), and QLD's
  formerly-open HV layers have migrated into the NHVR map. The authoritative source is the **NHVR Spatial API**
  (subscription — api-portal.nhvr.gov.au) or an SHP/GPKG request to spatial@nhvr.gov.au. Wire that in and the same
  point-in-buffer join populates these flags per gazetted layer.

## Regenerate / expand
1. `scripts/` — re-fetch from Overpass (raise the `out geom <N>` caps for more records), then
2. `node scripts/build-nsw-open-dataset.js` → rewrites the CSV with mapping + DQ flags.

Asset class **Culvert** / **Major Culvert** were added (`db/data/bridge.management-AssetClasses.csv`
+ mass-upload fallback) so culverts classify, filter, and scope strategies like bridges.
