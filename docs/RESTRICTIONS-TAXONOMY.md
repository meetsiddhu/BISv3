# Bridge Restrictions — Taxonomy, Data & Downstream Route-Planning

Expert-council reference (bridge SMEs + asset/product + UI/UX) for restrictions on bridges across
**all modes** — road, rail, marine, pedestrian/active — in Australia/NSW and internationally, the
**data we capture** to identify and document each, and the **data contract for downstream route
planning**. Everything here is **config-driven** (lookup catalog + classification), so the taxonomy
extends without code.

## 1. Standards basis

- **AS 5100** (Bridge Design) — load posting, design load (SM1600/300LA), clearances.
- **Heavy Vehicle National Law (HVNL) / NHVR** — mass (GML/CML/HML), dimension, access (B-double,
  road train, PBS L1–L4), gazettal, permits, escorts; NHVR National Network Map / RAV.
- **Austroads / NTC** — restriction signage, posting, dangerous goods routing.
- **NSW** — gazette orders (posted-load orders, network access), Transport for NSW network.
- **Rail** — Route Availability (RA), axle/tonnage limits, structure gauge, Temporary Speed
  Restrictions (TSR), electrification clearance.
- **Marine / navigable waterways** — air draft (vertical navigation clearance), navigation channel
  width/depth, opening schedules for movable (lift/swing/bascule) bridges.
- **International parity** — AASHTO (US load posting), Eurocode/UK (C&U, abnormal loads), so the
  catalog is mode-tagged rather than country-locked.

## 2. Restriction taxonomy (by mode + category)

| Category | Type | Modes | Captured value / data |
|---|---|---|---|
| **Mass** | Mass Limit (gross) | Road | gross mass (t) |
| | Load Limit (posted) | Road | posted load (t) + gazette order |
| | Gross Combination Mass (GCM) | Road | GCM (t) |
| | Axle Group Limit | Road | axle group (t) |
| | Single / Tandem / Tri-Axle Limit | Road | per-group (t) — steer/tandem/tri fields |
| | Rail Axle Load Limit | Rail | axle load (t) |
| | Rail Tonnage Limit | Rail | gross tonnage |
| | Pedestrian / Crowd Load Limit | Pedestrian/Active | load (kPa or persons) |
| **Dimension** | Height / Vertical Clearance | Road/Rail | clearance (m) |
| | Width Limit | Road | width (m) |
| | Length Limit | Road | length (m) |
| | Structure Gauge Limit | Rail | gauge envelope |
| | Air Draft (Vertical Navigation Clearance) | Marine | clearance above water (m) |
| | Navigation Channel Width | Marine | channel width (m) |
| **Operational** | Speed Restriction | Road | speed (km/h) |
| | Temporary Speed Restriction (TSR) | Rail | speed (km/h) + reason |
| | One-Way / Single-Lane Operation | Road | direction / lanes |
| | Lane Restriction | Road | lanes open / lane width |
| | Bridge Opening Schedule | Marine | opening times (movable spans) |
| **Access** | Vehicle Class Restriction | Road | class / PBS level (no B-double, road train, HML…) |
| | Route Availability (RA) | Rail | RA number |
| | Dangerous Goods Prohibition | Road/Rail/Marine | hazmat classes restricted |
| **Permit / Condition** | Permit Condition | Road | escort / pilot / notice period |
| | Escort / Pilot Required | Road | pilot vehicle count, signage |
| **Closure / Environmental** | Temporary Closure / Full Closure | All | closure + dates |
| | Environmental Restriction | All | trigger (flood level, fire, wind, ice, seasonal) |

## 3. Data captured per restriction (identify + document)

The `Restrictions` (and `BridgeRestrictions`) entity captures, config-driven:
- **Identity:** ref, bridge link, name, description, `transportMode`, `network`.
- **Type & value:** `restrictionType` (mode-aware catalog), `restrictionValue` + `restrictionUnit`,
  plus typed limits — grossMassLimit, axleMassLimit, steer/tandem/tri/GCM, height/width/length,
  speed, lane availability/width; **(new)** air draft, navigation clearance, rail RA, rail tonnage.
- **Applicability:** `appliesToVehicleClass`, `pbsClassApplicable`, `direction`, **(new)**
  `dangerousGoodsRestricted`.
- **Severity & permanence:** `restrictionSeverity` (Critical/Major/Minor), Permanent/Temporary,
  `effectiveFrom/To`, `temporaryFrom/To`, `reviewDueDate`.
- **Cause & operations:** `restrictionReason`, `conditionTrigger`, `detourRoute`, **(new)**
  `openingSchedule`.
- **Conditions:** permit/escort required, `pilotVehicleCount`, `signageRequired`.
- **Governance / legal:** gazette number + dates, issuing/enforcement authority, approval ref,
  `legalReference`, `eamNotificationId` (EAM link).
- **Extensible:** any extra attribute via **class/characteristics classification** on restrictions
  (optional — same engine as bridges).

## 4. Downstream route-planning data contract

`GET /restrictions/api/route-feed[?mode=Road&activeOnly=true]` returns a clean, machine-readable
feed for route planners (NHVR-style), one record per active restriction with the bridge location:

```
{ generatedAt, count, restrictions: [ {
  bridgeId, bridgeName, latitude, longitude, geoJson, route, network, state,
  restrictionRef, transportMode, category, restrictionType, value, unit, severity,
  direction, appliesToVehicleClass, pbsClassApplicable, dangerousGoodsRestricted,
  limits: { grossMass, gcm, axle, height, width, length, airDraft, navigationClearance,
            railTonnage, speed },
  permitRequired, escortRequired, pilotVehicleCount, detourRoute,
  effectiveFrom, effectiveTo, gazetteNumber, gazetteExpiryDate, issuingAuthority,
  railRouteAvailability } ] }
```

This lets a routing engine exclude/flag a structure, pick the governing limit per mode, and surface
the legal reference + detour — without reading the internal schema.

## 5. Reporting

- **NetworkRestrictionReport** — multi-mode Analytical List Page (by mode / network / severity /
  type / status) on the Restrictions Dashboard tile.
- **Change Documents** — every restriction change (old/new/when/who).
- **Mass-upload export** — restrictions + attribute sheets to Excel; **mass upload/update** to bulk
  create or change.
- **Route-feed** — the downstream JSON above.

## 6. Configurable & extendable

- **Types** live in the `RestrictionTypes` catalog (mode-tagged: `applicableModes`, `category`,
  `defaultUnit`) — admins add a type with no code change.
- **Units, categories, severities, directions, vehicle classes** are all maintainable lookups.
- **Any further attribute** is added via **classification (class/characteristics)** on restrictions —
  optional, not mandatory.
