# Standards & Capability Audit — BIS v3.9.3

> Maps the Bridge Information System against ISO 55000 (asset management), SAP S/4HANA
> EAM (as a **complement**, not a replacement), and NSW/TfNSW + Austroads bridge standards.
> Legend: ✅ Met · ◑ Partial / advisory · ↗ Complemented-by-EAM (by design) · ⛔ Gap.

---

## 1. ISO 55000 / 55001 asset management

| ISO 55001 clause | BIS capability | Status |
|---|---|---|
| 4 Context / asset boundaries | Multi-modal register (road/rail/light-rail/ped), network/corridor, asset class | ✅ |
| 5 Leadership / policy | Config-driven policy: `AssetClassStrategy`, `RiskConfig`, `RiskBand` (with sign-off) | ✅ |
| 6.2 Objectives / SAMP | Target condition + intervention thresholds per asset class | ✅ |
| 6.2.2 Risk-based planning | Consequence×likelihood engine, mode-aware, documented methodology, bands calibrated | ✅ |
| 6.2.2 Forecasting (RUL) | `estimatedRulYears` from assumed degradation rate (advisory, flagged) | ◑ |
| 6.2.2 Monetised risk / LCC | `likelyFailureCostAud`, `mitigationCostAud`, `expectedValueAud`, ROI inputs (planning proxy) | ◑ |
| 7.5 Information / data quality | `DataQualityRules`, completeness scoring, validated ingress | ✅ |
| 8 Operation / lifecycle | Inspection→condition→defect→(EAM work) lifecycle; soft-delete; provenance | ✅ |
| 9 Performance / audit trail | `ChangeLog` on every CUD (durable), `AttributeValueHistory`, Change Documents report | ✅ |
| 10 Improvement | `recalcRisk`, configurable weights/bands/strategies, review cadence | ✅ |
| Financial valuation / depreciation | Owned by SAP FI-AA / EAM | ↗ |

**ISO posture:** the model is **defensible for prioritisation and indicative capital
planning**; RUL/monetisation are explicit planning heuristics (not actuarial). Formal ISO
55001 *certification* is an external accredited-body audit — this app provides the
information-management + risk evidence such an audit requires.

---

## 2. SAP S/4HANA EAM — complement boundary (locked in CLAUDE.md)

| EAM concept | System of record | BIS role |
|---|---|---|
| Functional Location / Equipment (FLOC/EQUI) hierarchy | **SAP EAM** | reference (`eamFlocId`/`eamEquipId`/`eamObjectType`) + deep-link |
| Work / maintenance orders | **SAP EAM** | reference (`eamOrderId`/`eamWorkOrderId`) — does **not** build a parallel WO engine |
| Notifications (defect→work) | **SAP EAM** | reference (`eamNotificationId`) |
| Maintenance plans / strategies / task lists | **SAP EAM** | maps engineering strategy → `eamMaintenancePlan` |
| Measuring points / documents | **SAP EAM** | reference (`eamMeasPointId`/`eamMeasDocId`) |
| Object-part classification (OTEIL) | **SAP EAM** | `ElementTypes.eamOteil` mapping |
| Org master (WERKS/BUKRS/KOKRS/ORGID) | **SAP EAM** | reference only |
| Costs / valuation / depreciation | **SAP FI-AA / EAM** | not replicated |
| **Bridge engineering register** (condition, capacity, **risk**, restrictions, GIS) | **BIS** | **system of record** ✅ |
| Integration config + audit | **BIS** | `EAMCodeMapping`, `EAMFieldMapping` (no hardcoded maps), `EAMSyncLog` ✅ |

**Integration runtime** (PUSH/PULL/BIDIRECTIONAL sync via BTP Destination + Principal
Propagation) is **scaffolded** (config entities + reference fields ready) but requires a
reachable S/4 EAM endpoint + credentials to exercise — the standalone app runs fully without it.

---

## 3. NSW / TfNSW + Austroads bridge management

| Standard / concept | BIS capability | Status |
|---|---|---|
| TfNSW Bridge Inspection Manual — condition 1–5 band | Canonical TfNSW labels mapped from legacy 1–10 (single module) | ✅ |
| Level-2 element-level inspection | `BridgeElements` hierarchy + `ElementTypes` + element condition | ✅ |
| Inspection accreditation levels (1–4) | `accreditationLevel` | ✅ |
| Importance level (1–4) | `importanceLevel` feeds risk consequence | ✅ |
| NHVR heavy-vehicle (AADT, HML, B-double, PBS, freight/over-mass) | full flag set + load rating | ✅ |
| Load rating / capacity (AS 5100.7) | `BridgeCapacities` + `loadRating` | ✅ |
| Restrictions / postings (mass/height/width/speed/lane) | `BridgeRestrictions` full dimension set | ✅ |
| GDA2020 (EPSG:7844) datum | declared on storage policy + all exports | ✅ |
| Multi-modal (rail/light-rail) | first-class modes + networks + cross-modal reporting | ✅ |
| Gazette / legal reference for postings | `gazetteReference`, `legalReference`, `approvalReference` | ✅ |
| IPWEA/Austroads asset-class codelists pre-seed | code-lists configurable; pre-seeded set partial | ◑ |

---

## 4. Other world standards (capability view)

| Area | Status |
|---|---|
| **Security** (OWASP, XSUAA, CSRF, injection, audit) | ✅ CSRF everywhere, scope-gated, identifier guards, no secrets in repo |
| **OData V4 / Fiori programming model** | ✅ FE V4 draft, annotations, value-help, side-effects |
| **WCAG 2.1 AA** | ◑ role/aria/labels present; i18n mostly complete; full axe audit outstanding |
| **GeoJSON RFC 7946** | ✅ validated ingress + CRS declaration |
| **Observability** | ✅ correlation-id, `cds.log`, process-level safety net |
| **Data privacy** | ✅ PII excluded from debug; soft-delete preserves audit |

---

## 5. Honest gaps to "fully audited / certified"

- **Formal certificates** (SAP Store, ISO 55001) are issued by SAP / accredited bodies after their own review — this app is prepared to **be submitted**, not self-certified.
- **WCAG**: needs a formal axe/screen-reader pass.
- **EAM sync runtime**: needs a live S/4 endpoint to validate end-to-end.
- **RUL/monetisation**: calibrate the degradation rates + probability proxy against NSW historical failure data before funding decisions.
- **HA**: prod spaces should run ≥2 instances (the dev trial is single-instance + auto-stops).
