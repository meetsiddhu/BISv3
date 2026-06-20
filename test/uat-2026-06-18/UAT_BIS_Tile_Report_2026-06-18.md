# UAT Tile Report — BIS (BridgeManagement) v3.21.1

**Tester team:** PO/SME (bridge + HVSAP expert) · QA · UX · Dev · Security
**Target:** live BTP trial launchpad — `https://592f5a7btrial-dev-bridgemanagement.cfapps.us10-001.hana.ondemand.com/`
**Date:** 2026-06-18 · **User:** DU (Default User, admin) · **Browser:** Chrome extension · **Mode:** full create/change/delete on live data
**Baseline rows:** Bridges 32 · Restrictions 3 · Inspections 2 · Defects 3 · AssetClassStrategy 3 · SystemConfig 1 · RiskBand 4 · RiskConfig 14 · AttributeDefinitions 86 · AttributeGroups 9 · AssetClasses 0

---

## Executive summary

The **core application is solid and certifiable for its business-entity flows.** I created, edited and soft-deleted real records on the live system for **Bridges** and **Restrictions**, ran the **Heavy-Vehicle assessment** and **Capital-program optimiser**, and confirmed the **audit trail** (2,383 ChangeLog entries) and the **freestyle BMS Admin config editors** all work end-to-end. The launchpad's 22 tiles across 5 groups render, and the 4 new Fiori Elements config tiles **route correctly**.

**The headline issue is the 4 new FE config tiles themselves:** they display data but **cannot create or edit** — and worse, they still expose **Delete**, so a user could delete a risk band (etc.) with no way to recreate it from that screen. Root cause: those 4 entities were never `@odata.draft.enabled`. The good news: the **freestyle BMS Administration tabs are fully functional editors** for exactly these entities (with domain validation the FE screens lack), so **no functionality is lost** — the fix is to make the FE tiles safe read-only viewers now, and pursue full FE editing as a follow-up.

### Top 3 findings
1. **P1 — FE config tiles are view+delete only** (no create/edit; delete-without-recreate hazard). Not draft-enabled. → make read-only now; keep freestyle as the editor. **Do not retire the freestyle config tabs.**
2. **P2 — HV Assessment "Margin" column never renders** — a malformed UI5 expression binding throws at view parse.
3. **P2 — Attribute Classes FE tile is empty** ("Add columns to see the content") — AttributeGroups has no `@UI.LineItem`; 9 groups are hidden.

### Deployment-readiness verdict
**Conditional GO.** Core flows (register, restrictions, HV assessment, dashboard, BHI, audit, freestyle admin) are production-ready. Before promoting the **FE config tiles** as managed config surfaces, apply P1-001 (read-only) + P2-002/003. Security P2-004/005 should ship in the same pass. Nothing found causes data loss in normal use; the one data-integrity hazard (config delete-without-recreate) is addressed by P1-001.

---

## Summary table

| Area | Result | Notes |
|---|---|---|
| Launchpad / navigation | ✅ PASS | 22 tiles, 5 groups; 4 new FE tiles route correctly |
| Bridge Register | ✅ PASS | full CRUD + soft-delete/reactivate; auto-ID; rich 9-facet object page |
| Restrictions | ✅ PASS | full CRUD + soft-delete (→Retired); bridge value-help; HV-relevant type/unit taxonomy |
| Prioritisation – Worklist | ✅ PASS | P-band ranking, score, confidence |
| Prioritisation – HV Assessment | ⚠️ P2 | compute correct; **Margin column blank** (binding bug) |
| Prioritisation – Capital Program | ✅ PASS | optimiser runs; empty result with no candidates (P3 placeholder copy) |
| Dashboard | ✅ PASS | KPIs + condition distribution live |
| Map View | ✅ PASS | OSM tiles load; 33-bridge layer; multi-basemap |
| BHI Explorer | ✅ PASS | per-mode BSI/BHI aggregates |
| BMS Administration (freestyle) | ✅ PASS | all config editors; Risk Bands full CRUD + domain rules |
| Change Documents | ✅ PASS | 2,383 changes; audit trail captured UAT ops |
| **FE: Risk Bands** | ❌ P1 | routes+renders 4 bands; view+delete only |
| **FE: Risk Factors** | ❌ P1 | same pattern (not draft-enabled) |
| **FE: Asset Class Strategy** | ❌ P1 | same pattern |
| **FE: System Settings** | ❌ P1 | renders 1 row; view+delete only |
| **FE: Attribute Classes** | ❌ P2 | empty "Add columns"; no LineItem |

