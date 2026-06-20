# Council Fixes — June 2026 (v3.34.0 → v3.38.0)

Consolidated record of the NSW bridge-management **expert-council** increment: five
recommendations from the brutal council critique
([EXPERT-REVIEW-BRIDGE-HV-2026-06.md](EXPERT-REVIEW-BRIDGE-HV-2026-06.md)), implemented,
tested, and deployed to BTP as a sequence of additive, config-driven slices.

| | |
|---|---|
| **Deployed version** | `3.38.0` (BTP `b143eeabtrial` / `dev`) |
| **Quality gate (every increment)** | 439/439 jest · eslint clean · `cds build` clean |
| **Standards referenced** | ISO 55001/55010, AS 5100.2/.6/.7, AASHTO NBE (CS1-4), NHVR/RAV |
| **Architecture rules honoured** | additive-only schema · soft-delete · ChangeLog on CUD · zero hardcoding (CLAUDE.md) |
| **Front door** | https://b143eeabtrial-dev-bridgemanagement.cfapps.us10-001.hana.ondemand.com |

---

## #1 — ISO 55001 line-of-sight (Levels of Service)  · v3.34.0

**Council gap:** no traceable line from organisational goal → asset-management objective →
measurable level of service → activity (the ISO 55001 "line of sight"); no SAMP entity.

**What shipped (additive):**
- `AssetManagementObjectives` + `AssetManagementServiceLevels` entities — organisational
  goal → AM objective → measurable service level (target vs current) → linked KPI criterion.
- Fiori Elements List Report + Object Page (draft-enabled), `AM Objectives` launchpad tile
  (flp-config consistent across all 4 locations), seeded **5 objectives + 9 service levels**.

**Why:** gives executives a defensible, audited chain from strategy to the work the
register drives — the spine an ISO-55001 SAMP needs.

**Files:** `db/schema.cds`, `srv/admin-service.cds`, `app/admin-bridges/fiori-service.cds`,
`db/data/bridge.management-AssetManagement*.csv`, launchpad config (4 files).

---

## #2 — BHI consumes CS1-4 defect extent  · v3.34.0

**Council gap:** BHI/BSI used a single inspector condition rating and ignored the AASHTO/AS
5100.7 condition-state quantities — a deck 90 % in CS4 scored the same as one 5 % in CS4.

**What shipped:** `effectiveRating()` in `srv/lib/bhi.js` derives a 1-10 element rating from
the CS1-4 distribution when a (near-)complete record exists, else falls back to the single
rating. **Proven:** same rating 5 → BSI **9.04** (mostly-good) vs **1.69** (mostly-CS4).

**Files:** `srv/lib/bhi.js`, `test/bhi.test.js`.

---

## #3 — True multi-modal rail  · v3.37.0 / v3.38.0

**Council gap:** the HV assessment was road-PBS only (B-double / road-train / HML); a road
vehicle model was silently run against rail/pedestrian structures; no rail load model; no
AS 5100.6 fatigue; rail/pedestrian BHI weights were road-derived but unlabelled.

**What shipped:**
- **Mode-aware HV assessment** — `AssessmentVehicles.applicableModes` + a mode-applicability
  gate in `srv/lib/hv-assessment.js`. A road model run against a rail (or pedestrian)
  structure is now **refused** with a clear reason instead of returning a misleading
  road-check pass. `Multi` structures accept any model; legacy/custom vehicles with no
  declared scope are not blocked. The seed backfills `applicableModes` onto the road library.
- **Rail load models** — `300LA` + a heavy-haul derivative (AS 5100.2) added to the
  assessment library, tagged `Rail`. The rating-factor gate governs; the road
  axle/bridge-formula checks are honestly *not-assessable* for them.
- **AS 5100.6 fatigue screening (advisory)** — new `srv/lib/fatigue.js` + Bridges fields
  (`fatigueScreeningStatus`, `fatigueDetailCategory`, `estimatedFatigueLifeYears`,
  `fatigueAssessmentDate`). Steel/composite structures are screened by mode demand
  (rail ≫ road), age and detail category; concrete = *Not Applicable*, unknown year =
  *Not Assessed* (no fabricated numbers). Computed on save + seed + idempotent startup
  backfill (1,250 live rows screened).
