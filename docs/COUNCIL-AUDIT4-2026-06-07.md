# Fourth Comprehensive Adversarial Audit — BIS v3.9.12 → v3.9.14

> **Date:** 2026-06-07 · **Method:** multi-lens adversarial council (367 agents, 11 lenses,
> finder → 3-vote verification → board synthesis) cross-checked against live source.
> **Verdict artifact:** this file. **Remediation:** v3.9.14 (this commit).

---

## 1. Overall grade: **A−** (held; not yet A)

The product is strong and on a verifiable upward trajectory (C+ → B+ → B+ → A− → **A−**).
The post-A− cycle delivered real, git-confirmed engineering: EAM integration scaffold + enum
validation, risk ROI/benefit-cost with config-governed probability and band sign-off, full
GIS + GISConfig i18n (~55 strings) with WCAG aria-live, removal of the deprecated UI5
`synchronizationMode`, extraction of `geo-compute` + `csv-export` from the god-file (+tests),
and the closure of two real pre-existing GIS proximity bugs.

The grade was **held at A−, not raised to A**, because the audit surfaced a **new risk-engine
P0** (NaN propagation) plus a cluster of confirmed **security P1s** (missing scope on three
privileged custom routers; fire-and-forget mass-edit audit) and **audit-trail P1s** (mass
risk recalc + soft-delete bypassing ChangeLog). An A-grade asset system cannot ship a risk
core that can emit `NaN`, nor privileged bulk routers without scope authorization.

**Bar to clear A (per the board):** close the risk-engine P0/P1 correctness items, the security
P1 scope/durability items, and the recalcRisk audit-trail P1 — *all in-app, ~one sprint.*
**This commit (v3.9.14) closes that exact bar.** See §4.

---

## 2. Per-lens scorecard (council grades)

| # | Lens | Grade | Notes |
|---|------|:---:|---|
| 1 | ISO 55000/55001 asset management | A− | spirit met; governance items (audit on mass recalc, mandatory override reason) — **closed in v3.9.14** |
| 2 | SAP S/4HANA EAM complement boundary | **A** | cleanest lens — reference-linkage, no valuation/scheduling engine, soft-delete, config-mapping all verified correct |
| 3 | NSW/TfNSW + Austroads bridge mgmt | B+ | TfNSW 1–5 SSOT, GDA2020, AS 5100 present; gaps = NHVR/PBS mutual validation, classification codelist, element roll-up |
| 4 | International bridge mgmt standards | B+ | transparent linear RUL proxy (documented), no Markov deterioration / network optimization yet |
| 5 | Cybersecurity / OWASP / gov-grade | B→**B+** | fundamentals solid; scope + durability gaps **closed in v3.9.14** |
| 6 | Code modularity / maintainability | B | server.js still ~2,780 LOC (god-file); silent catch; trajectory right |
| 7 | Product mgmt / fitness-for-purpose | B+ | core flows verified; gaps = operationalization (auto risk-on-inspection, EAM plan handoff) |
| 8 | UI/UX / Fiori / accessibility / i18n | B− | **weakest lens**; legend contrast, locale config, map-view i18n, draft model |
| 9 | SAP BTP / CAP certification readiness | A− | 19 green confirmations; residual = single-instance/no-HA, env memory overrides |
| 10 | Risk engine correctness & transparency | B→**A−** | NaN P0 + out-of-range EV **closed in v3.9.14** |
| 11 | Data quality / observability / ops | A− | strong; soft-delete audit gap **closed in v3.9.14** |

**Composite: A−.** Lenses 6 and 8 are now the primary drag.

---

## 3. Are the user-named angles met?

| Angle | Verdict |
|---|---|
| **ISO 55000** | Mostly → **stronger after v3.9.14** (mass-recalc now audited; override reason now mandatory). 55001 *certificate* is an external org audit. |
| **SAP EAM complement** | **Yes** — verified reference-based, no replication. |
| **NSW (TfNSW/Austroads/AS 5100)** | Substantially — codelists + NHVR/PBS cross-validation remain. |
| **International standards** | Partially — planning-grade; deterioration/network-optimization are future modules (documented, no false precision). |
| **Multi-modal** | Partial — mode-aware risk + restriction model present; PBS-lane enforcement pending. |
| **Cybersecurity** | **Closed the gating P1s in v3.9.14** (scope on all privileged routers, durable audit, prod-locked CSRF). |
| **Modularity** | Improving — god-file split is the main open item (P1-001). |
| **Product fitness** | Mostly — operationalization items remain. |
| **UI/UX** | Weakest — partially met; the longest road to A+. |
| **SAP CAP cert readiness** | Near-complete (19 confirmations); HA is the one P1. |

