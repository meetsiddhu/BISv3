# Deploy + UAT Checklist — v3.21.0 (FE migration stopping point)

> Hand-off for the browser-validation loop. Everything below is built, tested
> headlessly (387 unit/integration tests green, `cds build` + `mbt build` clean),
> and ready to validate in a running launchpad. **Nothing here is destructive** —
> the new Fiori Elements config screens run *in parallel* with the existing
> freestyle ones, so there is no functionality loss to validate against.

## What changed since the last deploy (3.19.1 → 3.21.0)

| Area | Change | Status |
|---|---|---|
| Dead code | Removed 8 unused UI apps (`operations/*`, `bms-business-admin/*`, `attributes-admin`); kept the live `BridgeManagementService` backend | ✅ tested |
| FE config screens | `RiskBand`, `RiskConfig`, `AssetClassStrategy`, `SystemConfig` now exist as **annotation-based FE List Report + Object Page** in `admin-bridges` | ✅ builds |
| Test rigour | Stryker mutation testing (58% baseline, gate 50%) + coverage-regression gate added | ✅ |
| OPA5 | Smoke-test scaffold for the FE config screens (`app/admin-bridges/webapp/test/integration/`) | ✅ scaffold |
| Launchpad | **Not** rewired (deliberate — config tiles + retiring freestyle is this UAT's job) | ⏸ pending UAT |

## Deploy
```
cf login -a https://api.cf.us10-001.hana.ondemand.com --sso-passcode <PASSCODE> -o 592f5a7btrial -s dev
cf deploy mta_archives/BridgeManagement_3.21.0.mtar -f
```
Smoke: `curl .../health` → 200; both apps `started 1/1`.

## UAT — validate the new FE config screens (no functionality lost)

**Done in 3.21.1:** the 4 FE screens now have clickable launchpad tiles in a new
**CONFIGURATION (FIORI ELEMENTS)** group. Each tile deep-links into the admin-bridges
FE app via `#<SO>-manage&/<inner route>` (the inner hash drives the FE router to the
right List Report — same proven pattern as the Inspections/EAM tiles). The 4
`fioriSandboxConfig.json` copies + inline `fiori-apps.html` + the `flp-config` test
were updated in lockstep (387 tests green).

| Tile (CONFIGURATION group) | Intent | Expected |
|---|---|---|
| Risk Bands | `#RiskBands-manage&/RiskBand` | List Report renders RiskBand rows (Order, Band, Min/Max, Colour); Object Page opens on a row |
| Risk Factors | `#RiskFactors-manage&/RiskConfig` | List of factors (Factor, Name, Weight, Active) |
| Asset Class Strategy | `#AssetClassStrategyCfg-manage&/AssetClassStrategy` | List of strategies; Object Page editable |
| System Settings | `#SystemSettings-manage&/SystemConfig` | List grouped by Category (Key, Label, Value, Type) |

For each: ☐ tile opens the FE list ☐ table loads ☐ filter/sort works ☐ Object Page
opens ☐ values match the existing freestyle screen (BMS Administration → same screen).

## After UAT passes (then, and only then)
1. ~~Add FLP tiles for the 4 FE screens~~ — **done in 3.21.1** (tiles live, test in sync).
2. Retire the corresponding tabs from the freestyle `bms-admin` shell
   (`Shell.view.xml` nav + manifest routes + controllers) — **only once the FE tiles
   are confirmed equivalent in UAT**, so no functionality is lost.
3. Re-run `npm test` + `mbt build`; redeploy.

## OPA5 (certification D4/D17)
Run the scaffolded smoke tests against the started app:
```
cd app/admin-bridges && npx ui5 serve &   # or against the deployed URL
# open webapp/test/integration/opaTests.qunit.html in a browser
```
Extend `ConfigScreensJourney.js` with field-level assertions per screen.

## Still freestyle (justified deviations — see CERTIFICATION-READINESS.md)
map-view, prioritisation Assess/HV/Capital, BhiConfig, mass-edit, mass-upload,
bhi-explorer, dashboard (Overview Page migration is Phase 2).
