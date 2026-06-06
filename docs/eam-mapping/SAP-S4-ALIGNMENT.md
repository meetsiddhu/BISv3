# SAP S/4HANA EAM Alignment — Implementation Plan & Task Breakdown

> **Status**: PLAN ONLY — no code written.
> **Purpose**: Implementation blueprint for aligning the BIS v3 standalone BTP app with SAP S/4HANA EAM (clean-core), to be executed later as release **v3.01**.
> **Date**: 2026-06-06
> **Prerequisite docs**: `04-gap-analysis.md` (confirmed field/entity design), `99-open-questions.md` (12 decisions), `REPORT.md` (consolidated mapping), `05-dual-mode-design.md`, `06-third-party-references.md`.

---

## 1. Scope

This release adds the **additive, standalone-safe S/4 EAM alignment layer** to BIS. The app remains a standalone BTP app that is *compatible with* S/4HANA EAM — it does **not** require a live S/4 system to function. All new attributes are configurable by the BIS admin, and all BIS↔EAM field mappings are maintained in-app (no hardcoded mappings).

### In scope (28 changes)
- Additive EAM reference fields on 5 entities (Bridges, Inspections, Defects, Restrictions, Capacities)
- SAP Org tab fields on Bridges
- 4 new entities (EAMCodeMapping, EAMSyncLog, EAMFieldMapping, ObjectExternalRef)
- 13 SystemConfig integration keys (EAM + BNAC + GIS)
- XSUAA `integration` scope + `BMS_INTEGRATION` role
- Fiori "SAP Org" tab + read-only EAM fields + sync-mode button gating
- i18n labels for all new fields

### Out of scope (deferred — needs live S/4)
- `EAMIntegrationService` runtime sync logic (PUSH/PULL/BIDIRECTIONAL) — untestable without S/4
- BTP Destination Service configuration (Principal Propagation) — Basis/Security work
- Actual data sync, GeoJSON GIS push runtime
- BNAC data migration to ObjectExternalRef (P3, separate release window)

---

## 2. Design Decisions Reference (from 99-open-questions.md)

| OQ | Decision | Drives |
|----|----------|--------|
| OQ-01 | FLOC = location, Equipment = deck/superstructure; bridge links to either/both | `eamFlocId`, `eamEquipId`, `eamObjectType`, `sapId` |
| OQ-02 | TPLNR mastered in SAP; BIS stores free String(30), no validation | `eamFlocId` String(30) |
| OQ-03 | Restrictions ≈ Notifications; BIS is SoR | BridgeRestrictions EAM ref fields (DR block) |
| OQ-04 | "SAP Org" tab + per-bridge overrides + SystemConfig defaults | A-ORG block fields |
| OQ-05 | Inspection type codes admin-maintained in EAMCodeMapping | EAMCodeMapping entity |
| OQ-06 | Notification type via `EAM_NOTIFICATION_TYPE` (default M1) | SystemConfig key |
| OQ-07 | When integrated, Inspections/Assets mastered in SAP; Create/Edit/upload gated by sync mode; Admin "SAP Field Mapping" screen | EAMFieldMapping entity + UI gating |
| OQ-08 | Principal Propagation auth | Destination config (deferred) |
| OQ-09 | BNAC merged into ObjectExternalRef; URL per environment in config | ObjectExternalRef + BNAC SystemConfig keys |
| OQ-10 | Data-driven DQ rules for EAM completeness; admin-configurable | DataQualityRules seed |
| OQ-11 | Option 4 — full name to EAM long text; short code in PLTXT | `eamShortName` field |
| OQ-12 | Config-driven GeoJSON push; default off | `EAM_PUSH_GEOJSON`, `EAM_GIS_ENDPOINT` keys |

---

## 3. Change Inventory (28 items)