---

## Per-screen detail

**Bridge Register** (`#Bridges-manage`) — 32 rows, 12-filter bar. Created **BRG-NSW-1033 "UAT-Test Bridge ZZZ"** (State NSW, Posting Unrestricted, Structure Type Beam Bridge, lat/long, Asset Owner). Auto-ID re-derived prefix from state (BRG-AUS → BRG-NSW on activation — nice). FE validation correctly blocked save until Structure Type set (3 messages for 1 field — P3-008). Edited Description; saved. Deactivated → Bridge Status Inactive, button → Reactivate (soft-delete per CLAUDE.md §2.2). Count 32→33. *Left as: inactive UAT record (soft-delete preserves audit; hard delete is blocked by design).*

**Restrictions** (`#Restrictions-manage`) — 3 rows. Created **RST-0004** (Category Permanent, Type Mass Limit, Value 10 t, Bridge = Anzac Bridge via value-help, Effective From 18 Jun 2026). Type list is full HV taxonomy (Mass/Axle-group/GCM/Height/Length/Dimension/Load limits, etc.); units include t, t/axle, km/h, m. Edited Value 10→12; deactivated → Status "Retired". Count 3→4. Value-help headers untranslated (P3-010).

**Bridge Prioritisation** (`#Prioritisation-display`) — Worklist ranks Anzac 50.0 / Sydney Harbour 46.0 / Bega River 43.0 (all P3, confidence "5 of 5 · n mo"). **HV Assessment**: Anzac × HML B-double (68.5 t) → **Verdict PASS**, governing "Vehicle 4.6 m under clearance 40 m"; per-check rating-factor/gross-mass/axle-groups/bridge-formula gracefully "not-assessable" (no capacity data on Anzac), Height clearance "pass". **Margin column blank — P2-002.** **Capital Program**: $2,000,000 budget → Allocated $0, Unfunded P1/P2: 0 (no candidates in clean dataset — correct; P3-011 copy).

**Dashboard** (`#Dashboard-display`) — Total Assets 33, Active Restrictions 9, Bridges Closed 0; condition Good 11 / Fair 10 / Poor 11 / Critical 1.

**Map View** (`#Map-display`) — basemaps (OSM/Esri/Google/HERE), Business Layers (Bridges 33). 10 OSM tiles fetched (no CSP block). *Confirm canvas visually.*

**BHI Explorer** (`#BhiExplorer-display`) — bridge picker + per-mode condition table: Road 27 (Avg BHI 36.4), Rail 3 (16.5, flagged), LightRail 2, Pedestrian 1.

**BMS Administration** (`#BmsAdmin-manage`) — left nav: Change Documents, System Config, BNAC, GIS, Attribute, **Risk Bands, Risk Factors, Asset Class Strategy**, Prioritisation Models, BSI/BHI, Demo Mode. **Risk Bands editor = full CRUD** (Add, edit pencil, Active toggle) with domain rule "lowest band starts at 0, min scores unique, no gaps/overlaps; saving re-scores every bridge." Change Document Report executed → **2,383 changes**.

**FE config tiles** (CONFIGURATION group) — Risk Bands (4 bands), Risk Factors, Asset Class Strategy, System Settings (1 row): all **route + render correctly** but Object Pages have **no Edit**, List Reports have **no Create**, Delete present (P1-001). **Attribute Classes**: empty "Add columns" placeholder (P2-003).

---

## Test-data catalogue & cleanup
| Record | Entity | State left | Purge |
|---|---|---|---|
| BRG-NSW-1033 "UAT-Test Bridge ZZZ" | Bridges | **Inactive** (deactivated) | soft-deleted by design; hard delete blocked — leave or DB-purge if required |
| RST-0004 (Mass Limit 12t, Anzac) | Restrictions | **Retired** (deactivated) | as above |

No config rows were created/edited/deleted on the live system (FE config screens can't, and I did not mutate the freestyle config to avoid re-scoring side effects). Non-config baseline counts otherwise unchanged.

## Personas applied
PO/SME (bridge engineering correctness — HV taxonomy, BHI/BSI, soft-delete) · QA (lifecycle + persistence via OData $count) · UX (empty states, validation messages, confirmation gaps) · Dev (console errors, bindings) · Security (auth gates, injection, audit). Findings tagged per fix-list item.
