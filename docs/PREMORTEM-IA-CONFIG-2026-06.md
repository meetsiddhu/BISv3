# Pre-Mortem — Launchpad IA Reorg + Config-into-BMS-Admin + Mass-Upload (2026-06)

Expert-council pre-mortem run **before** implementation (6 lenses + synthesis). It found
**8 P0 / several P1** issues — three of which invalidated the naive plan. This document
records the findings and **how each was remediated** in the delivered change.

## Verdict (as found)
The naive plan was **not safe to deploy**: it rested on three wrong assumptions —
(1) editing Risk Bands would change scoring (it would not — thresholds were hardcoded),
(2) `srv/launchpad.js` drives prod tiles (it does not — a static committed JSON does),
(3) the three config entities behave alike for non-draft CRUD (Asset Class Strategy was
draft-enabled). All three were corrected before shipping.

## MUST-FIX — status

| # | Finding (P0 unless noted) | Resolution |
|---|---|---|
| 1 | **RiskBand table never drove scoring** — `risk.js` hardcoded the bands (rule-4 violation). | `deriveRisk(b, weights, bands)` now takes the ladder from `bandsFromConfig(RiskBand rows)`; seeded values are identical to the old constants (**zero behaviour change now**); invalid/empty config safely falls back to the default ladder. Unit-tested (`risk.test.js`). |
| 2 | **Weight/band edits left scores stale** (per-process cache + stored scores; recompute only on `recalcRisk`). | `getRiskBands()`+`getRiskWeights()` caches now invalidated and the **fleet auto-rescored** on any CUD of RiskConfig/RiskBand/AssetClassStrategy (`this.after(...)`), and after a mass-upload of those datasets. "N bridges rescored" surfaced to the user. |
| 3 | **mass-upload wrote admin-config under `manage` scope** (raw DB writes bypass `@restrict`) — privilege escalation. | Datasets marked `requiredScope:'admin'`; `assertDatasetScope()` enforced at the single import dispatch chokepoint; route computes `isAdmin` and threads it. Integration test asserts a non-admin gets rejected. |
| 4 | **AssetClassStrategy was draft-enabled** → non-draft bms-admin fetch CRUD would 400/404/409. | Draft removed from AssetClassStrategy; its standalone admin-bridges FE routes/targets/inbounds removed (value-help annotation retained). Now edited non-draft in BMS Admin. |
| 5 | **Hard DELETE would orphan bridges / break soft-delete-only.** | bms-admin + mass-upload never hard-delete (soft-delete via `active=false`); service `before('DELETE')` rejects hard deletes on all three config entities; `before('UPDATE')` blocks deactivating an AssetClassStrategy still assigned to a bridge. |
| 6 | **NetworkPortfolioReport ALP would re-aggregate already-aggregated columns** (avg-of-avg). | Rendered as a **flat ListReport** of the pre-aggregated rows (no `$apply`); annotations authored from scratch. |
| 7 | **Composite key had nullable segments** → null OData key breaks FE. | View rewritten: `COALESCE` network/mode to 'Unassigned' + a single synthetic non-null key (`network \| mode`). |
| 8 | **`srv/launchpad.js` is dead in prod** — tiles come from a static JSON; editing launchpad.js "ships to nobody". | IA reorg applied to the served `app/router/appconfig/fioriSandboxConfig.json` (and `app/appconfig/...`); launchpad.js kept consistent for the dev path. |
| 9 | **Two JSON copies must stay byte-identical.** | Both written from one object; a regression test (`flp-config.test.js`) asserts byte-identity. |
| 10 | **Dropping NetworkRestrictions inbound breaks deep-links.** | Tile dropped; **inbound kept** (admin-bridges manifest + static JSON). |
| 11 | **Orphaned admin-bridges targets/inbounds for the 3 config entities.** | Removed together with the launchpad tiles (routes, targets, inbounds), in one change. |
| 12 | **Zero/negative/blank weight silently distorts scoring.** | `@assert.range:[0,10]` on weight; `validateRiskWeights()` enforced in the engine load, the bms-admin dialog, and the importer. |
| 13 | **AssetClassStrategy upsert key ambiguity → duplicates.** | Import matches the **natural key** (assetClass+transportMode), preserves the cuid on update, never re-keys; `getDedupeKey` branch added. Integration-tested. |
| 14 | **Importer could deactivate/re-key a referenced strategy.** | Deactivating a bridge-referenced strategy is rejected (UI, importer, and service guard). |
| 15 | **Build/deploy: stale dist, frozen bms-admin version, srv/html5 lockstep.** | bms-admin version bumped 1.0.0→1.1.0; clean build (`rm -rf app/*/dist`) + archive verification before deploy; srv+html5 shipped in one mtar. |

## Deferred (honestly stated)
- Old `RiskBands-manage` / `RiskFactors-manage` / `AssetStrategy-manage` bookmarks now 404
  (new home is the BMS Administration app). Communicate to config admins; redirect shims not added.
- i18n: bms-admin side-nav item labels remain hardcoded (consistent with the existing nav);
  the new screens' visible strings are in i18n.

_Full 40-finding council output retained in the session workflow transcript._