| # | Type | Entity / File | Description | Priority |
|---|------|---------------|-------------|----------|
| A1–A10 | ADD FIELD | Bridges | EAM ref block: eamFlocId, eamEquipId, eamObjectType, sapId, eamSystemId, eamSyncStatus, eamLastSyncAt, eamLastSyncBy, eamSyncDirection, eamSyncMode | P1 |
| AO1–AO4 | ADD FIELD | Bridges | SAP Org tab: eamPlant, eamCompanyCode, eamControllingArea, eamOrgUnit | P1 |
| B1 | ADD FIELD | Bridges | eamShortName (PLTXT/EQKTX 40 chars); full name → EAM long text | P2 |
| C1–C5 | ADD FIELD | BridgeInspections | eamOrderNumber, eamOrderType, eamSyncStatus, eamLastSyncAt, eamSyncMode | P1 |
| D1–D4 | ADD FIELD | BridgeDefects | eamNotifNumber, eamNotifType, eamSyncStatus, eamLastSyncAt | P1 |
| DR1–DR3 | ADD FIELD | BridgeRestrictions | eamNotifNumber, eamSyncStatus, eamLastSyncAt | P2 |
| E1–E4 | ADD FIELD | BridgeCapacities | eamMeasDocNumber, eamMeasPointId, eamSyncStatus, eamLastSyncAt | P2 |
| F1 | ADD ENTITY | (new) | EAMCodeMapping — admin code translation (bisEntity/bisField/bisValue → eamTable/eamValue) | P1 |
| F2 | ADD ENTITY | (new) | EAMSyncLog — append-only sync audit | P1 |
| F3 | ADD ENTITY | (new) | EAMFieldMapping — admin BIS↔EAM field mapping | P1 |
| F4 | ADD ENTITY | (new) | ObjectExternalRef — generic external ref (supersedes BnacObjectIdMap) | P2 |
| G1 | AMEND | ChangeLog | Document extended objectType values | P2 |
| G2 | AMEND | SystemConfig | Seed 13 integration config keys | P1 |
| G3 | AMEND | xs-security.json | Add `integration` scope + `BMS_INTEGRATION` role | P1 |

### Field detail tables
See `04-gap-analysis.md` sections 4.2–4.11c for exact CAP types, defaults, M/O, and i18n keys for every field above.

### SystemConfig keys to seed (G2)
`EAM_INTEGRATION_ENABLED` (bool, false), `EAM_SYNC_MODE` (STANDALONE), `EAM_SYSTEM_ID`, `EAM_DESTINATION_NAME`, `EAM_NOTIFICATION_TYPE` (M1), `EAM_ORDER_TYPE` (PM02), `EAM_PLANT`, `EAM_CONTROLLING_AREA`, `EAM_COMPANY_CODE`, `EAM_PUSH_GEOJSON` (bool, false), `EAM_GIS_ENDPOINT`, `BNAC_BASE_URL`, `BNAC_ENVIRONMENT_ID`.

---

## 4. Multi-Agent Execution Plan

### Pre-flight (serial, ~1 min + background HANA wait)
1. Cut branch `v3.01/eam-scaffolding` from `bridgev2/draft-init`.
2. **Kick HANA start in background** if stopped:
   `cf update-service Hanaclouddb -c '{"data":{"serviceStopped":false}}'` — poll for `update succeeded` while agents work.
3. Snapshot ground-truth files: `db/schema.cds`, `srv/admin-service.cds`, `srv/admin-service.js`, `xs-security.json`, `app/_i18n/i18n.properties`, the 8 Fiori `fiori-service.cds` files.

### Phase 1 — Parallel implementation (5 agents, worktree-isolated, ~10–12 min)

| Agent | Owns (files) | Delivers |
|-------|--------------|----------|
| **A — DB Schema** | `db/schema.cds` (sole writer) | All ADD FIELD blocks: A1–A10, AO1–AO4, B1 (Bridges); C1–C5 (Inspections); D1–D4 (Defects); DR1–DR3 (Restrictions); E1–E4 (Capacities). Additive-only, all nullable. Also appends Agent B's entities. |
| **B — New Entities** | Patch handed to Agent A | EAMCodeMapping, EAMSyncLog, EAMFieldMapping, ObjectExternalRef CDS definitions (4 entities). |
| **C — Service layer** | `srv/admin-service.cds`, `srv/admin-service.js` | Expose 4 new entities (admin-scoped); READ projections; ChangeLog objectType extension. |
| **D — Security + Config + i18n** | `xs-security.json`, SystemConfig seed (`db/data/*.csv` or seed JS), `app/_i18n/i18n.properties` | `integration` scope + `BMS_INTEGRATION` role; 13 SystemConfig keys; ~30 i18n labels. |
| **E — Fiori UI** | `app/admin-bridges/fiori-service.cds` (+ manifest if needed) | "SAP Org" tab (FieldGroup); new EAM fields as read-only on object pages; sync-mode button-gating annotation hooks. |

