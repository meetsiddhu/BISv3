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

## 3.55.4 — Named, cloneable BHI/BSI configurations (governed versioning)

**New:** the **Bridge Health Index (BHI/BSI)** configuration is now a **governed, versioned model** you
can copy and manage — not a single set of settings. On the **BSI / BHI Configuration** admin screen there's
now a **Version** picker with **Clone** and **Activate**:

- **Clone** the live configuration into a new **Draft** you can freely tune (per‑mode *and* per‑class weights,
  coefficients) **without affecting live scores**.
- **Activate** a Draft when you're ready — it becomes the one the engine uses, and the previous version is
  **retired** (kept for reference, not deleted).
- Switch between versions at any time; retired versions are read‑only until you clone them.

This is the "admin gives a default, users copy and create their own" model applied to bridge health — the same
governed pattern the Prioritisation engine already uses (draft → review → activate, fully audited).

**Under the hood:** BHI configuration moved from a single settings blob to **first‑class, relational,
versioned records** (additive — existing settings were migrated automatically on upgrade, nothing lost). The
calculation engine reads the **active** version; every clone and activation is recorded in **Change Documents**.
**577** automated tests pass. No change to how scores are computed — only how the configuration is governed.

> Open the app in a private/incognito window (or hard-refresh) to load 3.55.4 instead of a cached copy.

---

## 3.55.3 — Per‑asset‑class BHI/BSI weighting (configurable per class)

**New:** the **Bridge Health Index (BHI/BSI)** can now be tuned **per asset class**, not just per
transport mode. On the **BSI / BHI Configuration** admin screen there's a new **"Per‑class overrides"**
tab: pick an asset class (e.g. *Culvert*, *Rail Bridge*) and a transport mode, and adjust how much each
element group (deck, substructure, bearings, …) counts toward that class's score. Where you set no
override, the class keeps using the per‑mode weights — so this is purely additive. Each override starts
as a copy of the mode weights, which you then fine‑tune; delete a row to revert that element group.
Resolution order is **class + mode → mode → default**, matching how prioritisation already works.

**Why it matters:** a culvert and a girder bridge deteriorate and fail differently — now their health
scores can reflect that, instead of one mode‑wide weighting for every structure type.

**Fixed (admin config robustness):** saving the BHI configuration is now safe in two cases that
previously misbehaved — saving *only* per‑class changes no longer resets the rest of the configuration,
and saving from any tab no longer discards per‑class overrides. Every change is still audited
(old → new) in **Change Documents**.

**Under the hood:** the calculation engine, the admin API, and the screen all read the same governed
config (nothing hard‑coded); **565** automated tests pass (added per‑class weighting + config
round‑trip coverage). No data or workflow changes; existing scores are unaffected until you choose to
add an override and recompute.

> Open the app in a private/incognito window (or hard-refresh) to load 3.55.3 instead of a cached copy.

---

## 3.55.2 — "Show on Map" fix + accessibility contrast

**Fixed:** clicking **Show on Map** from a bridge's detail page now **zooms the map to that exact
bridge** (and opens its details) instead of opening the map zoomed out on every bridge. The bridge's
identity is now read correctly from the launchpad navigation, so the map focuses where you expect.

**Improved (accessibility):** muted helper text and input borders on the **Custom Attributes** panels
(bridge + restriction) and the **GIS/map configuration** were too light to meet WCAG 2.2 AA contrast.
They've been darkened to compliant tones — easier to read, and a step toward accessibility certification.

**Under the hood:** added an automated **contrast guard** and **property-based tests** for the
condition‑rating engine to the test suite (now **558+** automated tests, all passing) so these don't
regress. No data or workflow changes.

> Open the app in a private/incognito window (or hard-refresh) to load 3.55.2 instead of a cached copy.

---

## 3.55.1 — Security: patched the spreadsheet-parsing library
**Fixed (security):** the third-party library the app uses to read uploaded Excel/CSV files
(SheetJS / `xlsx`) had a publicly-known **HIGH-severity** flaw, and the version published to the
public npm registry was never patched. We've moved to the vendor's **official patched build (0.20.3)**
from their own distribution channel, which closes both reported issues (a "prototype pollution" flaw
and a "regular-expression denial-of-service"). This matters because the **Mass Upload** feature
parses spreadsheets you supply, so a maliciously-crafted file was a real attack vector — now closed.
No feature or behaviour changed: mass-upload (per-row results, results-CSV download, source-file
retention, the dataset templates) works exactly as before, and the dependency security scan
(`npm audit`) is now clean. **558/558** automated tests pass.

