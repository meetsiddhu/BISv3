# Bridge Information System (BIS) — Store Listing Pack

> Submission-ready copy for an app-store / SAP Store-style listing. All content is
> client-neutral and grounded in public standards. Screenshots must be captured
> from a running instance loaded with **Demo Mode** data (fictional assets only).

---

## App name

**Bridge Information System (BIS)** — Asset Prioritisation & Compliance

Short variants: *BIS — Structure & Infrastructure Prioritisation* · *Bridge Information System*

## Category

Asset Management · Enterprise Asset Management (EAM) extension · Public Sector ·
Transport & Infrastructure

## One-line pitch (≤ 90 chars)

Configurable, standards-based prioritisation for bridges, roads, rail, water, energy & more.

## Short description (≤ 255 chars)

A standalone SAP BTP app for structure & infrastructure asset management: register,
condition, restrictions, GIS and a fully configurable multi-criteria prioritisation
engine with 12 expert templates across 6 industry sectors. S/4HANA EAM-compatible.

## Long description

**Know what to fix first — and defend the decision.**

Bridge Information System (BIS) turns asset condition, capacity, restriction and
risk data into a defensible, ranked work programme. Its prioritisation engine is
fully configurable governed config — criteria, value bands, weights, missing-data
policies and non-compensatory safety rules are all data, not code — so each
organisation calibrates it to its own portfolio without bespoke development.

BIS ships with **12 expert-calibrated prioritisation templates** spanning six
industry sectors, each encoding published international practice:

- **Transport** — bridges (AS 5100 / AASHTO MBE / FHWA), sealed pavements
  (Austroads / IRI / AusRAP), rail track (EN 13848 / UIC 714), tunnels
  (PIARC / NFPA 502)
- **Mining** — tailings storage facilities (GISTM / ANCOLD), haul roads
  (Thompson & Visser / ISO 17757)
- **Infrastructure** — culverts & stormwater (FHWA / ARR 2019)
- **Government** — water mains (ISO 24516 / AWWA), public facilities (APPA FCI /
  NCC), dams (ANCOLD / ICOLD)
- **Energy** — distribution poles & towers (AS/NZS 7000)
- **Maritime** — wharves & jetties (PIANC / AS 4997)

Instantiate a template, tailor the weights to your portfolio, review and activate —
every model is versioned and every assessment run is immutable and reproducible,
frozen with a parameter snapshot and weight-set hash for audit.

**Highlights**

- Configurable multi-criteria prioritisation with non-compensatory safety floors
  (a structure in critical condition can never be averaged out of the top band)
- 12 standards-based templates across 6 sectors, instantiable per portfolio
- Asset register with condition (1–5 band), load restrictions, capacity, GIS
  (GDA2020), custom attributes and mass upload
- Immutable, reproducible assessment runs with full change-log audit
- Fleet/portfolio batch scoring into P1–P5 priority bands with review holds
- Executive one-page PDF and prioritisation run archive
- Complements SAP EAM (functional locations, work orders stay in EAM); deep-links out
- XSUAA security with view / manage / admin scopes
- Standalone — runs with no live S/4 system

**Built on:** SAP CAP (Node.js), OData V4, Fiori. Deploys to SAP BTP Cloud Foundry.

## Who it's for

Water utilities · Local government · Energy network operators · Mining operators ·
Toll & motorway concessions · Rail infrastructure managers · Road agencies ·
Ports & ferry operators. *(See README market table.)*

## Key features (bullet list for feature grid)

| Feature | Benefit |
|---|---|
| Configurable prioritisation engine | No-code calibration to any asset class |
| 12 sector templates | Defensible, standards-based starting points |
| Non-compensatory safety rules | Critical assets can't be averaged down |
| Immutable, reproducible runs | Audit-grade, board-ready evidence |
| Fleet batch scoring | Whole-portfolio P1–P5 ranking in one action |
| GIS + mass upload | Fast onboarding of existing registers |
| EAM-complementary | Works alongside SAP EAM, no duplication |

## Screenshots to capture (from Demo Mode — fictional data only)

1. **Network dashboard** — KPI tiles (total assets, critical, restrictions, overdue).
2. **Bridge register** — list with condition (1–5) and posting status columns.
3. **Map view** — demo assets colour-coded by condition.
4. **Template library** — the 12-template / 6-sector tab in Prioritisation Models.
5. **Model builder** — criteria / weights / rules tabs of an instantiated model.
6. **Prioritisation worklist** — P1–P5 banded, ranked fleet results.
7. **Executive PDF** — the one-page prioritisation report.

> Caption every screenshot "Illustrative data — fictional demonstration assets."

## Compliance & data statement

- **No client data.** The product ships with fictional demonstration data only;
  all real-world references have been removed.
- **Standards-based.** Prioritisation methodologies derive from publicly available
  standards and practice (AS 5100, Austroads, AASHTO, EN 13848, GISTM, ANCOLD,
  ISO 24516/55000, AWWA, IPWEA IIMM, PIARC, NFPA 502, PIANC, AS/NZS 7000). The app
  cites these standards; it does not reproduce their text.
- **Security.** XSUAA authentication, role-gated entities, no secrets in the
  package, full change-log audit on every create/update/deactivate.
- **Privacy.** No personal data is collected by the application core.

## Support / links

- Documentation: `docs/` (RUNBOOK, TEMPLATE-LIBRARY, eam-mapping)
- Methodology: `docs/prioritisation/TEMPLATE-LIBRARY.md`
- Architecture: `docs/diagrams/`

---

### Pre-submission checklist

- [ ] Capture the 7 screenshots from a Demo-Mode instance (fictional data)
- [ ] Confirm app icon / tile branding carries no client logo
- [ ] Final `grep` sweep returns zero client-cluster references (automated in tests)
- [ ] Version tag matches the deployed MTA (currently 3.17.0)
- [ ] Remove or exclude internal QA docs (`docs/COUNCIL-*`) from the distribution if
      shipping the repo as part of the package