> **Conflict control**: Only Agents A & B touch `schema.cds`. B produces a patch block; **A is the sole writer** and appends B's entities. This is the single serialization point in Phase 1.

### Phase 2 — Merge + Build gate (serial, ~5 min)
1. Collect all 5 worktrees into the integration branch.
2. `cds build` — **hard gate**; any CDS compile error stops here.
3. If errors: a fast-fix agent loops on build output until green.
4. `npm run lint` / sanity check.

### Phase 3 — Deploy (serial, ~12–18 min — UNAVOIDABLE, not parallelizable)
1. Confirm HANA `update succeeded` (from background poll).
2. `cf deploy` MTA archive.
3. On HDI deployer failure: `cf deploy -i {opId} -a retry`.

### Phase 4 — Smoke test (serial, ~5 min)
Hard refresh for fresh XSUAA token, then:
- [ ] All 10 tiles load (no metadata break)
- [ ] Create a Bridge → new EAM fields present, save succeeds
- [ ] "SAP Org" tab visible on Bridge object page
- [ ] New config entities readable in Admin tile
- [ ] No regression on Defects/Inspections Create (stale-parse fix holds)

### Phase 5 — Tag & push
Commit → tag `v3.01` → push to both remotes (`origin/bridgev2/draft-init`, `target/main`).

---

## 5. Wall-Clock Estimate

| Phase | Best case | Realistic |
|-------|-----------|-----------|
| Pre-flight + HANA start | 1 min | 1 min (+8–10 if HANA stopped, in background) |
| P1 parallel code | 10 min | 12 min |
| P2 build gate | 5 min | 5–8 min |
| P3 deploy | 12 min | 15–20 min |
| P4 smoke test | 5 min | 5 min |
| **Total** | **~33 min** | **~40–50 min** |

**Conclusion**: 30 min is NOT achievable end-to-end including deploy. The build gate + `cf deploy` alone is ~20 min and cannot be parallelized. The *code* portion (Phase 1+2) fits in ~15–20 min via 5 agents. Recommended split: run Phase 1+2 to a green build (commit as `v3.01-rc`), then trigger Phase 3 deploy as a separate explicit go.

---

## 6. Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| HANA Cloud stopped (free tier auto-stops) → +10 min | High | Start it first, in background, before agents finish |
| CDS compile error after 5-way merge | Medium | Build gate + dedicated fix-loop agent |
| HDI migration hiccup on 40+ new fields | Low | All additive/nullable; `cf deploy -a retry` available |
| Fiori annotation breaks an object page | Low | Smoke test catches; annotations reversible |
| Two agents racing on `schema.cds` | Eliminated | B hands patch to A; A sole writer |
| XSUAA role changes need re-grant | Medium | Document role assignment step post-deploy |

---

## 7. Acceptance Criteria for v3.01

- All 28 changes applied; `cds build` green; `cf deploy` succeeds.
- App runs in **STANDALONE mode** by default (`EAM_INTEGRATION_ENABLED = false`) — zero behavioural change to existing users.
- New EAM fields visible/editable only as designed; SAP Org tab gated by integration flag.
- Admin can configure all new attributes and field mappings in-app.
- No regression across all 10 tiles (create/edit/display).
- Tagged `v3.01`, pushed to both remotes.

---

## 8. Follow-on Releases (not in v3.01)

| Release | Content |
|---------|---------|
| v3.1 | EAMIntegrationService runtime (PUSH/PULL/BIDIRECTIONAL); BTP Destination (Principal Propagation); requires live/sandbox S/4 EAM |
| v3.2 | GeoJSON GIS push runtime; DQ rule enforcement engine |
| v3.3 | BNAC → ObjectExternalRef data migration (release window + backward-compat test) |