---

## 4. Remediation delivered in v3.9.14 (this commit)

Every confirmed in-app item the board named as "the bar to clear A":

| Audit ID | Sev | Finding | Fix |
|---|:---:|---|---|
| **RISK P0-001** | **P0** | `weightsFromConfig` ingested weights with no finite guard → one malformed `RiskConfig` row emits **NaN** risk score on every bridge | finite-guard at source (skip blank/non-numeric, fall back to default) **+ defense-in-depth** sanitization in `deriveRisk`; +2 unit tests |
| **RISK P2-001** | P2 | `expectedValueAud` returned **0** for out-of-range likelihood, masking a data error as a real EV | returns `null` (insufficient/invalid data); +1 unit test |
| **SEC-001** | P1 | `/mass-upload/api` + `/mass-edit/api` enforced auth+CSRF but **no scope** | `requiresScope('manage')` added to both |
| **SEC-002** | P1 | `/attributes/api` bulk mutation had no scope | `requiresScope('manage')` threaded into `mountAttributesApi` (GET stays open) |
| **SEC-003** | P1 | mass-edit ChangeLog writes were **fire-and-forget after commit** → un-audited mutation on audit-write failure | audit writes moved **inside the transaction** (atomic, fail-loud) across all 3 mass-edit save paths |
| **SEC-005** | P2 | `CSRF_PROTECTION_DISABLED` honoured in **any** environment | opt-out now ignored when `NODE_ENV=production` |
| **ISO-AUDIT-001** | P1 | `recalcRisk` mass-updated every bridge's risk fields with **no ChangeLog** (rule-3 bypass) | per-bridge ChangeLog (changed bridges only) under one batch, `source='Calibration'` (added to durable bulk sources) |
| **ISO-AUDIT-002** | P1 | risk override allowed with **no reason** | `riskOverrideReason` now mandatory when `riskOverride=true` (ISO 55001 governance) |
| **OPS-1** | P1 | Bridges/Restrictions **deactivate/reactivate** wrote no audit trail | ChangeLog on all four handlers (matches the BridgeRestrictions pattern) |
| RISK P2-002 / P3-002 / P3-001 | P2/P3 | undocumented thresholds | documented in code (AADT >10k boundary, default-likelihood-3, maxScore informational) |

**Verification:** 12/12 test suites, **119 tests** pass (Node 20); `npx eslint .` = **0 errors**;
`npx cds build` completes.

---

## 5. Remaining roadmap to a clean A → A+ (all in-app)

- **Lens 6 (modularity):** continue `server.js` decomposition below ~800 LOC; remove the
  silent catch in custom-attribute export; CDS-QL the hardcoded proximity SQL.
- **Lens 8 (UI/UX — longest road):** accessible/contrast-compliant map legend; populate
  `supportedLocales`/`fallbackLocale`; map-view i18n; complete the GISConfig draft model;
  align app versions.
- **Lens 3 (NSW):** NHVR/HML/PBS mutual validation; bridge-classification codelist;
  element-level condition roll-up; posting-status/effective-date enforcement in filtering.
- **Lens 9 (BTP cert):** multi-instance HA; env-specific memory overrides.
- **Lens 4 (international):** Markov/condition-state deterioration; network-level portfolio
  optimization; explicit AASHTO/PIARC mapping doc.

## 6. External (cannot be closed by code in this repo)

- **SAP Store / SAP-certified listing** — SAP partner certification + security scan.
- **ISO 55001 certificate** — accredited third-party audit of the *organization's* AMS.
- **Formal WCAG 2.1 AA attestation** — independent axe/AT audit + published VPAT/ACR.
- **IRAP / gov-grade security accreditation** — external assessor (SEC closure is the precondition).
- **Independent load-rating / engineering sign-off** — domain validation outside software.

**Bottom line:** v3.9.14 closes the entire in-app "bar to clear A" the board named. The
remaining drag to A+ is concentrated in modularity (the god-file) and UI/UX accessibility —
both in-app, neither blocking, and the next logical sprints.
