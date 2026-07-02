# Go-Live Readiness Review — BridgeManagement (BIS)

> Expert SME-council review for enterprise go-live. Date **2026-07-03**, against tree
> **v3.55.3** (uncommitted per-class BHI + map/contrast work in place). Reviewers (agent
> personas): Bridge/Structural Engineering, Security (CSO), Backend/Data & Reliability,
> Accessibility/Fiori-UX. Baseline: **`npm test` → 574/574 green, 68 suites, ~20 s (Node 22)**;
> `npm audit --omit=dev` → **0 vulnerabilities**; `cds build` → OK.

---

## 0. Executive summary

The application is **functionally strong and well-tested**; the backend is standards-aligned
(CAP/OData V4, XSUAA `@restrict` on every entity, audit logging, additive schema). This pass
found **one architecture-level security decision that gates production**, a set of **safe defects
that have been fixed**, and a set of **engineering-judgement / scale items to schedule**.

**Verdict: conditionally go-live ready.** The one P1 security control (§1) is now **closed in code**
(XSUAA JWT verification added to the custom Express routes, Option A); it remains **to be staged on
BTP `test` and smoke-tested before `prod`** (owner-approved deploy). Once validated on `test`, the
app is suitable for a controlled production launch; the remaining items are fast-follow or
domain-sign-off.

