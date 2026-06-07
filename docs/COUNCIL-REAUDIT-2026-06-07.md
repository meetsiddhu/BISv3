# RE-AUDIT REPORT — NSW Bridge Asset-Management System (BIS) v3.8.3

**Prepared by:** Expert Council (ISO 55000 · NSW/TfNSW Bridge Management · SAP BTP · SAP S/4 EAM · SAP UI5/Fiori UX · Product Management)
**Date:** 2026-06-07 · **Baseline:** C+ (44 confirmed findings) · **Method:** Static analysis, 3-vote adversarial verification

---

## 1. Executive Verdict

**NEW OVERALL MATURITY GRADE: B+ (up from C+)**

The remediation is a genuine, structural lift — not cosmetic. Across 9 deploys the team closed the entire class of P0/critical security and geodesy defects that anchored the C+ baseline: CRS storage/datum separation is now config-driven with validated GeoJSON ingress and export CRS; CSRF is enforced everywhere; debug surfaces are locked down; SQL identifiers are guarded; and audit-durability now fails bulk operations. Risk scoring became mode-aware, methodology-documented, and monetised (expected-value/RUL), moving the platform meaningfully toward ISO 55000 defensibility. The EAM posture correctly shifted to "complement-not-replicate" with reference fields, a sync log, and an explicit boundary locked in CLAUDE.md. Of 49 issues surfaced this round, 8 were refuted or confirmed-fixed, leaving **41 verified-remaining**: **zero P0**, **11 P1**, **24 P2**, **6 P3 (incl. P3-equivalents)**. The platform is no longer in a "fix before you trust it" posture — it is in a "finish the disciplined backlog" posture. What holds it below A is a consistent pattern of **schema-complete-but-unenforced** (EAM/element/status fields accept arbitrary values), **config-claimed-but-still-hardcoded** literals that violate the team's own Rule 4, **incomplete EAM reference coverage** on Inspections/Capacities/Restrictions, **i18n debt** concentrated in the GIS map/config controllers, and **test/HA gaps** on the most safety-critical modules (inspection scheduling, mass-edit audit durability).

---

## 2. Lens Scorecard

| Lens | Baseline | New | Justification (grounded in remaining findings) |
|---|---|---|---|
| **Architecture** | C | B− | Action handlers exist but `changeCondition` has an **inverted condition mapping** (ARCH-R1, P1 — a genuine correctness defect, not style) and no input validation (ARCH-R2); async handlers lack error boundaries (ARCH-R5). `server.js` remains a 2,827-line god file (ARCH-R4). Solid bones, unfinished hardening. |
| **Config / Correctness** | C | B− | Rule 4 ("zero hardcoding") is **partially self-violated**: 50MB upload (CONFIG-R2), proximity radius ignoring its own GISConfig key (CONFIG-R4), zoom-cell map (CONFIG-R3), 9 GIS defaults (CONFIG-R1), 13 DQ fields (CONFIG-R5). All P2, all mechanical — the config pattern exists (`getConfigInt`), it's just not applied uniformly. |
| **Risk / ISO 55000** | D+ | B | Strong conceptual lift: mode-aware risk, METHODOLOGY.md, RiskBand rationale, RUL, monetised EV. But **RUL is non-functional** — `degradationRatePerYear` has no seed data (RISK-R1, P1) — and `eamMaintenancePlan` mapping is unseeded (RISK-R2, P1). Calibration evidence (RISK-R3) and actuarial defensibility of likelihood→probability (RISK-R4) remain thin for audit. |
| **EAM** | C− | B | Boundary correctly drawn (complement-not-replicate, locked in CLAUDE.md). **Reference coverage asymmetric**: Inspections & Capacities (EAM-R1, P1), org fields KOKRS/ORGID (EAM-R3, P1) and Restrictions (EAM-R2, P2) missing; EAM fields accept any value with **zero validation** (EAM-R4, P2). Correct architecture, incomplete wiring. |
| **Inspection / NSW** | C | B− | AssetClassStrategy now drives due/overdue; element hierarchy + OTEIL + defect state-machine landed. But integrity gaps remain: defect↔element **cross-bridge linkage unvalidated** (INSPECT-R1, P1), `status` accepts invalid CREATE values (INSPECT-R2, P1), `elementType` uncodified (INSPECT-R3), elements not surfaced in UI (INSPECT-R4), dual-field legacy bypass (INSPECT-R5). |
| **GIS** | D | A− | The standout lift. CRS storage/datum separation, config-driven geodesy, ingress validation, and export CRS are done and verified. Residual is **declaration completeness only**: restrictions export (GIS-R1, P2) and clusters endpoint (GIS-R5, P3) miss CRS metadata; Leaflet projection lacks an inline drift-guard comment (GIS-R2, P2). Near-exemplary. |
| **Fiori UX** | C | B− | Map-view i18n, multi-modal worklist columns, value-help state landed. But **BridgeElements/ElementTypes have no Fiori annotations** (FE_UX-R1 P1, FE_UX-R4 P3) — the element hierarchy is invisible to users; BRDetails over-dense at 16 fields (FE_UX-R2); `recalcRisk` lacks action annotation + SideEffects (FE_UX-R3). |
| **Accessibility / i18n** | D+ | C+ | Map-view app internationalised, but the **GIS map/config controllers are the i18n black hole**: hardcoded strings across `gisMapInit.js` (FREE_UX-R1/R2), `GISConfig.controller.js` (FREE_UX-R3, P1), `GISConfig.view.xml` (FREE_UX-R4), and residual `Main.view.xml` tooltips (FREE_UX-R5). Localisation/handover blocker, not a safety one. Lowest lens. |
| **Security** | D | A− | The most decisive lift. CSRF everywhere, debug lockdown, SQL identifier guard, audit-fails-bulk — all verified-fixed. **Single residual: BNAC environment names lack whitelist validation** (SEC-R4, P2; SQL-injection already mitigated by parameterisation). Strong, defensible posture. |
| **Tests / Ops** | C− | B− | 93 unit tests is real progress, but coverage misses the safety-critical core: **`inspection.js` untested** (OPS-R1, P1), no bulk audit-failure tests (OPS-R3), no etag/concurrency e2e (OPS-R5). Mass-edit audit fires fire-and-forget (OPS-R2, P1) — inconsistent with the fixed mass-upload path. **Single CF instance, no HA** (OPS-R4) for critical infrastructure. |

