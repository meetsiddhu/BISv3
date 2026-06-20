# BridgeManagement (BIS) — Release Notes

> User-facing summary of what changed in each release. Newest first.

## Application

| | |
|---|---|
| **Open the app** | https://b143eeabtrial-dev-bridgemanagement.cfapps.us10-001.hana.ondemand.com |
| OData service (technical) | https://b143eeabtrial-dev-bridgemanagement-srv.cfapps.us10-001.hana.ondemand.com |
| Environment | SAP BTP · org `b143eeabtrial` · space `dev` · region `us10-001` |

> **First time after an update?** Open the app in a private/incognito window (or hard-refresh)
> so your browser loads the new version instead of a cached copy. A BTP login + the BMS role
> collection are required.

---

## 3.50.0 — Bridge search-help: register-style slice & dice
**Improved (Prioritisation bridge picker — Assess & HV tabs):**
- The bridge value-help (F4) is now a **filtered ALV-style grid**, not just a search box. Narrow the
  list by **free text** (matches across ID, name, mode, network, state, posting) **and** by
  **Transport Mode**, **State** and **Posting Status** facet drop-downs — the same way you slice the
  Bridges register. A live **match count** and a **Clear filters** button are shown; clicking a row
  chooses the bridge. Columns: Bridge ID · Name · Mode · Network · State · Condition · Posting.