**Under the hood (runtime):** as part of shipping this release, the app's Node.js runtime was moved
from **Node 20 → Node 22 (LTS)**. The SAP BTP hosting platform retired Node 20 from its build
images, so the app now runs on the supported Node 22 line. No user-visible change — the full test
suite passes on Node 22. Open the app in a private/incognito window (or hard-refresh) to pick up the
new version.

## 3.55.0 — UAT council fixes (hardening + polish)
Outcome of an expert-council UAT pass (no blocking issues found). This release applies the polish
and hardening items it surfaced:
- **Safer error messages:** server error responses no longer echo raw internal error text to the
  browser — the full detail is logged on the server and you get a clear, generic message instead.
  (Validation messages you rely on, like "value is not allowed", are unchanged.)
- **Localisation:** ~30 hard-coded labels/buttons/column headers in the **BMS Administration**
  screens (System Configuration, GIS Configuration, BNAC) — plus a few dashboard/mass-edit tooltips —
  now come from the translation file, so the app can be translated end-to-end.
- **Accessibility:** the "delete layer" button in GIS Configuration now has a proper tooltip/label.
- **Data quality:** added **"Axle Mass Limit"** to the restriction-type catalogue so an existing
  restriction that used it is now a recognised, selectable type.
No functional behaviour changed; 448/448 automated tests pass. Open the app in a private/incognito
window (or hard-refresh) to pick up the new version.

## 3.54.0 — Fix: custom attributes on restrictions stayed blank (on BTP)
**Fixed:** on the deployed app, the **Custom Attributes** panel on a Restriction's details page
showed up empty — no fields, no **Edit** button, nothing. The panel's helper script was being
loaded from a path that only exists when running locally; on BTP that path doesn't exist, so the
script never ran and the panel was left blank. It now loads the script the same robust way the
**Bridge** register already does (resolved through the app's module loader), so it works in every
environment. Also hardened the panel to read the record key correctly while a restriction is still
in **Draft** (being created or edited), so the attributes load there too. Open the app in a
private/incognito window (or hard-refresh) to pick up the new version.

## 3.53.0 — Fix: custom attributes on restrictions
**Fixed:** the **Custom Attributes** panel on a Restriction's details page didn't load. The
restriction's record key is a UUID, but the panel was reading the URL as if the key were a quoted
text value — so it never found the record and stayed blank. It now reads the UUID key correctly and
loads.
**Also (usability):** the demo only had *bridge* classification classes, so even once the panel
loaded there was nothing to classify a restriction with. Added a ready-to-use class
**"Restriction operational attributes"** — Enforcing agency, Permit / approval reference, Review due
date, Advisory signage installed, Severity basis (radio) — so restrictions have characteristics to
capture out of the box, just like bridges. Edit, extend or deactivate it in the **Attribute
Classes** tile.

## 3.52.0 — Fix: Asset Management Objectives tile errored ("Invalid value: amo")
**Fixed:** opening the **Asset Management Objectives** tile failed with *"Invalid value: amo (5)"*.
The five seeded objectives (and their service levels) were stored with human-readable IDs
(`amo-safe`, `sl-safe-1`, …) in a key column that requires a **UUID**, so the OData read rejected
all five rows. The seed data now uses proper UUIDs — with the objective→service-level links
preserved — and a one-time, idempotent cleanup removes any legacy non-UUID rows left on the
deployed database. The tile now opens and lists the objectives and their service levels normally.

## 3.51.0 — In-app Help (ⓘ) on every tile
**What's new:** every tile now has in-app **Help** that explains the screen's **purpose**, **how to
use it**, and **useful tips** for the end user.
- The register & report tiles built on Fiori Elements — **Bridges, Inspections, Defects, Bridge
  Capacity, Attribute Classes, EAM Code Mapping, Class Types, AM Objectives, Network Portfolio,
  Restrictions Dashboard, Change Documents, Restrictions, Prioritisation Run Archive** — now have a
  **Help** button in the table toolbar that opens a short *purpose / how-to-use / useful-to-know*
  dialog written for that specific screen.
- The other tiles (**Dashboard, Map View, Bridge Prioritisation, Mass Upload, Mass Edit, BMS
  Administration, BHI/BSI Explorer**) already carried a Help button — unchanged.

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
