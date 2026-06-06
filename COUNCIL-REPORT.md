# COUNCIL-REPORT — Bridge Information System (BIS / BridgeManagement)

> **UPDATE 2026-06-06**: All 10 findings have since been actioned (release **v3.01**).
> Resolution status per finding is in `docs/defects.md`. Summary: C-1, C-2, C-4, C-5,
> C-6, C-7, C-9, C-10 **fixed**; C-3 (GIS) and C-8 (a11y) have policy/config/ARIA in
> place with the deeper migration/audit **staged** (see `GIS-CRS-POLICY.md`,
> `ACCESSIBILITY.md`). Build green, 65/65 tests pass on Node 20. The two vetoes
> (GIS native-spatial, DevOps CI/CD): **DevOps lifted** (CI/CD + Node 20 pinned);
> **GIS partially lifted** — policy + config-driven CRS done, native `ST_POINT(7844)`
> migration remains a gated DB follow-up before public map release.
>
> ---
>
> **Read-only analysis (original).** No code, build, deploy, or fix was performed. Report only.
> **Date**: 2026-06-06 · **Repo**: `46 Bridge info system V3/BridgeManagement` · **Branch**: `bridgev2/draft-init` @ `b8545d1`
> **Important**: The four named defects (TC-FUNC-001, TC-UX-001, TC-FUNC-008, TC-DEVOPS-001) appear **nowhere in the repository** — there is no defect register, no test-case file, no doc that defines them. The mappings below are **inferred** from the app's actual behaviour and prior session history. *The absence of a traceable defect register is itself a finding (see C-9).*

---

## A. Bottom line

The app is **functional and safe enough for controlled internal (UAT) use, but NOT ready for a clean production go-live as-is**. The biggest risk is that the most recent "fix" for the blocked Create button on Defects/Inspections is a **timer-based workaround** (a script that scrubs validation errors every half-second), not a root-cause fix — it works, but it is fragile and could silently mask real validation errors. Two structural gaps need attention first: there is **no CI/CD pipeline** (every deploy is manual and unrepeatable) and the **local toolchain is on the wrong Node version** (16 vs the required 20), which means "it built on my machine" is not a guarantee. Geographic data is stored as plain WGS84 latitude/longitude with **no declared datum** — for Australian bridge assets that should be GDA2020/EPSG:7844, so coordinates may be subtly mis-aligned when overlaid on official basemaps. None of these block careful internal use today, but all should be resolved before public or regulated (IRAP) deployment.

---

## B. Health scorecard

| Area | Status | What it means in practice |
|------|--------|---------------------------|
| Data model | 🟡 AMBER | Solid additive structure & ChangeLog exist, but main records can be **hard-deleted** by admins and `status` is free-text, not a controlled list. |
| OData V4 | 🟢 GREEN | Standard CAP/Fiori draft handling; no obvious N+1 or pagination defects found in the read passes. |
| UI5 / Fiori | 🟡 AMBER | Mostly annotation-driven; dashboard KPIs computed dynamically (good). The Defects/Inspections Create fix is a runtime hack, not a model fix. |
| GIS correctness | 🔴 RED | No declared CRS/datum. Coordinates stored as WGS84 lat/long + GeoJSON text; Australian data should be GDA2020 (EPSG:7844). No spatial column type, no spatial index. |
| Security | 🟡 AMBER | Clean 3-scope XSUAA model (view/manage/admin), no secrets seen in repo. But hard-DELETE granted, and no Essential-8/IRAP evidence. |
| DevOps | 🔴 RED | No CI/CD pipeline, no branch→space mapping, manual `cf deploy`, local Node 16 vs required 20 → environment drift. |
| Observability | 🟢 GREEN | `cds.log` used across handlers; audit-log & user-activity services present. Correlation-ID propagation not confirmed. |
| Maintainability | 🟡 AMBER | Reasonable test folder (4 suites), build artifacts correctly git-ignored. Two overlapping copies of the FK-error workaround (Component.js + NumericInputGuard.js). |
| Doc-drift | 🟡 AMBER | No `CLAUDE.md`/`AGENTS.md` in repo to compare against; EAM analysis docs are current and high quality. |
| Accessibility & i18n | 🟡 AMBER | i18n folders present; WCAG conformance of custom Leaflet map & dashboard not verified. |