**Confirmed (registers — already ALV smart tables, no change needed):**
- The **Bridges** register is a `GridTable` and the **Restrictions** register a hierarchical
  `TreeTable`; both have full personalization (sort / filter / group / choose & reorder columns)
  + Excel export, a multi-field filter bar, and **clicking a row opens that record's details
  (Object Page)**. The FE value-helps inside the registers (e.g. the restriction's bridge picker)
  are likewise multi-column, filterable dialogs.

## 3.49.0 — Prioritisation: removed the read-only model panel + jurisdiction-neutral labels
**Changed (Prioritisation):**
- The **Assess** tab no longer shows the read-only **"Configured model … — auto criteria
  (read-only, from data)"** panel. That model and its criteria/weights are **configurable** where
  they belong — **BMS Administration → Prioritisation Models** — and the per-criterion evaluation
  is still available in the audit **Run detail** dialog. (The Federated facts panel — condition,
  load rating, restrictions — stays.)
- **Jurisdiction-neutral model labels.** Everywhere a model was named to a user (Run detail, the
  exec PDF's "Scoring model(s)", the Models admin note, and the Help dialog) now shows a neutral
  label — e.g. a *"standards parameter pack"* / `PACK-V1` — instead of a jurisdiction-prefixed
  code. The **stored** model codes are unchanged, so audit reproducibility of past runs is
  preserved.

## 3.48.0 — Prioritisation Assess tab: clearer bridge identity + searchable picker
**Fixed / improved (Prioritisation → Assess):**
- **You can now see which bridge you're assessing.** Picking a bridge — from the Worklist or the
  picker — now shows its **name + ID + transport mode** prominently at the top of the Assess tab,
  so the pre-filled data is never ambiguous. Before any bridge is chosen, a hint explains what to do.
- **Searchable bridge picker (ALV-style value help).** The plain dropdown is replaced by a
  **search dialog with a table** (Bridge ID · Name · Mode/Network · Condition) and a live search
  box — type an ID or name to find a structure in a large fleet (SAP-standard F4). The same picker
  now serves the **HV Assessment** tab.
- **Help content corrected to standards.** The in-app Help now cites the real method basis — a
  likelihood×consequence **risk matrix (ISO 31000)** feeding an asset-management priority
  (**ISO 55000 / 55001**), with **AS 5100** / Austroads (AASHTO where relevant) for the engineering
  inputs — and the worked example now shows the exact score arithmetic (→ **73**, band **P2**).

## 3.47.0 — One home for configuration (launchpad tidy-up)
**Changed:** the launchpad's **Configuration** group no longer shows the four *view-only*
tiles — **Risk Bands**, **Risk Factors**, **Asset Class Strategy** and **System Settings**.
Those screens were read-only duplicates of what you already **create and edit** in the
**BMS Administration** app (BMS Admin → side panel), so they were removed to avoid the
"this looks like an editor but isn't" confusion. **Nothing was lost:** edit all four in
**BMS Administration**, and any saved `#RiskBands-manage` / `#RiskFactors-manage` /
`#AssetClassStrategyCfg-manage` / `#SystemSettings-manage` deep-link still opens.
**Kept as tiles:** **Class Types** and **AM Objectives** stay in the Configuration group —
they're full create/edit (Fiori Elements draft) screens that aren't in the BMS Administration
sidebar. See `docs/CONFIG-CRUD-AND-IA-REVIEW.md` for the full rationale.

## 3.46.0 — Map: close button on the side panel
**Fixed:** the **Filter Bridges** side panel now has a **collapse/close button** on the top-right of
its header — click it to hide the panel and give the map full width. Re-open it with the menu
button on the map toolbar. (Previously the only toggle was the map-toolbar menu icon, which was
easy to miss.)

## 3.45.0 — Standardised ALV-style tables + completed search helps
**What's new (registers, Fiori Elements):**
- **Every list table is now ALV-capable** — column personalization (sort / filter / group /
  choose & reorder columns) **and Excel export** are enabled on all 20 List Reports. The
  data-dense registers (Bridges, Inspections, Defects, Capacities, Elements, Bridge-Restrictions,
  and the risk/portfolio/change reports) render as a **GridTable** (ALV-style grid); the
  Restrictions register keeps its hierarchy **TreeTable**; config-maintenance lists stay
  responsive — all with the same personalization + export toolbar.
- **Search helps completed on Bridges** — added value helps for **Material** & **Superstructure
  Material** (new admin-maintainable Material catalog) and **Importance Level**. The Restrictions
  register already had full search-help coverage on every coded field (type, unit, category,
  status, vehicle class, direction, severity, mode, network, lane availability, PBS, bridge).

> Remaining minor Bridges gaps (advisory free-text with sensible defaults): `lga`,
> `loadRatingBasis`, `ratingStandardType`, `conditionStandard` — can be turned into config
> lookups on request.

## 3.44.0 — Multi-modal restrictions: full taxonomy + downstream route-planning feed
**What's new (restrictions):**
- **Comprehensive, mode-aware restriction catalog** — the type list now covers **all modes**:
  road (NHVR mass/dimension/access), **rail** (Route Availability, tonnage, axle, TSR, structure
  gauge), **marine** (air draft / navigation clearance, channel width, opening schedule),
  **pedestrian** (crowd load, path width) and **dangerous-goods prohibition** — 31 types, each
  tagged with its mode + category + default unit, fully **admin-configurable and extendable**.
- **Multi-modal data captured** — restrictions now hold `transportMode`, `network`, severity,
  air-draft / navigation-clearance, rail RA / tonnage, dangerous-goods flag, opening schedule,
  surfaced in a **Rail & Marine** section on the restriction page.
- **Downstream route-planning feed** — `GET /restrictions/api/route-feed[?mode=Road]` gives
  external routing engines a clean, machine-readable list of active restrictions **with the bridge
  location** and the governing limits per mode (so they can exclude/flag a structure and plan the
  route). NHVR-aligned.
- **Reporting** — multi-mode `Restrictions Dashboard` (Analytical List Page), Change Documents,
  Excel export and mass upload/update all cover the new fields.
- **Classification on restrictions** — the same optional class/characteristics engine as bridges
  works on restrictions too (searchable multi-select, blank-when-unclassified, mandatory fields).

See `docs/RESTRICTIONS-TAXONOMY.md` for the full taxonomy, standards basis (AS 5100 / HVNL-NHVR /
Austroads / rail RA / marine), and the route-planning data contract.

## 3.43.0 — EAM-grade classification: blank-when-unclassified, searchable picker, mandatory fields
**What's new (custom attributes / classification):**
- **Unclassified = blank.** A bridge (or restriction) with **no class assigned** now shows **no**
  custom attributes — pick class(es) first (true SAP-classification behaviour). No more "all
  attributes showing when nothing is selected".
- **Searchable, multi-select class picker.** Edit → **Select Classes…** opens a dialog with
  **type-ahead search + multi-select** that scales to hundreds/thousands of classes; selected
  classes show as chips and only their characteristics appear below.
- **Mandatory characteristics enforced.** A characteristic marked **Required** in an assigned
  class must be filled when the asset is saved — the save is blocked with a clear message
  (server-validated), and on mass-import too.
- **Reportable / downloadable / mass-maintainable** (confirmed): characteristic values are saved
  + audited, surfaced in the **Change Documents** report and via OData, exported to Excel, and
  bulk **created or changed** via mass-upload — all driven by one config (`classification.resolve`).

See `docs/CLASSIFICATION-EAM-ALIGNMENT.md` for the full SAP ECC/S-4 classification mapping, the
limitations we overcome, and the no-code extensibility model.

## 3.42.0 — Class config aligned across register, selector & mass-upload
**Where the config lives:** the **Attribute Classes** tile is the config. Each class has an
**Object Type** (Bridge / Restriction) and a **Status** — only **Active** classes whose Object
Type matches, **and that have at least one enabled characteristic**, apply to that object. Each
characteristic's **Object-Type Scoping** (Enabled) is the finer control.
**What's aligned now:**
- The per-record **Classes** selector now offers **only classes that actually have enabled
  characteristics** — no more empty/irrelevant classes in the list (it now matches the register
  exactly).
- **Mass-upload import** now writes values **only for enabled characteristics**, the same set the
  download template and the register use — so config, register, restrictions and mass-upload/update
  are all driven by one source of truth.
**To control which classes show for bridges:** open the **Attribute Classes** tile, filter by
Object Type = Bridge, and set a class **Inactive** (or its characteristics' scoping to disabled)
to remove it; per bridge, use the **Classes** tick-list in Edit mode.

## 3.41.0 — Capital optimiser shows its reasoning
**What's new:** the **Prioritisation → Optimise** tab now explains *why* each bridge was
selected and *how* the program was built, not just the result.
- A method summary up top (e.g. *"ranked every costed work by risk bought down per dollar,
  then funded down the list until the budget ran out — 2 funded, 2 deferred"*).
- The **Funded** table now shows each bridge's **rank**, **risk bought down per $1**,
  **cumulative spend**, and a plain-English **"Why funded"**.
- A new **Unfunded P1/P2** table lists every high-priority work the budget left out, with the
  **shortfall** and **why it was deferred**.

**How to use:** Prioritisation app → *Capital Program / Optimise* tab → enter a budget →
**Optimise**.

## 3.40.0 — Pick which classes apply to a bridge (SAP-EAM classification)
**What's new:** previously a bridge showed **every** custom-attribute class. Now you choose.
- In a bridge's **Custom Attributes → Edit**, a **Classes** tick-list lets you select the
  class(es) that apply to that specific record; only those characteristics are shown for data
  collection, and the choice is saved.
- Untick everything to go back to showing all classes. Works for Restrictions too.

## 3.39.0 — Fix: can't create Characteristics + richer characteristic setup
**Fixed:** creating a Characteristic on a Class no longer errors with *"Sorry, we can't find
this page"* — you can now open the characteristic, set its data type, add its **Allowed Values**
list, and scope it to objects.
**What's new:** a characteristic can now declare how it is **rendered** when collecting data —
**Auto · Dropdown · Radio buttons · Checkbox · Multi-select · Free input** — and the bridge /
restriction data-entry forms honour it.

## 3.38.0 — Fatigue screening rolled out + live demo refreshed
**What's new:** the AS 5100.6 fatigue screen now shows on every bridge (steel/composite
structures are screened by age, mode and detail category; concrete reads *Not Applicable*).
The live demo register was refreshed so the data-quality range (green / amber / red) is visible.

## 3.37.0 — True multi-modal (rail) + cleaner lookups
**What's new:**
- **Rail-aware heavy-vehicle assessment:** a road vehicle is now **refused** against a rail or
  pedestrian structure (with a clear reason) instead of returning a misleading pass. Rail
  design load models (300LA) were added.
- **Fatigue screening (AS 5100.6)** introduced as an advisory prompt for steel structures.
- **BHI calibration badge** on the bridge page makes clear when rail/pedestrian health weights
  are indicative (road-derived) rather than calibrated.
- Disabled lookup values stay consistently hidden everywhere.

## 3.35.0 — Honest data-quality & load-rating badges
**What's new:** every bridge now shows a **Data Quality** badge (Complete / Partial /
Incomplete) and a **Load Rating Basis** badge (Screening vs Certified), so a screening estimate
or an open-data stub is never mistaken for surveyed, certified data. Filterable in the worklist.

## 3.34.0 — Council fixes: strategy line-of-sight, smarter BHI, stronger validation
**What's new:**
- **Asset-management objectives & levels of service** (ISO 55001): a traceable line from
  organisational goal → objective → measurable target, with a new launchpad tile.
- **Smarter BHI:** the bridge health index now reflects the **extent** of element defects
  (condition-state quantities), so a deck mostly in poor condition scores worse than one only
  slightly affected.
- **Stronger validation:** custom-attribute values must match the configured allowed list —
  off-list and disabled values are now rejected.

---

*Earlier releases (≤ 3.33) predate this notes file. The full technical history is in the git
commit log and `docs/COUNCIL-FIXES-2026-06.md`.*