### What was FIXED this pass (all tested, suite green)
| # | Area | Fix | Files |
|---|---|---|---|
| F1 | DevOps | **Node-version drift** — CLAUDE.md/RUNBOOK/deploy.yml said "Node 20"; the suite only runs on **Node 22** (native `better-sqlite3` ABI). Corrected all refs + recorded the ABI reason. | `CLAUDE.md`, `docs/RUNBOOK.md`, `.github/workflows/deploy.yml` |
| F2 | Security | **CSV/XLSX formula injection** in the custom-attributes export (user-writable values reached SheetJS unescaped). Added `neutralizeFormula` helper; applied to export data + labels + template headers. + regression test. | `srv/lib/csv-export.js`, `srv/attributes-api.js`, `test/csv-export.test.js` |
| F3 | Data integrity | **Bulk custom-attribute upload bypassed allowed-value enforcement** for non-Select types (interactive path enforced it). Aligned bulk path to enforce for ANY type with an allowed list (Council fix #5 parity). | `srv/attributes-api.js` |
| F4 | Engineering (§4b) | **risk.js hand-rolled a 2nd 1-10→1-5 mapping**; now imports the canonical `legacyToBand` (byte-identical for valid inputs, + guards invalid→neutral band 3). Removes drift risk. | `srv/lib/risk.js` |
| F5 | UI bug | BhiConfig per-class dialog used an invalid `class:` constructor property (margin never applied) → `.addStyleClass()`. | `app/bms-admin/webapp/controller/BhiConfig.controller.js` |
| F6 | Observability | `/health` reported `1.0.0` unless launched via `npm start`; now reads `package.json` version directly. | `srv/server.js` |
| F7 | Cert hygiene | Removed a duplicate `@title` annotation (build warning) on `restrictionSeverity`. | `app/restrictions/fiori-service.cds` |
| F8 | i18n / a11y | **In progress** — externalising ~90 hardcoded UI strings across BnacConfig, DemoMode, prioritisation App, mass-upload, BhiConfig + wiring the orphaned `customAttributesRegion` landmark. | multiple `app/*` |

---

## 1. ✅ P1 CLOSED (code) — custom Express routes now cryptographically verify the JWT

**Status (2026-07-03).** Resolved in code via **Option A (defence in depth)**. XSUAA signature
verification was added to the custom-route auth guard in `srv/server.js`. **Not yet deployed** —
must be staged on BTP `test` and smoke-tested before `prod` (owner approval required; touches the
production auth path). BTP validation steps are at the end of this section.

**What changed (`srv/server.js`):**
- New module-scope helpers `_getXsuaaService()` + `_verifyXsuaaToken(req)`: lazily build a
  `@sap/xssec` `XsuaaService` from the bound XSUAA credentials (`cds.env.requires.auth.credentials`,
  falling back to `VCAP_SERVICES.xsuaa[0].credentials`) and verify the request's Bearer token with
  `createSecurityContext(service, { req })`.
- `requiresAuthentication` is now `async`. In XSUAA mode it **verifies the JWT signature** and
  rejects a present-but-forged/expired token (`401 TOKEN_INVALID`) instead of trusting mere header
  presence. The verified security context is attached to `req.xssecContext` / `req.authInfo`, and
  `req.user.id` is set to the real `logonName` (so the ChangeLog audit trail records the true user).
  If the verifier can't initialise (missing/mis-shaped binding) it **fails closed**
  (`401 AUTH_UNAVAILABLE`) rather than falling back to the old trust-on-presence behaviour.
- `requiresScope` now reads scopes from the verified context (`checkLocalScope(scope)`) instead of
  re-decoding the raw header; falls back to the raw decode only if no verified context is present.
- **Dummy auth (local/dev/test) is unchanged** — the Basic-auth-derived dev user path is untouched,
  so the Jest suite is unaffected. **Verified: `npm test` → 577/577 green on Node 22**, `node --check`
  clean.

**BTP validation steps (do on `test` before `prod`):**
1. `cf deploy` the built MTAR to the **`test`** space (owner-approved). Tail logs for
   `XSUAA token verification enabled for custom Express routes` (init OK) — its absence, or
   `XSUAA credentials not found … fail-closed`, means the binding shape is wrong; **do not promote**.
2. Positive path: log in through the approuter and exercise a mutating custom route (e.g. a
   mass-edit save, a `/system/api` config write) — expect success and a ChangeLog entry stamped with
   your real user id.
3. Forged-token path: `POST` directly to the srv URL with a hand-forged Bearer token carrying
   `scope:["…admin"]` (unsigned/self-signed). **Expect `401 TOKEN_INVALID`** (previously it would
   have passed). Also confirm a missing token → `401 UNAUTHENTICATED`.
4. Scope path: a valid `view`-only token on a `manage`/`admin` route → **`403 SCOPE_REQUIRED`**.
5. Only after 1–4 pass on `test`, obtain owner sign-off and promote to `prod`.

> Option B (make the `srv` CF route non-public so only the approuter reaches it) remains a valid
> *additional* hardening but is not required now that the backend verifies tokens itself.

<details><summary>Original finding (for record)</summary>

**Finding.** The ~40 custom Express routes (`/mass-edit/api`, `/system/api`, `/bnac/api`,
`/attributes/api`, map/dashboard/upload APIs) authenticate via `requiresAuthentication`
(`srv/server.js:1443`) which only checks that an `Authorization: Bearer …` header is *present*;
`requiresScope`/`_jwtHasScope` (`:1369`) then **base64-decode the JWT scope with no signature
verification**. These routes are registered on `cds.on('bootstrap')`, before CAP's XSUAA
middleware runs, so they never get cryptographic validation.

**Why it matters.** `mta.yaml` gives the `srv` module its own public route
(`srv-url: ${default-url}`, `mta.yaml:34`) with no `no-route`/internal-only setting. If that
backend URL is directly reachable (CF default), an attacker can bypass the approuter and hit the
custom routes with a **forged token** carrying `scope:["…admin"]` — it passes, defeating all scope
gates. The design is safe **only** while the approuter is the sole entry point. (OData/AdminService
routes are NOT affected — they go through CAP's real XSUAA verification.)

**This change touches the production authentication path and cannot be validated against real
XSUAA in this environment — it was deliberately NOT auto-applied.** Choose one:

- **Option A (defence in depth, recommended):** add real XSUAA verification to the custom routers.
  `@sap/xssec@4.13` is already installed. In production (`VCAP_SERVICES` present, non-dummy),
  verify the token via `createSecurityContext(new XsuaaService(creds), token)` inside
  `requiresAuthentication`; reject on failure. Keep the dummy-auth dev path unchanged. **Must be
  staged on BTP `test` and smoke-tested before `prod`** (a wrong credential shape 401s all traffic).
- **Option B (lock the front door):** make the `srv` route non-public so only the approuter reaches
  it (internal route / route-suppression + approuter destination on the internal URL), and document
  that the approuter is the enforced single entry point. Lower code risk, more platform config.

Either closes the gap. **Until then, treat the srv backend URL as sensitive and confirm it is not
publicly reachable.**

</details>

---

## 2. Engineering (Bridge/Structural) — scoring items needing owner sign-off

These affect **safety-relevant scores**; they were **not** auto-changed (surface, don't silently
alter safety numbers). Schedule with a bridge engineer.

| Ref | Finding | Effect | Recommendation |
|---|---|---|---|
| E1 (P1) | `bhi.js` CS-extent path requires `csTotal ≥ 0.95·total` (a hardcoded threshold, §2.4) — a partially-inspected element (<95% CS-quantified) silently reverts to the single `conditionRating`, or drops out entirely if that's absent. | A deck demonstrably ~40% in a severe state can score *better* than the data warrants, or produce no score. | Make the 0.95 threshold a governed config key; decide the partial-data policy (pro-rate vs flag "insufficient CS coverage") with engineering. |
| E2 (P1) | `envFromBridge` only sets `overWater` from flood flags, so a genuine watercourse crossing without those flags uses the `Road` weight set, which has **no `scour` bucket** → scour element ratings excluded from the index. | Scour (a leading waterway-bridge failure mode, AS 5100) can be silently omitted for plausible data states. | Derive `overWater` from structure/waterway attributes too; ensure scour-bearing structures use a weight set that includes it. |
| E3 (P1→resolved as F4) | Duplicate 1-10→1-5 mapping in `risk.js`. | Drift risk between risk likelihood and displayed condition band. | **Fixed** (F4). |
| E4 (P2) | `hv-assessment.js` refusal-`fail` reports `marginPct` against 1.0 (posting), not against the refusal threshold that governed the verdict. | Confusing margin number on a refusal. | Report margin vs the governing threshold; cosmetic. |
| E5 (P2) | `hv-assessment.js` `refusalRF` uses `num(0)` as finite, so an admin config of `refusalRF:0` disables refusal (structurally-inadequate vehicles pass as `conditional`). | Depends whether 0 is an intended "disable". | Decide config semantics; if 0 ≠ disable, guard `>0` → default. |
| E6 (P2) | `fatigue.js` unknown `fatigueDetailCategory` silently falls back to detail-factor 1.0 (cat-71); mode `demand:0` yields `effectiveLife=designLife`. | Confidently-wrong fatigue life for typo'd category / zero-demand config. | Return `Not Assessed` (or flag) for unrecognised category / zero demand. |

**Verified correct (no change):** the uncommitted **per-class BHI weighting** (precedence, NaN/negative
hardening, back-compat, no div-by-zero), `condition-rating.js` band map + PBT, `risk.js` NaN
hardening, `deterioration.js` Markov/Weibull guards.

---

## 3. Data / Reliability — integrity & scale items

| Ref | Sev | Finding | Recommendation |
|---|---|---|---|
| D1 | P1 | **ChangeLog-on-CUD is not atomic** with the write it audits. `mass-edit.js`, the `deactivate`/`reactivate` handlers, and the bhi-config PUT run the mutation on autocommit then write ChangeLog separately (the PUT even swallows a failed audit in `catch(_e){}`). A transient DB error on the audit insert → the business change persists with **no audit record** (§2.3 breach). | Wrap write + audit in one `cds.tx(req)` so they commit/roll back together. Broad but mechanical; schedule as one change. |
| D2 | P2 | **`computeBhi` action doesn't scale**: `SELECT…limit(1000)` + N+1 per-bridge element query, **no truncation flag**. On a 10k register, 9k bridges keep stale scores silently. `dataReadiness` (`limit(500)`) has the same shape. | Mirror the correct `scoreFleet` pattern (pagination + batched `where bridge_ID in (ids)`). |
| D3 | P2→resolved as F3 | Bulk attribute allowed-value bypass. | **Fixed** (F3). |

**Verified sound:** the six `cds.on('served')` seeds are sequential + insert-if-missing (idempotent,
no double-insert/race); `demo-seed.js` is BR-1001-marker-guarded inside one tx; seed-failure swallows
are appropriate (degrade value-help, don't corrupt rows). OData authZ, CSRF-in-prod (cannot be
disabled), secrets scan, path-traversal, SQL-injection — all clean (see §4).

---

## 4. Security — verified GOOD (beyond §1)

`@requires` + per-entity `@restrict` on all 67 AdminService projections; `access-control.cds` grants
correct; **CSRF cannot be disabled in production** (`NODE_ENV==='production'` hard-gates the opt-out);
`/launchpad/debug` admin-gated + PII-scrubbed; `sendError()` applied consistently (no stack/SQL/path
leak, 30+ sites); **no path traversal** (downloads by UUID via ORM, header-sanitised filenames); **no
SQL injection** (query builder + allow-listed dev DDL); **no secrets** in repo; `xlsx` pinned to the
vendor-patched **0.20.3** with lockfile integrity, `npm audit --omit=dev` clean.

Minor: `srv/attributes-api.js` import/template/export are documented "admin only" but mounted under
`requiresScope('manage')` — align code or docs (P2).

---

## 5. Accessibility / i18n (cert blocker area)

- **Contrast remediation (uncommitted) verified CORRECT** — all replacement tokens meet WCAG 2.2 AA
  (`#5d6b7d` 5.43:1, `#5e6b78` 5.45:1, `#767676` 4.54:1, border `#8a8a8a` 3.45:1 ≥3:1); label
  `for`/`id`, radio/checkbox `role`+`aria-labelledby`, region landmarks all added. **Land it.**
- **i18n debt (P1 for cert):** ~90 hardcoded user-facing strings remain across BnacConfig, DemoMode,
  prioritisation `App`, mass-upload, and the new BhiConfig dialog (violates §2.6 / EN 301 549 §12).
  **Being externalised** this pass (F8). The contrast-guard test only scans `webapp/ext/**/*.js` —
  **extend it to `.view.xml`/`.fragment.xml`** so hardcoded-string regressions are caught in CI.
- Orphaned landmark key `customAttributesRegion` (declared, never wired) — being wired (F8).

---

## 6. Remaining certification gaps (from CERTIFICATION-READINESS.md — unchanged, tracked)

1. **Dual facade + parallel app sets** — needs a product-owner decision to canonicalise one stack.
2. **FE migration** of dashboard + simple bms-admin config screens + bhi-explorer.
3. **UI test automation** (OPA5/wdi5) breadth; **test rigour** to ≥70% cov / ≥75% mutation.
4. **Horizon theme** consistency confirmation.
5. **SAP Store process gates** (PartnerEdge Build + ICC certification + attestations) — business, not code.

---

## 7. Recommended go-live sequence

1. **§1 JWT verification is applied in code (Option A)** → stage on BTP `test` → smoke-test (steps in §1) → owner sign-off → `prod`.
2. Land this pass's fixes (F1–F8) + the contrast work; commit + bump release notes.
3. Schedule D1 (audit atomicity) and the E1/E2 engineering-scoring review with a bridge engineer.
4. Schedule D2 (scale) before onboarding a >1k-bridge register.
5. Continue the documented cert track (§6).
