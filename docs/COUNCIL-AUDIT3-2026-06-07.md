# Third-Audit Report — NSW Bridge Information System (BridgeManagement v3.9.3)

**Prepared by:** Expert Council (ISO 55000 · NSW/TfNSW Bridges · SAP BTP · SAP S/4 EAM · Fiori UX · Product)
**Audit round:** 3 of 3 · **Date:** 2026-06-07 · **Baseline:** B+ (v3.x post second audit)
**Scope:** 45 surviving findings (3-vote verified) + independent code re-verification of 7 high-severity items

---

## 1. Executive Verdict

**New overall grade: B+ (held, not advanced). Trending toward A‑ once the P1 cluster clears.**

This is the third pass on an asset that climbed C+ → B+ → B+. The plateau is honest, not a failure: the team has already closed 20+ P1/P2 findings (config discipline, GIS CRS export, mass-edit audit durability, EAM coverage across Inspections/Capacities/Restrictions, the Bridge Elements Fiori app, risk-calibration governance, and the condition-mapping correctness fix). The **domain core is genuinely B+/A‑ quality** — risk methodology, GIS datum handling, and condition mapping are now defensible to an external auditor.

What holds the grade at B+ rather than advancing it is a **concentrated, low-effort P1 cluster that is mostly hygiene, not redesign**:

- **A live latent defect** (ARCH-T1/T3): I re-verified the code — `LOG` is genuinely undefined in `srv/server.js`; only `_bootLog` and inline `cds.log` exist. The four fire-and-forget audit-write `.catch(err => LOG.error(...))` handlers at lines 522/726/792/886 will themselves throw a `ReferenceError` the moment an audit write fails, converting a recoverable logging path into a silent black hole over the audit trail. This is the single most important finding in the set and is a one-line fix.
- **Two authorization gaps** (SEC-T1, SEC-T2): re-verified. The BNAC config router (line 2677) and the admin-bridges attachment router (line 2524) mount with `requiresAuthentication` + CSRF but **no scope/admin check**, so any authenticated view/manage user can mutate environment config and documents. Real privilege-escalation surface for a NSW government system.
- **Two EAM schema asymmetries** (EAM-T1/T2): re-verified. `eamLastSyncAt` is present on Bridges (132), Restrictions (224), Inspections (312) but **missing on BridgeCapacities (after 233) and BridgeDefects (after 336)** — additive, nullable, safe.
- **Zero integration-test coverage on the highest-risk code paths** (OPS-T3): the bulk upload / mass-edit handlers — the exact class of code where the historical SELECT/UPDATE import bug lived — have no test. 102 unit tests exist but none exercise these handlers end-to-end.

None of these require architectural surgery. The grade does **not** advance to A‑ today because a P1 that breaks audit observability and two unguarded mutation routers are, individually, gate-blockers for a public-infrastructure system regardless of how strong the surrounding domain logic is. **Clear the P1 cluster (est. 2–3 engineer-days) and this is an A‑.**

---

## 2. Lens Scorecard