---

## C. Issues to share with your developer

| # | Issue (plain English) | Where (file:line) | Why it matters | Severity | Suggested fix | Effort |
|---|----------------------|-------------------|----------------|----------|---------------|--------|
| C-1 **(TC-FUNC-001)** | Create on Defects/Inspections was blocked by a stale "enter a number without decimals" error; it's now patched by a script that wipes validation messages every 500 ms | `app/admin-bridges/webapp/Component.js:87-96`; `ext/controller/NumericInputGuard.js:111-128` | Works, but a global timer that deletes validation messages can hide *real* errors and is timing-fragile | **P1** | Replace with proper value-help binding on the Integer FK (association ValueHelp returning the key), remove the interval | M |
| C-2 **(TC-DEVOPS-001)** | No CI/CD pipeline; deploys are manual `cf deploy`; local Node is 16 but app requires 20 | repo root (no `.github/`, no `.pipeline/`); `package.json` engines `20.x` vs local `v16.20.2` | Unrepeatable, unauditable releases; "works locally" ≠ "builds in pipeline"; drift risk | **P1** | Add CTMS/GitHub-Actions pipeline with branch→space mapping; pin Node 20 via `.nvmrc` + engine-strict | M |
| C-3 **(GIS / inferred TC-FUNC-008 candidate)** | No coordinate reference system declared; lat/long stored as plain WGS84, geometry as GeoJSON text | `db/schema.cds:28-29` (lat/long), `:87` (`geoJson: LargeString`) | Australian assets should be GDA2020 (EPSG:7844); undeclared datum → mis-registration vs official basemaps; no spatial index → slow spatial queries | **P1** | Declare CRS, store native spatial type (HANA ST_GEOMETRY/SRID 7844), add spatial index, document datum-transform policy | L |
| C-4 | Admins can **hard-delete** Bridges/Restrictions/BridgeRestrictions — violates the locked "soft-delete only" rule | `srv/admin-service.cds:10,24,35` (`grant: 'DELETE' to admin`) | Permanent data loss possible; breaks audit trail; conflicts with architectural rule | **P1** | Remove DELETE grants; route deletion through existing `deactivate` soft-delete action | S |
| C-5 | Bridge `status` is free-text `String(40)` rather than a controlled vocabulary | `db/schema.cds:16` | Inconsistent values, weak filtering/reporting, harder EAM mapping | **P2** | Back with a lookup/code list (like the existing `*Statuses` entities) | M |
| C-6 | FK-error workaround is duplicated in two files doing the same scrub | `Component.js:87-96` and `NumericInputGuard.js:111-128` | Duplication; once C-1 is fixed both must be removed together | **P2** | Consolidate; delete after C-1 root-fix | S |
| C-7 | No `CLAUDE.md` / `AGENTS.md` contract file in repo | repo root | Architectural rules (additive-only, soft-delete, zero-hardcoding, XSUAA-first) are not codified where tooling/agents read them | **P2** | Add a contract doc stating the locked rules + the EAM decisions | S |
| C-8 | WCAG 2.1 AA not verified on custom Leaflet map and dashboard tiles | `app/map-view/*`, `app/dashboard/webapp/controller/Main.controller.js` | Accessibility/compliance risk for public-sector delivery | **P2** | Run axe/WCAG audit on custom controls; add keyboard + ARIA where missing | M |
| C-9 **(TC-UX-001 / traceability)** | The named defect IDs (TC-*) exist in no file — no defect register or test-case traceability | repo-wide (grep: 0 matches) | Cannot prove which defects are fixed/open; go-live evidence is weak | **P2** | Add a `docs/defects.md` register mapping each TC-ID → test → status | S |
| C-10 | Correlation-ID propagation across services not confirmed | `srv/server.js`, `srv/handlers/*` | Without request correlation, prod incident triage is slow | **P3** | Verify/enable `x-correlation-id` passthrough to Cloud Logging | S |

