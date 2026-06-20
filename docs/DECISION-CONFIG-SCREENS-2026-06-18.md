# Decision Record — Configuration screens (RiskBand / RiskConfig / AssetClassStrategy / SystemConfig)

**Date:** 2026-06-18 · **Status:** Accepted & deployed (v3.21.4) · **Decision owners:** expert council + deep-research validation
**Question:** Should the 4 calibration/config entities be made fully editable in Fiori Elements (draft-enable — "Option B"), or remain read-only FE displays with a bespoke validated editor and service-layer integrity enforcement ("Path 1")?

## Decision
**Path 1 (council-recommended).** Keep the 4 config entities **read-only in Fiori Elements**, retain the **freestyle BMS Admin tabs as the single validated editor**, and enforce **integrity at the CAP service layer** (not in UI annotations or client JS). Do **not** draft-enable them.

## Rationale (council + deep web research, cited)

1. **`@Capabilities` is enforced server-side in CAP Node — and was the source of a regression.**
   Deep research confirmed (cap.cloud.sap/docs/guides/security/authorization; providing-services) that `@readonly`/`@Capabilities` desugar to server-enforced restrictions. Our own test proved CAP Node's `check_odata_constraints` rejects writes when `@Capabilities.UpdateRestrictions.Updatable:false` is set — for **all** clients. The P1-001 read-only annotations therefore **silently broke the freestyle RiskBands/RiskFactors/AssetStrategy editors' OData saves from v3.21.2** (they write via `_svc.create/update` on the same AdminService projection). **Fix:** block **only `DeleteRestrictions.Deletable:false`** on the 3 OData-edited entities — FE shows no inline create/edit anyway (non-draft) and the only unsafe affordance was the Delete button; Update/Insert are restored so the freestyle editor works. (SystemConfig keeps full OData read-only — it is edited via the `/system/api` Express route, not OData.)

2. **Integrity must be a service contract, not a client check.** The band-ladder invariant (0–100 tiled, no gaps/overlaps, lowest band = 0) was validated **only client-side** (`bms-admin/RiskBands.controller._validateLadder`), so a direct OData write (Postman/integration/admin token) could corrupt the ladder and mis-band every bridge on the next rescore. **Fix:** ported the invariant to a server-side `after(['CREATE','UPDATE'],'RiskBand')` guard in `admin-service.js` that reads the actual post-write state and rejects (rolls back) on violation — robust to keyed, filter, and bulk writes. Per-field bounds remain on `@assert.range`; the fleet rescore `after`-hook already fires.

3. **Option B (draft-enable) was correctly rejected.** Research confirmed draft-enabling routes **all** writes through the draft choreography and rejects direct active CRUD by default (cap.cloud.sap/docs/guides/uis/fiori; the deprecated `cds.fiori.bypass_draft` / `cds.fiori.direct_crud` opt-ins). That is exactly why the prior pre-mortem (MUST-FIX 4) reverted draft — it conflicts with the freestyle editor's direct OData CRUD. Draft also cannot enforce cross-row invariants (no-overlap bands) or the save-time fleet rescore per-row.

4. **SAP clean-core pattern for the future.** If/when the freestyle editors are retired, the research-endorsed pattern is **read-only entity (`@readonly`) + a custom bound action** (validation + rescore in the CAP handler) **+ `@Common.SideEffects`** (UI refresh hint only). That is the recommended next step to reach 100% Fiori Elements — tracked, not done here.

5. **Certification note (from the research).** The bigger cert blocker is unrelated to these screens: the **`sap.ushell` sandbox launchpad** (loaded from `/test-resources/`, unversioned CDN UI5, deprecated `sap.ushell` APIs) must move to **SAP Build Work Zone** before an SAP-store submission. Recorded in the council register; see `CERTIFICATION-READINESS.md` (to be updated).

## What changed in v3.21.4
- `app/admin-bridges/fiori-service.cds` — RiskBand/RiskConfig/AssetClassStrategy: `@Capabilities` reduced to `DeleteRestrictions.Deletable:false` (restores freestyle write; FE stays read-only). SystemConfig unchanged (full OData read-only).
- `srv/admin-service.js` — new `after(['CREATE','UPDATE'],'RiskBand')` ladder-integrity guard (server contract).
- `test/riskband-ladder-guard.test.js` — 7 new tests (valid update allowed; overlap/gap/max<min rejected; delete blocked). **Total 395 tests pass; `cds build` clean.**

## Live retest (BTP v3.21.4, 2026-06-18)
Via the real OData write path (authenticated session): `validUpdate=200` (freestyle write restored — was 405-blocked since v3.21.2), `ladderViolation=400` (server guard rejects a write that lifts the lowest band off 0; rolled back), `deleteBlocked=405` (FE delete hazard closed). FE Risk Bands Object Page header = **Share only** (no Edit/Delete/Create) → confirmed read-only viewer. Both apps 1/1, `/health` 200.

## Confidence
**High.** Validated by the expert council, a cited multi-source web research pass, and a focused test that both reproduced the regression and proved the fix. The one residual is the broader FE-migration / managed-launchpad cert work, tracked separately.