| Lens | B+ Baseline | **New Grade** | Justification |
|---|---|---|---|
| **Architecture** | B | **B‑** | Domain logic is sound, but ARCH-T1/T3 (`LOG` undefined → audit-write errors throw silently) is a live latent defect I confirmed in source. ARCH-T4 (2843-line god-file `server.js`) and ARCH-T5 (45+ catch blocks that swallow errors without logging) are maintainability debt. ARCH-T2 (`error.message.includes` with no type guard, line 1820) confirmed. Net regression-of-confidence on the hosting layer despite strong handlers elsewhere. |
| **Config / Correctness** | B+ | **B+** | Held. Config discipline was the prior win and survives. Residual is real but bounded: 5 hardcoded payload/row/retention limits (CONFIG-T1–T5) that should read `SystemConfig`, and a GISConfig fallback literal (CONFIG-T2). All P2/P3, none affect correctness of output — they affect tunability. |
| **Risk / ISO 55000** | A‑ | **A‑** | Strongest lens. Mode-aware consequence scoring and calibration governance are implemented and config-driven. Residual is transparency/governance polish: RiskBand sign-off columns not seeded (RISK-T1), likelihood→prob proxy not yet in `RiskConfig` (RISK-T2), and EV lacks a benefit-cost/ROI decision field (RISK-T4). These are ISO 55000 §6 maturity items, not methodology defects. |
| **EAM** | B+ | **B+** | Coverage is broad and correct. Held back by two missing `eamLastSyncAt` fields (EAM-T1/T2, re-verified) breaking the symmetric sync-audit pattern, no enum constraint on sync-status/mode (EAM-T4), and the missing dedicated `integration` scope (EAM-T5). All additive/declarative. |
| **Inspection / NSW** | B+ | **B+** | NSW Level-2 element model is in place. Residuals are UX-surfacing of existing data: defect `status` comment missing `OnHold` (INSPECT-T1), `element` and `status` lack value-list/ValueList annotations (INSPECT-T2/T3), EAM-OTEIL not shown in element value-help (INSPECT-T4). Data correct; selection UX incomplete. |
| **GIS** | A‑ | **A‑** | CRS export fix from prior round holds — this was a key win. Residuals are defensive validation: custom WMS layers lack CRS/extent validation (GIS-T2/T5) and EPSG codes aren't allow-list-checked before GeoJSON export (GIS-T3). Hardening, not correctness. |
| **Fiori UX** | B | **B** | Bridge Elements app landed. But FE_UX-T2 is flagged **P0** (BridgeDefects actions missing `Common.SideEffects` → stale UI after deactivate/reactivate), plus missing element value-help (FE_UX-T1), parent_ID hierarchy value-help (FE_UX-T4), and an orphaned CapacityEnvironment FieldGroup (FE_UX-T5). Pattern-consistency gaps against the app's own conventions. |
| **Accessibility / i18n** | B‑ | **B‑** | Weakest lens, unchanged. Three P1 i18n violations: `gisMapInit.js` (10+ hardcoded strings), `GISConfig.controller.js` (~20), `GISConfig.view.xml` (15+) — all violate CLAUDE.md rule #6. Plus WCAG 4.1.3 status-message gap on the map coord bar (FREE_UX-T4). This blocks any AA accessibility certification and bilingual readiness. |
| **Security** | B | **B‑** | Two P1 authorization gaps re-verified in source (SEC-T1 BNAC, SEC-T2 attachments) — unguarded mutation routers are the most serious class of finding for a gov system. Plus GeoJSON DoS/validation gaps (SEC-T3/T4) and correlation-ID not propagated to log context (SEC-T5). Downgraded one notch on the authz findings. |
| **Tests / Ops** | B | **B‑** | 102 unit tests is respectable, but OPS-T3 (P1) — zero integration coverage on bulk upload/mass-edit, the exact path of the historical import bug — is a real gap. Compounded by OPS-T2 (no pessimistic row-lock in mass-edit under HA) and OPS-T4 (`instances: 1`, re-verified — single point of failure for a public-infra SLA). |

---

## 3. Regression Check

**No functional regressions detected against the B+ baseline.** All prior wins were re-verified or remain claimed-fixed:

- GIS CRS export fix — **holds** (GIS lens still A‑; residuals are new hardening items, not regressions).
- EAM coverage on Inspections/Restrictions/Capacities — **holds**; EAM-T1/T2 are *pre-existing* asymmetries surfaced by deeper inspection, not newly introduced.
- Condition-mapping correctness fix — **holds** (not contradicted by any surviving finding).
- Config discipline — **holds**; CONFIG-T1–T5 are residual hardcodes that pre-date and survived the prior round, not new ones.

**One latent-defect caveat (not a regression but worth board attention):** ARCH-T1/T3 (`LOG` undefined) is a *dormant* defect — it only fires on audit-write failure, so it would not have shown up in green-path testing or the prior audits. It is a gap in observability that was always present, now identified. **Regression status: NONE.**

---

## 4. Residual Roadmap to A+

Effort key: **S** ≤ 0.5 day · **M** ≤ 1.5 days · **L** > 1.5 days.

### P0 — Fix before next release (UI correctness)
| ID | Item | Effort |
|---|---|---|
| FE_UX-T2 | Add `Common.SideEffects` to BridgeDefects deactivate/reactivate actions so UI refreshes `active`/`status` without manual reload | **S** |

### P1 — Gate-blockers for A‑ (must clear to advance the grade)
| ID | Item | Effort |
|---|---|---|
| ARCH-T1 / ARCH-T3 | Define `const LOG = cds.log('server')` (or use `_bootLog`) — fixes the live audit-write `ReferenceError` at lines 522/726/792/886 | **S** |
| SEC-T1 | Add `requiresAdmin` middleware to `/bnac/api` router (line 2677) | **S** |
| SEC-T2 | Add explicit `manage`/`admin` scope check (or remove direct-DB Express route in favor of OData) on admin-bridges attachment API | **S** |
| EAM-T1 | Add `eamLastSyncAt : Timestamp;` to BridgeCapacities (after line 233) | **S** |
| EAM-T2 | Add `eamLastSyncAt : Timestamp;` to BridgeDefects (after line 336) | **S** |
| OPS-T3 | `test/bulk-operations.test.js` — integration tests for mass-upload/mass-edit incl. rollback, etag conflict, audit-write-failure (target 80% on `upload.js`/`mass-edit.js`) | **M** |
| FE_UX-T1 | BridgeDefects `element` field value-list → BridgeElements filtered by bridge_ID (element-level EAM traceability) | **M** |
| FREE_UX-T1/T2/T3 | i18n the embedded map + GISConfig controller/view (~45 hardcoded strings) — blocks AA/bilingual cert | **M–L** |

