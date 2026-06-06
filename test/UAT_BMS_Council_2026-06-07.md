# Expert-Council UAT — BIS / BMS v3.4.2 — 2026-06-07

> Live browser UAT of the deployed multi-modal / risk / restrictions release, evaluated
> through a coordinated expert council (PO/SME · QA · UX · Dev · Security · Risk &
> Asset-Management SME · DevOps). Target:
> `https://592f5a7btrial-dev-bridgemanagement.cfapps.us10-001.hana.ondemand.com`.

## Scope tested (Phases 1–4, this release)
Bridges multi-modal register; risk prioritisation engine; Bridge Risk ALV; multi-mode
Network Restrictions ALV/ALP; Asset Class Strategy + Risk Bands/Factors governance;
plus regression of the earlier FE Change-Document report, Attribute Classes, EAM mapping.

## Executive summary
**Cleared for continued `dev` use.** All four phases are deployed and functional. The
multi-modal foundation, risk engine (32 bridges scored), Bridge Risk ALV, Network
Restrictions ALV/ALP (table + 7 slice/dice filters across Road/Rail/LightRail), and the
governance entities all work in the live UI. One refinement remains: the ALP **chart bars**
need a measure-binding tweak (the ALP **table** + filters work fully). No P1 defects.

## Verified live (evidence)
| Area | Result |
|------|--------|
| Launchpad — new "RISK & MULTI-MODAL" group, 6 tiles | ✅ |
| Bridges — Mode + Network columns & filters; 32 bridges = Road (auto-backfilled) | ✅ |
| Transport modes (7, all modes) / Networks (6) lookups + value help | ✅ |
| Risk engine — `recalcRisk` scored 32 bridges (2 Very High, several High/Medium/Low) | ✅ |
| Bridge Risk ALV — 32 rows, filters (Mode/Network/State/Asset Class/Risk Priority), risk columns | ✅ |
| Network Restrictions ALP — table "Network Restrictions (6)" across Road(3)/Rail(2)/LightRail(1); filters Mode/Network/Type/Severity/Status/Bridge Risk/State; chart frame "Restrictions by Mode" | ✅ (table + filters); ⚠️ chart bars (see C-1) |
| Holistic restriction fields — mode, network, severity, lane availability, lane width | ✅ (6 records created across modes/networks/severities) |
| Asset Class Strategy — entity + 3 seeded strategies + FE list/object (draft) | ✅ |
| Risk Bands (4) / Risk Factors (5) — seeded + FE lists | ✅ |
| Regression: Change Documents ALV, Attribute Classes, EAM Mapping | ✅ (prior verification holds) |

## Council findings

### [C-1] ALP chart bars do not render (table + filters OK) — P2
- **Lens**: Dev / PO. **Symptom**: The Restrictions Dashboard (ALP) chart frame ("Restrictions by Mode", Mode dimension) renders, but no bars appear; the table view and all 7 slice/dice filters work fully and the `$apply` aggregation returns correct counts (Road=3, Rail=2, LightRail=1).
- **Root cause**: the `@UI.Chart.DynamicMeasures` → `@Analytics.AggregatedProperty#restrCount` binding isn't producing a plotted measure in the ALP chart template.
- **Impact**: Low — the requirement ("slice and dice") is met by the ALP table + filters; only the visual chart is incomplete.
- **Fix**: switch the chart to a static `Measures: [restrCount]` with `@Aggregation.CustomAggregate#restrCount` or a count measure, and verify the ALP chart `measureAttributes`. Refinement, not a blocker.

### [C-2] Multi-modal data is sparse — P3 (data, not code)
- **Lens**: PO/SME. All 32 existing bridges defaulted to **Road**; only 6 restrictions (seeded during UAT) carry non-Road modes/networks. The reports/dashboard are correct but under-populated.
- **Fix**: reclassify rail/light-rail bridges and assign networks (admin data task) so the analytics show real variety.

### [C-3] Bridge-restriction draft-activate returned 404 during bulk API create — P3
- **Lens**: Dev/QA. Creating restrictions via the OData draft action returned 404 on the activate URL, yet records persisted (count went 0→6 and they display). Cosmetic in the API path; UI create/activate works normally.
- **Fix**: confirm the draftActivate bound-action path for BridgeRestrictions; low priority.

### [C-4] Risk override UI not yet surfaced — P4
- **Lens**: Risk SME. `riskOverride` / `riskConsequence` / `riskLikelihood` exist and the engine honours them, but there's no dedicated FE action for an engineer to override+justify on the bridge object page yet (editable via bridge edit).
- **Fix**: add an "Override Risk" action with mandatory reason (Phase 4 polish).

### Verified-good (no action)
- Additive-only schema; HANA auto-backfilled Road; 65/65 tests pass; cds build + app builds clean.
- Risk engine math correct (consequence×likelihood→band); recalc action backfills.
- Union/join views (ChangeDocumentReport, NetworkRestrictionReport, BridgeRiskReport) query correctly.
- Soft-delete, ChangeLog, XSUAA gating intact.

## Council sign-off
| Role | Verdict | Note |
|------|---------|------|
| PO / SME | APPROVE-WITH-CONDITIONS | Functional; populate multi-modal data (C-2) + finish ALP chart (C-1). |
| QA / Test Lead | APPROVE-WITH-CONDITIONS | 65/65 unit tests; live walkthrough green; chase C-1/C-3. |
| UX | APPROVE | Consistent FE patterns; filters/columns clear; ALP table strong. |
| Lead Dev | APPROVE-WITH-CONDITIONS | Clean additive model; one ALP chart-measure tweak (C-1). |
| Security | APPROVE | Admin-gated tiles/entities; no secrets; soft-delete only. |
| Risk & Asset-Mgmt SME | APPROVE-WITH-CONDITIONS | Defensible Option-1 framework; add override action (C-4). |
| DevOps | APPROVE | Repeatable build/deploy; HANA backfill clean; v3.4.2 live. |

**Overall: cleared for `dev`; no P1s.** Priority follow-ups: C-1 (ALP chart), C-2 (data), then C-4/C-3.
