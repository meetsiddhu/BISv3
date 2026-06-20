# Bridge Information System (BIS)

A standalone, SAP BTP-native asset management system for structures and linear
infrastructure: register, condition, load restrictions, GIS, risk, and a fully
configurable multi-criteria **prioritisation engine** with a standards-calibrated
template library covering Transport, Infrastructure, Mining and Government asset
classes. Built on SAP CAP (Node.js) + Fiori, S/4HANA EAM-compatible, deployable
to Cloud Foundry with XSUAA security and full audit trail.

## Who this is for

BIS is **not** built around any single agency. The prioritisation engine is
governed configuration — criteria, value bands, weights, missing-data policies
and non-compensatory safety rules are all data — and ships with eight
asset-class templates encoding published international practice. Organisations
where this delivers immediate value:

| Organisation type | Examples of the market | What they'd use it for |
|---|---|---|
| **Water utilities** | Sydney Water, Hunter Water, regional water corporations, bulk-water authorities | Mains renewal (ISO 24516 / AWWA template), dam safety portfolio prioritisation (ANCOLD template), critical-customer escalation, structures over pipelines |
| **Local government** | City and shire councils with bridge, culvert & facilities portfolios | Council bridge registers, culvert & stormwater prioritisation (ARR 2019 template), community-facility FCI prioritisation, IPWEA IIMM alignment |
| **Energy utilities** | Electricity distribution & transmission network operators | Pole/tower cohort prioritisation (AS/NZS 7000 template), bushfire-zone ignition risk escalation, feeder criticality |
| **Mining operators** | Iron ore, coal and gold producers; mining services contractors | Tailings storage facility governance (GISTM/ANCOLD template), haul road condition & safety prioritisation, site infrastructure registers |
| **Private toll & motorway concessions** | Motorway concession operators and O&M contractors | Structure & tunnel registers (PIARC/NFPA 502 template), load-rating compliance, lender/regulator reporting, immutable runs as the audit basis |
| **Rail infrastructure managers** | Freight rail corridor owners, heavy-haul private railways, light-rail operators | Track-segment prioritisation (EN 13848 geometry-led template), structures over/under rail, ONRSR-aligned risk exposure |
| **State & national road agencies** | Road authorities in any jurisdiction or market | Network bridge & pavement prioritisation (AS 5100/AASHTO and Austroads templates), NHVR-style heavy-vehicle access management |
| **Ports & maritime** | Port corporations, ferry operators, marinas | Wharf/jetty prioritisation (PIANC/AS 4997 template), berth criticality, dangerous-goods transfer exposure |

Because templates are instantiated per organisation (clone → tailor weights →
review → activate) and every model is versioned with immutable, reproducible
runs, one deployment can serve mixed portfolios — e.g. a council running
bridges, culverts and buildings against three different active models at once.

## Key capabilities

- **Asset register** — structures with condition, capacity, restrictions,
  custom attributes, GIS (GDA2020), mass upload, change history on every CUD.
- **Prioritisation engine** — weighted-sum scoring with per-criterion value
  bands (numeric or discrete), four missing-data policies (never a silent
  zero), confidence decay on stale data, monotonic user-type uplift, and
  non-compensatory rules (SafetyFloor / Veto / Escalate / HurdleMin).
- **Template library** — twelve expert-calibrated starting points across six
  industry sectors (`docs/prioritisation/TEMPLATE-LIBRARY.md`), instantiable
  per portfolio.
- **Governance** — versioned models, immutable assessment runs frozen with
  parameter snapshots and weight-set hashes, review holds, sign-off fields,
  ChangeLog audit on every change.
- **EAM boundary** — complements SAP EAM (functional locations, work orders
  stay in EAM); BIS owns the engineering specialist layer and the mapping.

## Getting started

```bash
nvm use 20
npm install
npm test          # 326 tests
npx cds watch     # local dev (SQLite, dummy auth)
```

Deploy: `mbt build && cf deploy mta_archives/*.mtar` — see `docs/RUNBOOK.md`.

Demo mode (Admin → Demo Mode) loads 30 fictional bridges across state-authority,
council and private-concession ownership. All demo names and locations are
invented; no real asset data ships with the product.
