# Config CRUD, Information Architecture & Reporting — Expert-Council Review

Answers three questions: (1) does the configuration have create/edit (CRUD)? (2) do the config
screens need separate tiles or should they live in the admin side panel? (3) do the reports /
analytics make sense?

## 1. Config CRUD — status (tested)

**Verdict: configuration HAS full CRUD — it just lives in two places.** A live CRUD test against
the OData service confirmed:

| Surface | Create | Update | Delete | Notes |
|---|---|---|---|---|
| Lookups (RestrictionTypes, MaterialTypes, States, …) | ✅ 201 | ✅ | soft (405) | full OData CRUD (admin) |
| ClassTypes, AM Objectives, Attribute Classes, EAM mappings | ✅ (draft) | ✅ | ✅ | **draft-enabled FE inline CRUD** — create/edit right in the tile |
| RiskBand, RiskConfig (Risk Factors), AssetClassStrategy | ✅* | ✅* | soft (405) | **edited in the BMS Administration app** (direct OData CRUD); the FE tile is a read-only viewer |
| SystemConfig | ✅* | ✅* | — | edited via the System config screen (Express `/system/api`) |

\* full CRUD via the **BMS Administration** side-panel app / its OData calls, not the FE tile.

**Why the RiskBand / RiskConfig / AssetClassStrategy FE tiles are read-only (by design):** these are
**not** `@odata.draft.enabled`. The **BMS Administration** app maintains them with *direct* OData
create/update — and a draft-enabled entity rejects direct OData writes. Draft-enabling the FE tile
would break the BMS Administration editors (recorded pre-mortem MUST-FIX #4 / UAT P1-001). Integrity
is enforced at the service layer (RiskBand ladder guard, `@assert.range`, AssetClassStrategy bounds),
so every write path is governed. The FE Delete button is the only unsafe affordance, so DELETE is
blocked (soft-delete only). **So the answer to "does it have create/edit?" is YES — in the BMS
Administration app (the bridge admin side panel).**

## 2. Information architecture — "separate tile, or in the admin side panel?"

**The user is right — consolidate.** Today the launchpad has BOTH:
- a **"CONFIGURATION (FIORI ELEMENTS)"** group: Risk Bands, Risk Factors, Asset Class Strategy,
  System Settings (read-only viewers), + Class Types, AM Objectives (FE CRUD), AND
- a **"BMS Administration"** app (side-nav with 9 sections) that has **full CRUD** for Risk Bands,
  Risk Factors, Asset Class Strategy, System Config, GIS, BNAC, Prioritisation Models, BSI/BHI, Demo.

So **4 of the 6 CONFIGURATION tiles are read-only duplicates** of the BMS Administration sidebar —
which is exactly where create/edit happens. This is confusing ("the tile looks like an editor but
isn't").

**Recommendation (implemented now, step 1):** make it obvious — the 4 read-only config tiles are
relabelled "view-only · edit in BMS Administration", so a user immediately knows where to edit.
**Recommended follow-up (your call):** retire those 4 read-only tiles entirely and make **BMS
Administration** the single config home (the bridge admin side panel) — Class Types + AM Objectives
stay as FE-CRUD tiles (they are not in the sidebar). Non-breaking; just a launchpad cleanup.

## 3. Reporting & analytics — do they make sense?

**Verdict: yes — 7 distinct, complementary surfaces, no redundancy.** Each serves a different
audience/decision:

| Surface | Type | Purpose | Verdict |
|---|---|---|---|
| **Dashboard** | Freestyle | Portfolio pulse — KPIs + condition/restriction distributions | meaningful (executive) |
| **Bridge Risk Report** | FE List Report (ALV) | Per-bridge risk + inspection + ROI worklist | meaningful (engineering ops) |
| **Network Portfolio** | FE List Report (ALV) | Pre-aggregated network × mode (avoids average-of-averages) | meaningful (capital planning) |
| **Restrictions Dashboard** | FE Analytical List Page | Multi-mode restrictions analytics (unifies both restriction masters) | meaningful (network access) |
| **Change Documents** | FE List Report | Audit trail (field + custom-attribute changes, old/new/who/when) | meaningful (compliance) |
| **Prioritisation Run Archive** | FE List Report | History of all prioritisation runs (active + superseded) | meaningful (governance) |
| **BHI / BSI Explorer** | Freestyle | Condition-health index deep-dive + calculation transparency | meaningful (condition) |

No overlap: Dashboard = pulse; Risk Report = per-bridge worklist; Portfolio = network aggregate;
Restrictions Dashboard = restriction analytics; Change Documents = audit; Run Archive = run history;
BHI Explorer = health calculation. All align to ISO 55001 governance. **No reporting is redundant or
nonsensical.** (Two thin aggregates — BandSummary, ConditionByMode — are dashboard *feeds*, not tiles,
which is correct.)

## 4. Full-test summary

- **CRUD**: lookups 201, draft config (ClassTypes) create+activate, soft-delete enforced (405),
  register CRUD covered by the 448-test suite (bridges/restrictions create/edit/deactivate).
- **Search helps / tables / classification / restrictions**: covered in prior increments.
- **Reports**: data sources verified, all meaningful.