**P1 subtotal to A‑: ~2–3 engineer-days for the schema/auth/log fixes; +2–3 days for OPS-T3 + i18n.**

### P2 — A‑ → A (hardening, governance, consistency)
| ID | Item | Effort |
|---|---|---|
| ARCH-T2 | Type-guard `error.message` in proximity handler (line 1820) | S |
| ARCH-T5 | Log-before-respond in 45+ catch blocks with correlation ID | M |
| CONFIG-T1/T3/T4/T5 | Move payload/row/retention/upload limits to `SystemConfig` | M |
| CONFIG-T2 | GISConfig fallback literals → `SystemConfig` keys | S |
| RISK-T1 | Seed RiskBand sign-off columns (reviewedBy/At/Source) + surface in admin FE | S |
| RISK-T2 | `RiskConfig` prob_1..5 factors driving EV proxy | M |
| RISK-T4 | Benefit-cost / ROI derived field on BridgeRiskReport + METHODOLOGY.md | M |
| EAM-T4 | Enum types/`@assert` on eamSyncStatus & eamSyncMode | S |
| EAM-T5 | `integration` scope + BMS_INTEGRATION role in xs-security.json | S |
| INSPECT-T1/T2/T3/T4 | Defect status comment + value-lists; OTEIL display in element value-help | M |
| GIS-T2/T3/T5 | WMS CRS/extent validation; EPSG allow-list before GeoJSON export | M |
| SEC-T3/T4 | GeoJSON size cap + OData UPDATE validation hook | S |
| SEC-T5 | Propagate correlationId into CDS log context | S |
| FE_UX-T3/T4/T5 | Inspection FieldGroup split; parent_ID value-help; CapacityEnvironment facet | M |
| FREE_UX-T4/T5 | `aria-live` on map coord bar; i18n map-view panel-toggle tooltip | S |
| OPS-T2 | `.forUpdate({ wait })` row-locking in mass-edit/upload | M |
| OPS-T4 | mta extension: `instances ≥ 2` for prod; document in RUNBOOK | S |

### P3 — A → A+ (transparency, polish, documentation)
RISK-T3 (document RUL as planning proxy; flag material-aware variants as future), RISK-T5 (risk-score-breakdown projection / object-page explanation), ARCH-T4 (decompose `server.js` god-file into `/srv/handlers/*` — **L**, do last), INSPECT-T5 (warn/document silent-null when AssetClassStrategy absent), CONFIG/UX cosmetic items.

### Items correctly delegated to SAP EAM (do NOT build in-app)
The following are **boundary-correct** — they reference SAP S/4 EAM as system-of-record and should remain integration points, not re-implementations:
- **EAM-T5** — the `integration` scope exists precisely to separate EAM-sync operators from app admins; this is a security-boundary alignment, not a feature to absorb. ✔ delegate.
- **EAM sync execution, work-order lifecycle, notification/maintenance-order processing** — owned by S/4 EAM. The app correctly limits itself to `eamSyncStatus`/`eamLastSyncAt`/`eamOteil` reference fields and EAMSyncLog. EAM-T1/T2/T4 only ask the app to keep its *reference* fields symmetric and validated — they do **not** ask it to own EAM logic. ✔ correct boundary.
- **RUL as design-life** (RISK-T3) — explicitly *not* to be modeled as engineering design life in-app; it stays a planning proxy, with detailed degradation modeling deferred to specialist/EAM downstream. ✔ delegate.

---

## 5. SAP Certification & ISO 55000 Readiness

### SAP BTP / Fiori / CAP readiness
| Criterion | Status | Gating item |
|---|---|---|
| CAP service architecture & OData contract | **Met** | — |
| Fiori Elements annotation completeness | **Partially met** | FE_UX-T2 (P0 side-effects), FE_UX-T1/T4 value-helps must close for a clean Fiori-conformance review |
| xs-security scope model | **Gated** | EAM-T5 (`integration` scope) + SEC-T1/T2 (unguarded routers) — scope model is **not** internally consistent until these land |
| i18n completeness (SAP requirement) | **Not met** | FREE_UX-T1/T2/T3 — ~45 hardcoded strings violate CLAUDE.md rule #6; blocks any localization sign-off |
| Accessibility (WCAG 2.1 AA, SAP-mandated) | **Not met** | FREE_UX-T4 (status-message a11y) + i18n dependency |
| HA / production resilience | **Gated** | OPS-T4 (`instances: 1` re-verified) — must be ≥ 2 for prod |