---

## 3. Regression Check

**NONE FOUND — with one verified inconsistency flagged, not a new defect.**

No remediation in this round introduced a *new* defect relative to the C+ baseline. Every verified-remaining finding is either a **pre-existing gap the remediation did not reach** or an **incomplete application of a correct new pattern** — none is a behaviour that the remediation broke.

The one item warranting explicit board attention is **OPS-R2** (mass-edit audit logs fire asynchronously without failure propagation). This is **not** a regression — it is the *original* behaviour left untouched. However, it is now an **internal inconsistency with the remediation's own fix**: the team correctly made audit-durability fail the transaction for **mass-upload** (a confirmed fix this round), but the parallel **mass-edit** path (`server.js` ~518–523, and the `saveMassEdit*` family) still uses fire-and-forget `Promise.all()`. The locked rule "ChangeLog on every CUD" (CLAUDE.md #2.3) is therefore honoured on one bulk path and violated on the other. Treat this as a **consistency-completion P1**, not a regression.

Similarly, **CONFIG-R4** is a latent inconsistency (the correct `proximityDefaultRadiusKm` GISConfig key exists and is shipped to the UI, but the backend ignores it and falls back to a hardcoded 10 km) — again pre-existing, not introduced.

---

## 4. Remaining Roadmap to A+

### P1 — Correctness, integrity, audit durability, and ISO/EAM functionality (do first)

| Finding(s) | Item | Effort |
|---|---|---|
| ARCH-R1 | Fix inverted TfNSW→legacy condition mapping (use `deriveCondition`/reverse map) | **S** (½ day) — highest-priority correctness defect |
| ARCH-R2 | Validate `conditionValue` against `CONDITION_LABELS`; reject nulls | S (½ day) |
| RISK-R1 | Seed `degradationRatePerYear` per mode → makes RUL functional | S (½ day + calibration note) |
| RISK-R2 | Seed `eamMaintenancePlan` codes → activates BIS→EAM planning linkage | S (½ day) |
| EAM-R1 | Add EAM reference block to BridgeInspections + BridgeCapacities | M (1 day, additive/nullable) |
| EAM-R3 | Add `eamControllingArea` (KOKRS) + `eamOrgUnit` (ORGID) to Bridges | S (½ day, additive) |
| INSPECT-R1 | Enforce defect.element belongs to same bridge (cross-bridge guard) | S (½ day) |
| INSPECT-R2 | Enforce `status` enum on CREATE | S (½ day) |
| FE_UX-R1 | Add Fiori annotations for BridgeElements (list/object/facets) | M (1–2 days) — unblocks element usability |
| FREE_UX-R3 | i18n the GISConfig controller dialog strings | M (1 day) |
| OPS-R1 | Unit-test `inspection.js` (due/overdue/edge cases) | S–M (1 day) |
| OPS-R2 | Move mass-edit audit writes inside tx (fail-fast, match mass-upload) | M (1–2 days) — closes the consistency gap from §3 |

**P1 subtotal: ~9–11 dev-days.**

### P2 — Config discipline, EAM validation, UX density, CRS completeness, test/HA

