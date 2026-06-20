# UAT — Template Prioritisation Flow

> Manual acceptance script for the prioritisation template feature on the deployed
> BTP app. ~10 minutes. Each step lists the exact action and the expected result.
> The same flow is proven automatically in `test/template-fleet-e2e.test.js` and
> `test/template-attributes.test.js` (bridge + pavement, both green) — this script
> confirms it in the live UI.

**App:** https://592f5a7btrial-dev-bridgemanagement.cfapps.us10-001.hana.ondemand.com/fiori-apps.html
**Role required:** admin (model edit + template instantiate) and manage (fleet score).
**Prerequisite:** deploy 3.17.0 first — the attribute catalogue and richer demo
attributes ship in that build.

---

## A. Load demonstration data

| # | Action | Expected result |
|---|--------|-----------------|
| A1 | Open the launchpad → **BMS Administration** tile | Admin shell opens with left sidebar |
| A2 | Sidebar → **Demo Mode** → **Load Demo Data** | Toast: "Demo data loaded — 30 bridges, 150 attribute values." |
| A3 | Sidebar → **Bridge Register** | 30 fictional bridges; owners are a mix of State Roads Authority, councils, and a motorway concession |

## B. Browse & instantiate a template

| # | Action | Expected result |
|---|--------|-----------------|
| B1 | Sidebar → **Prioritisation Models** → **Template library** tab | 12 templates listed across Transport / Mining / Infrastructure / Government / Energy / Maritime, each with a standards basis |
| B2 | On **TPL-BRIDGE-INTL-V1**, click **Create model from template** | Dialog opens with Code, Name, and **Target asset class** fields |
| B3 | Set Code = `BRIDGE-FLEET-V1`, Target asset class = `Road Bridge`, click **Create Draft model** | Toast: "Model BRIDGE-FLEET-V1 created as Draft". Model dropdown now lists it |
| B4 | Select `BRIDGE-FLEET-V1` in the dropdown; review **Criteria / Weights / Rules** tabs | 12 criteria, weights all stamped `Road Bridge`, rules include a SafetyFloor on overall condition |
| B5 | (Optional) change one weight, observe the save toast | "Saved — applies to FUTURE runs only (past runs are immutable)." |

## C. Activate & score the fleet

| # | Action | Expected result |
|---|--------|-----------------|
| C1 | Set `BRIDGE-FLEET-V1` status to **Active** | Model becomes Active; `NSW-PACK-V1` stays Active (not retired) |
| C2 | Launchpad → **Bridge Prioritisation** tile | Assess/worklist screen opens |
| C3 | Run **Score Fleet** | ~30 runs created, banded P1–P5, model code on each = `BRIDGE-FLEET-V1` (your class-specific model wins resolution) |
| C4 | Inspect the worklist | The 130-year-old **Milfield Truss Bridge** (Critical condition) sits at **P1, held for review**; healthy bridges (e.g. Harbour Gate) are in lower bands |
| C5 | Open a run's detail | Shows criterion breakdown with real scores for condition, load-rating factor, scour, design-life consumed, detour, traffic (~7 of 12 criteria resolved from demo attributes) |

## D. Evidence & reporting

| # | Action | Expected result |
|---|--------|-----------------|
| D1 | Launchpad → **Prioritisation Run Archive** | Immutable runs listed with model code/version and weight-set hash |
| D2 | Launchpad → **Prioritisation Report** | One-page executive PDF downloads; band counts reconcile to the worklist; provenance reads "baseline formula" (no client references) |
| D3 | Sidebar → **Change History / Change Documents** | Template instantiation, weight edits and the fleet run are all logged with the acting user |

## E. Non-bridge vertical (optional, proves the breadth)

| # | Action | Expected result |
|---|--------|-----------------|
| E1 | Prioritisation Models → Template library → instantiate **TPL-ROAD-PAVEMENT-V1** with Target asset class = `Sealed Pavement`; activate it | Pavement model active |
| E2 | Admin → **Attribute Classes** (or the attributes UI) for a bridge | The sector attribute groups are present (Transport, Mining, …); pavement attributes like **IRI**, **Rut depth**, **Skid vs IL** are fillable with their allowed values |

> Note: the demo register is bridge-shaped, so E is best demonstrated by populating
> pavement attributes on an asset and confirming they resolve. Full pavement-shaped
> registers are a documented future extension; the engine + templates + attribute
> catalogue already handle non-bridge scoring (proven in the automated tests).

---

### Pass criteria

- [ ] 12 templates visible across 6 sectors
- [ ] Template instantiates to a Draft with class-stamped weights
- [ ] Activated model wins fleet resolution without retiring the incumbent
- [ ] Critical asset floors to P1 with review hold
- [ ] Run detail shows multiple criteria resolved from attributes (not all-missing)
- [ ] Executive PDF + change log are client-reference-free