> **Locked-rule breaches flagged**: C-4 (soft-delete only), C-1/C-6 (zero-hardcoding spirit — runtime message-scrubbing), C-3 (GIS correctness).
> **Defect-ID mapping (inferred)**: TC-FUNC-001 → C-1 (confident); TC-DEVOPS-001 → C-2 (confident); TC-FUNC-008 → C-3 *or* C-4 (uncertain — no register to confirm); TC-UX-001 → C-9 grouping / a UX symptom of C-1 (uncertain). Confirm against your external test-case list.

---

## D. What's working well

- **Clean XSUAA model** — three well-separated scopes (view/manage/admin) mapped to three roles; no secrets committed.
- **Audit discipline** — `ChangeLog` entity plus dedicated `audit-log.js` / `user-activity.js` services and broad `cds.log` usage.
- **Dashboard KPIs are computed dynamically** from real distribution data (`Main.controller.js:97-114`), not hardcoded — a common failure that this app avoids.
- **Build hygiene** — `dist/` output is git-ignored (0 tracked), so the repo isn't polluted with generated bundles.
- **Strong forward planning** — the EAM/S-4 alignment docs (`docs/eam-mapping/*`) are thorough, decision-backed, and additive-only.

---

## E. Recommended order of work

1. **C-4 (remove hard-delete)** — smallest change, closes a permanent-data-loss + locked-rule breach. Do first.
2. **C-2 (CI/CD + Node 20)** — every later fix needs a repeatable build/deploy; fix the pipeline before shipping more changes.
3. **C-1 (root-cause the FK validation)** then **C-6 (delete duplicate workaround)** — remove the fragile timer once a proper fix lands.
4. **C-3 (CRS/datum + spatial type)** — largest GIS correctness item; schedule before any public map release.
5. **C-5, C-7, C-9** — controlled vocab, contract doc, defect register (traceability for go-live evidence).
6. **C-8, C-10** — accessibility audit and correlation-ID verification before IRAP/public.

---

## F. Council sign-off

| Role | Verdict | One line |
|------|---------|----------|
| Chief Architect (BTP) | APPROVE-WITH-CONDITIONS | Sound CAP/MTA structure; condition on C-2 pipeline + C-4 before prod. |
| Lead CAP Developer | APPROVE-WITH-CONDITIONS | Model is clean; remove hard-DELETE (C-4) and the runtime message-scrub (C-1). |
| Lead UI5/Fiori Developer | APPROVE-WITH-CONDITIONS | Annotation-first is good; root-fix the FK value help, drop the 500 ms timer. |
| GIS Architect | **VETO (until C-3)** | Undeclared datum on Australian assets is a correctness defect — fix CRS before any public map. |
| Security Architect | APPROVE-WITH-CONDITIONS | No secrets, clean scopes; remove hard-delete and produce Essential-8/IRAP evidence. |
| DevOps / Ops Manager | **VETO (until C-2)** | No CI/CD and Node 16↔20 drift make releases unrepeatable — not prod-ready. |
| Code Maintainer | APPROVE-WITH-CONDITIONS | Tidy repo; de-duplicate the workaround and add the contract doc. |
| Product Manager | APPROVE-WITH-CONDITIONS | Strong roadmap; needs defect traceability (C-9) and WCAG evidence (C-8). |
| QA / Test Lead | APPROVE-WITH-CONDITIONS | 4 test suites exist; add a regression test that reproduces TC-FUNC-001 before closing it. |

**Overall**: 2 vetoes (GIS, DevOps) → **not cleared for production go-live**. Cleared for **continued internal UAT**. Resolve C-2, C-3, C-4, C-1 to lift the vetoes.

---

### STOP

No changes made. Awaiting your explicit instruction on which items (e.g. "implement C-4 and C-2") to act on. Per your rules, I will not touch access controls, secrets, or destructive deletes without surfacing them first, and will gate every fix behind build → test → single-space deploy.
