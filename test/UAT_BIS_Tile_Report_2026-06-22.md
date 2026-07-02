# UAT Tile Report — BridgeManagement (BIS) — 2026-06-22

## Environment
| | |
|---|---|
| Version | 3.54.0 (deployed to BTP `b143eeabtrial/dev`; front door 302, srv /health 200) |
| Code under test | working tree @ 3.54.0 |
| Test instance | local `cds watch` (dummy auth) — automated layer |
| Council | PO/SME · QA · UX · Dev · Security |
| Method | API/data-layer functional + multi-agent static code review + full test suite |

### ⚠️ Browser-automation limitation (why this run is API/code-led, not click-by-click)
Both browser drivers were blocked **by the environment**, not by the app:
- **Claude Chrome extension** — returns *"This site is blocked by your organization's policy"* on
  **every** host (BTP **and** localhost). This is an enterprise-managed extension policy
  (`runtime_blocked_hosts`); the per-site "allow" toggle can't override it (IT-admin only).
- **Preview browser** — `preview_start` is locked onto port **4005**, which is owned by a *separate*
  project (`mapERP`) you're running in parallel; freeing it would mean killing that project's server,
  which I won't do unprompted.

So the council ran at the **API / data / code layer** (which exercises the same business logic the
deployed app runs) plus static FE review. The one item that is genuinely browser-render-only — the
restriction Custom Attributes **panel rendering** on BTP — is exactly what 3.54.0 fixed, and is best
confirmed by you in a private/incognito window (its entire data layer is verified PASS below).

## Baseline (local instance)
Bridges **1250** · Restrictions **78** · AssetClasses **6** · RestrictionTypes **31** · restriction
attribute classes **1** ("Restriction operational attributes", Active). UAT writes were prefixed
`UAT_` and **rolled back** (baseline restored).

## Executive summary
**Deployment-readiness verdict: GO (good shape).** No P1/blocker findings. All exercised core flows
pass, security posture is GOOD, and the 448-test suite is green. The council found **3 × P2** (polish
/ hardening) and **4 × P3** (minor) items — none block use. The previously-reported restriction
Custom Attributes blank-panel is fixed in 3.54.0 and its data layer is fully verified.

**Top 3 findings**
1. **P2-001** — Express handlers return raw `error.message` (potential internal-detail leak from
   library errors). Hardening.
2. **P2-002** — ~30 hardcoded user-facing strings in the BMS Admin freestyle views (i18n violation,
   CLAUDE.md §2.6).
3. **P2-003** — icon-only delete button in GIS Config has no tooltip (discoverability + a11y).

## Summary table
| Area | Result | Notes |
|---|---|---|
| Restriction Custom Attributes (data layer) | ✅ PASS | assign/save/enforce/persist/audit all 200/422 as expected |
| Allowed-value enforcement | ✅ PASS | invalid value → 422 with clear message |
| Facade read-only | ✅ PASS | PATCH → 405 |
| ChangeLog / attribute audit | ✅ PASS | history row written on save |
| Lookup integrity (assetClass / restrictionType) | ◑ MINOR | 1 off-catalog restrictionType (P3-001) |
| OData `$count` on code-keyed lookups | ◑ MINOR | returns 0 despite rows (P3-002) |
| Security (code) | ✅ GOOD | 1×P2 (error msg), 1×P3 (scope booleans) |
| i18n / tooltips (freestyle admin views) | ◑ P2/P3 | hardcoded strings + 1 missing tooltip |
| Test suite | ✅ 448/448 | 55 suites, 0 fail |

## Tile inventory (20 tiles)
**Main (A):** A1 Dashboard (freestyle) · A2 Bridges (FE LR/OP) · A3 Restrictions (FE LR/OP) ·
A4 Map View (freestyle) · A5 Bridge Prioritisation (freestyle).
**Register sub (B):** B1 Inspections · B2 Defects · B3 Bridge Capacity (all FE under admin-bridges).
**Config/admin (C):** C1 Mass Upload (freestyle) · C2 Mass Edit (freestyle) · C3 BMS Administration
(freestyle shell) · C4 Attribute Classes (FE) · C5 EAM Code Mapping (FE).
**Reports/tech (D):** D1 Network Portfolio · D2 Restrictions Dashboard (ALP) · D3 Change Documents ·
D4 Prioritisation Run Archive · D5 BHI/BSI Explorer (freestyle).
**Config (E):** E1 Class Types (FE) · E2 AM Objectives (FE).

## Detail by area
- **A3 Restrictions → Custom Attributes** (priority): data contract correct (1 group, 5 chars: Text,
  Date, Boolean/Checkbox, SingleSelect/RadioGroup w/ 3 allowed values). Live write flow PASS; allowed
  value enforced at 422; audit row written. Panel-render fix shipped in 3.54.0 (BTP-only) — confirm
  visually in incognito.
- **A2 Bridges**: 1250 rows; FE List Report/Object Page; custom OP sections (Attachments, GIS map,
  Custom Attributes) load via `sap.ui.require.toUrl` (the robust pattern). Facade is read-only (405).
- **C3 BMS Administration** (SystemConfig / GisConfig / BnacConfig): functional, but carries the
  hardcoded-string + missing-tooltip debt (P2-002/P2-003/P3-004).
- **Lookups / value-help**: assetClass fully covered; restrictionType 77/78 covered; `$count` quirk on
  code-keyed CodeLists (P3-002).
- **E2 AM Objectives**: opens (the 3.52.0 UUID-key fix holds locally).

## Phase results
- **Functional (CRUD/flows)**: custom-attributes end-to-end PASS; facade 405; allowed-value 422.
- **Security (static, code)**: GOOD — see fix list P2-001, P3-003.
- **Persistence/audit**: attribute value persisted + history written; baseline restored.
- **Test suite**: 448/448 green.

## Test data catalogue + purge
- Wrote then cleared on restriction `03300b82-4a60-4358-93eb-12049c15cec0`: `restr_enforcing_agency`,
  `restr_severity_basis` (values `UAT_…`). **Already rolled back** (values null, class unassigned).
  No residual UAT data. (Local sqlite only — deployed BTP data untouched.)

## Cross-linked issues
P2-001 (security/error) · P2-002 + P3-004 (i18n) · P2-003 (tooltip/a11y) · P3-001 (data) · P3-002
(OData $count) · P3-003 (scope booleans). Full detail + fixes in `UAT_BIS_Fix_List_2026-06-22.md`.

## Appendix — what could NOT be browser-verified (do these in incognito)
1. Restriction OP → Custom Attributes **panel renders** (Edit → Select Classes → fields). Data layer
   verified PASS; this is the BTP-only render path fixed in 3.54.0.
2. Map tile Leaflet render + marker clustering.
3. Dashboard KPI tiles visual + drill.