- **BHI calibration badge** — `bhiCalibrationStatus` virtual surfaces the
  *Calibrated* vs *Indicative (road-derived weights)* status from `bhi.js`'s calibrated-mode
  list, so the caveat is visible on the bridge page, not buried in the explorer.

**Honest carve-out:** this is honest *screening*, **not** a certified rail-rating engine.
Rail/pedestrian BHI weights stay badged **"Indicative (road-derived)"** until a defensible
weight set is sourced — surfacing the calibration ask is the deliverable, not faking it.

**Files:** `db/schema.cds`, `srv/lib/hv-assessment.js`, `srv/lib/fatigue.js`,
`srv/lib/assessment-vehicle-seed.js`, `srv/handlers/bridges.js`, `srv/admin-service.{cds,js}`,
`app/admin-bridges/fiori-service.cds`, `srv/demo-seed.js`,
`test/hv-assessment.test.js`, `test/fatigue.test.js`.

---

## #4 — Advisory / provenance badging  · v3.35.0

**Council gap:** load ratings read as certified; open-data records read as surveyed; the
data-quality tier was only narrated in free-text `remarks`.

**What shipped:**
- `loadRatingBasis` (default `Screening`) + `dataCompleteness`/`dataCompletenessScore`
  (first-class, queryable, filterable). Weighted completeness scorer in
  `srv/lib/data-quality.js`.
- SAP-standard **Criticality badges** (after-READ virtuals, draft-safe): a screening load
  rating shows orange-caution, a certified one green; an open-data stub shows red/orange. In
  the List Report column, filter bar, and a Provenance & Data Quality field group.
- Idempotent startup backfill scored all 1,250 deployed rows; the 12 curated bridges were
  enriched to register-`Complete` so the demo shows the full green/orange/red range.

**Files:** `srv/lib/data-quality.js`, `db/schema.cds`, `srv/admin-service.{cds,js}`,
`app/admin-bridges/fiori-service.cds`, `srv/demo-seed.js`, `test/data-quality.test.js`.

---

## #5 — Allowed-value enforcement + lookup `isActive` consistency  · v3.34.0 / v3.37.0

**Council gap:** allowed values were enforced only for Select data types (off-list "Plastic"
was accepted on a Text attribute); concern that disabling a value didn't actually block it.

**What shipped:**
- **Part 1 (v3.34.0):** `srv/attributes-api.js` enforces allowed values for **any** data
  type. Since the active config returns only `status='Active'` values, off-list **and**
  disabled values are rejected (422). Verified: Concrete 200 · Plastic **422** · disabled
  Timber **422**.
- **Part 2 (v3.37.0):** value-help + mass-edit lookups already filter `isActive` (verified);
  the canonical restriction-codelist merge (`restriction-codelists.js`) now **honours each
  row's own `isActive`** instead of force-activating — consistent with the value-help, and
  deactivated DB rows are never resurrected.

**Files:** `srv/attributes-api.js`, `srv/lib/restriction-codelists.js`.

---

## Demo reseed (v3.38.0, 2026-06-20)

`BMS_SEED_DEMO_RESET=true` now overrides the `BR-1001` demo marker (it was previously
unreachable once seeded). With explicit user authorisation, the live register was reset and
reloaded to the enriched set: **12 curated bridges (register-`Complete`/green) + 1,238 NSW
open-data + 72 HV restrictions**, then the flag was unset so no future restart re-wipes.

> A deployed reseed is a **destructive register wipe** — it requires explicit, specific
> authorisation and is blocked by the auto-mode safety classifier otherwise.

---

## Version trail

| Version | Increment |
|---|---|
| `3.34.0` | #1 line-of-sight · #2 BHI CS1-4 · #5 allowed-value enforcement |
| `3.35.0` | #4 advisory/provenance badging |
| `3.36.0` | demo-seed: make `BMS_SEED_DEMO_RESET` reachable once seeded |
| `3.37.0` | #3 multi-modal rail · #5p2 lookup `isActive` |
| `3.38.0` | fatigue startup backfill · live demo reseed |

## Still roadmapped (not a code gap)

Sourcing **calibrated rail/pedestrian BHI weights** is a data/standards exercise (published
rail-bridge-health weightings); the system already accepts them via the `bhiWeights`
SystemConfig the moment they're available, and badges the current set as indicative until then.