**Verdict:** SAP technical-conformance review is **achievable but not yet passable** — gated on the security-scope consistency (SEC-T1/T2, EAM-T5), i18n (FREE_UX-T1–T3), and the P0 side-effects fix. None are architectural; all are closable within the P1/P2 roadmap.

### ISO 55000 readiness
| Clause area | Status | Notes |
|---|---|---|
| §6 Risk-based asset planning (methodology) | **Met (internal)** | Mode-aware consequence scoring, calibration governance, condition mapping all sound — strongest area. |
| §9 Calibration sign-off / audit trail | **Partially met** | RISK-T1 (sign-off columns unseeded) + RISK-T2 (prob proxy not config-governed) must close for a clean governance trail. |
| Decision-support / capital-planning transparency | **Partially met** | RISK-T4 (ROI/benefit-cost field) and RISK-T5 (score decomposition) are the maturity gap between "defensible" and "auditor-transparent." |
| Audit-trail integrity (EAM + change-log) | **At risk until ARCH-T1 fixed** | The undefined-`LOG` defect undermines audit-write observability — an ISO 55000 audit-trail integrity reviewer would flag this. **Must fix.** |

**Verdict:** ISO 55000 *methodology* readiness is **met internally** and is the program's strongest asset. Formal certification is **gated on external audit** and requires: (1) ARCH-T1 fixed (audit-trail observability), (2) RISK-T1/T2 calibration sign-off seeded and config-governed, (3) RISK-T4/T5 transparency for the external assessor. **These are evidentiary/governance items, not redesigns.**

---

## 6. Confidence & Caveats

- **Confidence: High on the 7 spot-verified findings.** I independently re-confirmed in source: ARCH-T1/T3 (`LOG` undefined — only `_bootLog`/`cds.log` exist), ARCH-T2 (unguarded `error.message.includes`, line 1820), SEC-T1 (BNAC router, line 2677, auth+CSRF only), SEC-T2 (admin-bridges router, line 2524, no scope check), EAM-T1/T2 (`eamLastSyncAt` absent on Capacities/Defects, present on the other three), and OPS-T4 (`instances: 1`). These are not speculative.
- **Confidence: Medium-high on the remaining 38**, inherited from 3-vote verification. Two findings carry **2/3 votes** (CONFIG-T2, EAM-T5, RISK-T3, INSPECT-T5, SEC-T2, FE_UX-T2, FE_UX-T3, OPS-T4, plus the 2/2 FREE_UX-T3/T5) — these are genuine but slightly lower-consensus; treat severity as indicative.
- **Caveat — severity of FE_UX-T2 (P0):** flagged P0 but carries only 2/3 votes. It is a real UX-staleness bug, not data corruption; I concur it must fix before release but note it is "P0 user-visible-defect," not "P0 outage."
- **Caveat — no runtime/dynamic testing performed** in this audit; verification was static (source inspection + structural confirmation). The ARCH-T1 defect is dormant by nature (fires only on audit-write failure), which is precisely why it survived prior green-path audits — a runtime fault-injection test (part of OPS-T3) would surface it.
- **Caveat — test count:** 102 unit tests is accurate, but coverage is **uneven** — strong on risk/restrictions/dq-rules, **absent** on the bulk handlers (OPS-T3). Headline count overstates safety on the highest-risk paths.
- **No findings were invented.** Every item in this report maps to a verified finding ID from the 45-item set; the 5 refuted/confirmed-fixed items were excluded.

**Bottom line for the board:** v3.9.3 is a strong B+ with an A‑ within reach for roughly 2–3 engineer-days of concentrated, low-risk P1 work — fix the audit-log `LOG` defect, lock down the two unguarded routers, restore the two EAM timestamp fields, and stand up bulk-operation integration tests. The domain core (risk, GIS, NSW condition mapping) is already certification-grade; the gap to A‑/A is hygiene and governance evidence, not architecture.

---

## Post-audit gate-blocker remediation (v3.9.4 + tests)
All SIX P1 gate-blockers the council named as the path to A- are now CLOSED:
- ARCH-T1/T3 — `const LOG = cds.log('bms')` defined in server.js (audit-write ReferenceError fixed).
- SEC-T1 — BNAC config router now `requiresScope('admin')`.
- SEC-T2 — admin-bridges attachment router now `requiresScope('manage')`.
- EAM-T1/T2 — symmetric `eamLastSyncAt` restored on BridgeCapacities + BridgeDefects.
- OPS-T3 — real cds.test integration coverage for the bulk mass-edit path (condition correctness + durable MassEdit audit + row-failure + range validation). 105 tests pass.

Residual P2 (A- -> A) and P3 (A -> A+) items are governance/UX/i18n polish, not architecture — see roadmap above.