CONFIG-R1/R2/R3/R4/R5 (apply existing `getConfigInt` pattern; **S each, ~2 days total**) · EAM-R2 (Restrictions EAM ref, S) · EAM-R4 (EAM enum codelists + transition validation + EAMSyncLog hook, **M**) · INSPECT-R3 (elementType FK/codelist, S) · INSPECT-R4 (surface elements in admin UI, M) · GIS-R1 (restrictions export CRS, **S**) · GIS-R2 (Leaflet projection drift-guard comment, XS) · FE_UX-R2 (split 16-field BRDetails, S) · FE_UX-R3 (`recalcRisk` action + SideEffects, S) · FE_UX-R5 (EAM tile i18n labels, S) · FREE_UX-R1/R2/R4/R5 (GIS map i18n debt, **M total**) · RISK-R3 (RiskBand calibration evidence + review-date field, M) · RISK-R4 (document likelihood→prob derivation + RiskConfig override + sensitivity analysis, M) · SEC-R4 (BNAC env-name whitelist `^[A-Z0-9_]{1,50}$`, **S**) · OPS-R3 (bulk audit-failure tests, S) · OPS-R4 (CF instances ≥2 + rolling-deploy validation, **S config / M validation**).

**P2 subtotal: ~12–15 dev-days.**

### P3 — Governance polish and hardening

INSPECT-R5 (deprecate/flag legacy `elementAffected` or add DQ rule) · GIS-R5 (clusters endpoint CRS metadata) · FE_UX-R4 (ElementTypes value-list annotations — pairs with FE_UX-R1) · ARCH-R4 (extract map/export from `server.js` god file — testability/merge-risk) · ARCH-R5 (try/catch error boundaries on action handlers) · OPS-R5 (etag/optimistic-concurrency + rollback e2e tests).

**P3 subtotal: ~5–7 dev-days.**

### Correctly delegated to SAP S/4 EAM — NOT gaps in BIS

The following are **by-design boundary decisions**, consistent with the locked "complement-not-replicate" principle in CLAUDE.md, and must **not** be counted against BIS maturity:

- **Maintenance execution** (work orders, work-center scheduling, cost-center routing, approval chains) — BIS holds *reference IDs and deep-links only* (the EAM-R block); execution lives in S/4 EAM. EAM-R1/R2/R3 are about *completing the reference fields*, not replicating EAM logic.
- **Maintenance-plan authoring** — BIS maps to plan codes (RISK-R2/`eamMaintenancePlan`); the plans themselves are mastered in EAM.
- **Org master data** (plant/WERKS, company code/BUKRS, controlling area/KOKRS, org unit/ORGID) — *sourced from* EAM; BIS stores per-bridge override references (EAM-R3), it is not the system of record.
- **Notification/measurement-document lifecycle** — BIS references notification/meas-doc IDs (EAM-R1/R2); the documents are owned by EAM.

> **Roadmap total to A+: ~26–33 dev-days** (≈5–7 weeks for one engineer, less in parallel once ARCH-R4 unblocks). No item requires re-architecture; the path to A+ is disciplined backlog completion, not redesign.

---

## 5. Confidence & Caveats

- **Method:** Findings derive from **static analysis** of v3.8.3 source plus governance docs (CLAUDE.md, METHODOLOGY.md, GIS-CRS-POLICY.md, eam-mapping alignment docs). No runtime/dynamic execution, load testing, or live EAM-integration testing was performed.
- **Verification rigour:** Every one of the 41 findings survived **3-vote adversarial verification**; 8 candidate findings were **refuted or confirmed-fixed** and excluded. Where votes were 2/3 (e.g., ARCH-R2, ARCH-R4, RISK-R3, RISK-R4, FE_UX-R1, INSPECT-R2, INSPECT-R4, OPS-R2, OPS-R5, GIS-R2, GIS-R5, FREE_UX/FE_UX-R5), residual interpretive uncertainty exists but the council retained them as real.
- **Line references are approximate** — file contents may have shifted between the analysed snapshot and the current HEAD; treat line numbers as locators, not exact addresses. File paths are authoritative.
- **Scope honesty:** This audit deliberately did **not** invent findings beyond the verified list. Absence of a finding in a lens is **not** proof of absence of all defects — only that none survived this round's verification. The "no regression" conclusion is bounded by static analysis: a regression only observable at runtime (e.g., a concurrency race) would not be caught here, which is precisely why OPS-R5 (etag/e2e) is on the roadmap.
- **Grade basis:** B+ reflects elimination of the entire P0/critical class, strong Security and GIS lifts, and a defensible ISO 55000 risk framework — tempered by 11 P1 items concentrated in correctness (ARCH-R1), audit durability (OPS-R2), and EAM/risk functional completeness (RISK-R1/R2, EAM-R1/R3). A/A+ is gated on closing the P1 tier and the i18n + test-coverage debt, none of which is architecturally hard.

---

## Post-re-audit remediation (v3.9.0)
Closed this round: ARCH-R1 (inverted condition mapping), ARCH-R2 (label validation), RISK-R1/R2 (RUL + EAM-plan seeds), EAM-R1 (Inspections/Capacities EAM refs), EAM-R3 (KOKRS/ORGID), INSPECT-R1 (cross-bridge element guard), INSPECT-R2 (defect status enum), OPS-R1 (inspection.js unit tests), SEC-R4 (BNAC env whitelist). 98 unit tests.
