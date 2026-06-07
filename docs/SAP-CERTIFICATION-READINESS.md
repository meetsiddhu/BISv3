# SAP Certification & Client-Deployment Readiness — BIS v3.9.3

> Honest readiness assessment for **SAP Store listing** ("Built on SAP BTP" /
> "SAP Certified — Integration with SAP S/4HANA") and **client-environment deployment**.
> **Important:** the certificates themselves are issued by SAP after *their* formal review
> and automated scans — this document tracks whether the application **meets the criteria
> to be submitted**. Legend: ✅ met · ◑ partial · ⛔ gap · 🔒 external (SAP-issued).

---

## 1. Built on SAP BTP — technical foundation

| Criterion | Status | Evidence |
|---|---|---|
| Runs on BTP Cloud Foundry, multi-module MTA | ✅ | `mta.yaml`: srv (CAP/Node20) + db (HDI) + approuter + 8 html5 apps |
| Uses BTP services correctly | ✅ | XSUAA, HANA Cloud (hdi-shared), Destination, HTML5-apps-repo, App-Logs |
| HANA Cloud as the database | ✅ | additive schema; HDI deployer; CSV seed |
| Standalone approuter + FLP launchpad | ✅ | `app/router`, inlined sandbox config, role-gated tiles |
| OData V4 / CAP programming model | ✅ | `@sap/cds` v9, Fiori Elements V4, draft-enabled |
| No hardcoded secrets in repo | ✅ | XSUAA-bound; secret scan clean |
| Config-driven (no magic literals) | ✅ | `SystemConfig`/`GISConfig`/`DataQualityRules`; geodesy/upload/CRS config-driven |
| Health check / observability | ✅ | `/health`, correlation-id, `cds.log`, uncaught-exception net |
| High availability | ◑ | code is stateless; prod must set `instances: ≥2` (dev trial is single + auto-stops) |
| CI/CD pipeline | ✅ | `.github/workflows/ci.yml` + `deploy.yml`; ⛔ secrets not configured by client yet |

## 2. Security & compliance

| Criterion | Status | Evidence |
|---|---|---|
| XSUAA auth on every entity | ✅ | `@restrict` view/manage/admin throughout `admin-service.cds` |
| Role-based authorization | ✅ | 3 scopes + role collections in `xs-security.json` |
| CSRF protection | ✅ | enforced in all environments (SEC-2) |
| Injection-safe | ✅ | parameterised queries; identifier allow-lists (SEC-1, SEC-R4) |
| No PII leakage | ✅ | debug endpoint admin-locked, PII excluded (SEC-5) |
| Audit trail on every change | ✅ | `ChangeLog` durable (bulk failures fail the op) |
| Input validation | ✅ | field/enum/range/GeoJSON validators |
| Secure communication | ✅ | HTTPS approuter; forwardAuthToken; Principal-Propagation-ready destination |
| Penetration / SAST scan | 🔒 | run SAP's required scan at submission |

## 3. Integration with SAP S/4HANA EAM (clean core)

| Criterion | Status | Evidence |
|---|---|---|
| Complements S/4 (no core modification) | ✅ | side-by-side BTP app; reference-only links; boundary locked in CLAUDE.md |
| No replication of EAM execution | ✅ | no parallel work-order/maintenance-plan/valuation engine |
| Integration via config (no hardcoded maps) | ✅ | `EAMFieldMapping` + `EAMCodeMapping` |
| Integration audit trail | ✅ | `EAMSyncLog` (append-only) |
| Released-API integration runtime | ◑ | scaffolded (Destination + reference fields); ⛔ live sync needs S/4 endpoint + released OData/SOAP APIs wired |

## 4. UX / accessibility / i18n

| Criterion | Status |
|---|---|
| SAP Fiori design language (FE V4) | ✅ |
| i18n for user-facing strings | ◑ (FE + map-view done; gisMapInit/GISConfig dialog residual) |
| WCAG 2.1 AA | ◑ (role/aria/labels present; formal axe pass outstanding) |
| Responsive (desktop/tablet) | ✅ |

## 5. Quality & documentation

| Criterion | Status | Evidence |
|---|---|---|
| Automated tests | ✅ | 102 unit tests (Node 20); CI gate |
| Engineering contract / rules | ✅ | `CLAUDE.md` (locked architectural rules) |
| Functional + field documentation | ✅ | `docs/FUNCTIONALITY-AND-FIELDS.md` |
| Standards capability audit | ✅ | `docs/STANDARDS-CAPABILITY-AUDIT.md` |
| Risk methodology | ✅ | `docs/risk-model/METHODOLOGY.md` |
| Defect register / audit history | ✅ | `docs/defects.md`, `docs/COUNCIL-*` |
| Runbook | ✅ | `docs/RUNBOOK.md` |
| Integration/e2e + concurrency tests | ◑ | unit coverage strong; e2e/etag tests outstanding |

---

## 6. Submission checklist (what the client/partner must do)

1. **Configure CI/CD secrets** (CF_API/ORG/SPACE/USER/PASSWORD) so `deploy.yml` runs.
2. **Set prod HA** (`instances: 2`, rolling deploy) in a paid space (not the trial).
3. **Wire the S/4 EAM destination** (released APIs + Principal Propagation) and exercise sync.
4. **Run the formal WCAG axe audit** + remediate residual i18n.
5. **Run SAP's required security/SAST scan** at submission.
6. **Submit to SAP** for the "Built on SAP BTP" / "Integration with SAP S/4HANA" certification (🔒 SAP-issued).
7. Provide the ISO 55001 evidence pack to the client's accredited auditor (🔒 externally certified).

**Bottom line:** the application is **technically deployable to a client environment today**
(standalone) and is **submission-ready** for SAP-BTP certification once items 1–6 are
completed by the client in their paid landscape. It cannot be self-declared "SAP Certified"
or "ISO 55001 certified" — those marks are issued by SAP / accredited bodies.
