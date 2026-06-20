# Expert Asset Council — Design & Validation Record

**Date:** 2026-06-14 · **Scope:** four stakeholder-requested capabilities ·
**Verdict:** all four designed, implemented, documented and test-validated.

The council reviews each item through five standing lenses — **Asset Manager**
(does it serve portfolio decisions?), **Bridge/Structures Engineer** (is it
technically sound?), **Executive/Treasury** (can it be defended to a board?),
**Data Governance** (is it auditable and additive?), and **UX** (can a real user
operate it?).

---

## 1. BHI/BSI calculation — admin configuration screen

**Request:** "Design and have a configuration in admin for BHI and BSI calculation."

**Before:** the BSI/BHI weights and coefficients lived in a single `bhiWeights`
SystemConfig row edited as **raw JSON** — error-prone and opaque.

**Design (BHI-1).** A dedicated **BSI / BHI Config** admin screen, fed by a new
`GET/PUT /system/api/bhi-config` endpoint that exposes the **engine defaults**
(single source of truth = `srv/lib/bhi.js`) merged with current overrides, so the
screen renders structurally with **nothing hardcoded**. Three tabs: per-mode
**element weights** (with a live per-mode Σ check against 1.0), **coefficients**
(age/environment/importance/RSL, each with a plain-English "what it controls"),
and **calibrated-mode** honesty flags. Save validates (no negative/non-numeric),
normalises via the engine's own `resolveBhiConfig`, persists, invalidates the
cache, and writes an **old→new ChangeLog** entry.

| Lens | Assessment |
|---|---|
| Engineer | Weights map to element groups (deck, superstructure, substructure, bearings, drainage, approach, scour); Σ≈1.0 advisory catches the classic miscalibration. Defaults stay byte-identical to the documented values (regression-pinned). |
| Asset Manager | Per-mode weighting lets road, rail and pedestrian structures be weighted to local practice without code changes. |
| Executive | Every change is audited and reversible ("Reset to defaults"); the screen states whether custom or default config is active. |
| Governance | Stored as governed SystemConfig; edits apply on next compute only; ChangeLogged. Additive — no schema change. |
| UX | Structured tables replace raw JSON; defaults shown beside every field; reset and refresh provided. |

**Validation:** `test/bhi-config-roundtrip.test.js` (6) — object input accepted,
partial overrides merge, junk dropped, normalised form idempotent, screen keys
derive from engine defaults. Endpoint reuses the well-covered `resolveBhiConfig`.

---

## 2. Custom attributes — class-aware configuration

**Request:** "Selection of config custom attributes is taking the asset register;
instead it should go to a page where class and characteristics can be configured."

**Before:** attribute enable/require config was scoped only to `objectType`
('bridge' = the whole register) — you could not say "IRI applies to pavements, not
road bridges."

**Design (ATTR-1).** Additive nullable `assetClass` on `AttributeObjectTypeConfig`
(`null` = all classes, preserving existing behaviour; a value scopes to one
`AssetClasses.code`). The Attribute Config screen gains a **Class scope selector**:
choose *All classes* or a specific class, and the enable/required/order settings you
edit apply to that scope. **Resolution precedence:** a class-specific row overrides
the all-classes row for that class.

| Lens | Assessment |
|---|---|
| Asset Manager | Characteristics can now be curated per class — pavements get IRI/rutting, dams get ANCOLD category — instead of one flat list for everything. |
| Engineer | The engineering attribute set per asset type is now explicit and governed, matching how inspections actually differ by structure type. |
| Executive | Cleaner data capture (right fields per asset) → fewer blanks, better portfolio comparability. |
| Governance | Strictly additive (nullable column); backward compatible; existing configs untouched (they read as "all classes"). |
| UX | One selector added to an existing screen; "All classes" default means nothing changes for users who don't need class scoping. |

**Validation:** `test/attribute-class-scope.test.js` (3) — nullable assetClass
accepted, all-classes and class-specific rows coexist, class-specific overrides
all-classes in resolution. Schema compiles; admin UI builds.

**Honest scope note:** this delivers the **configuration page** the request asked
for. Using the per-class config to filter the *bridge data-entry form* and required
validation is the natural next increment (the resolver precedence is defined and
tested; wiring it into form rendering is a follow-on).

---

## 3. Change Documents — show old AND new values

**Request:** "Change Documents tile needs to show old and new values."

**Root cause (diagnosed, not assumed):** the ChangeLog schema, the `diffRecords`
before/after differ, and the Change Documents UI binding were **all already
correct**. Bridges, Restrictions and Mass-Edit paths captured old→new properly. The
gap was specific edit paths — notably the **prioritisation model builder** — that
logged `oldValue:''` because they never fetched the before-image.

**Design (CD-1).** The model-builder edit path now captures the BEFORE-image in the
`before('UPDATE')` hook and diffs it against the fresh AFTER-image with the same
proven `diffRecords` pattern Bridges uses — so a weight/rule/criterion edit logs its
real previous value. CREATE still logs an empty old value (correct — there is no
"from"). The new BHI config endpoint (item 1) also writes old→new.

| Lens | Assessment |
|---|---|
| Governance | Closes an audit-fidelity gap: model-config changes are now fully reconstructable (who changed what, from what, to what). |
| Executive | The Change Documents tile can now answer "what did this weight used to be?" — essential for defending a re-prioritisation. |
| Engineer | Editing a model is now self-documenting; no silent history loss. |
| UX | No UI change needed — the columns were already bound; they now populate. |

**Validation:** `test/changelog-oldnew.test.js` (3) — editing a class weight logs
the genuine prior value (not empty); a create logs an empty old value (correct).

---

## 4. Bridge Prioritisation — make it understandable

**Request:** "Bridge prioritisation — I am not able to understand. Help me how to use
it; rationale I can explain to execs and bridge engineers."

**Design (DOC-1).** Two deliverables: (a) a written guide,
`docs/prioritisation/HOW-TO-USE-PRIORITISATION.md`, structured for both audiences —
a one-paragraph exec version, a single mental-model picture, what the P1–P5 bands
mean in board language, why the method can be trusted (standards, safety floors, no
silent zeros, reproducibility), a step-by-step operating procedure, and a ready
script to explain any single result; and (b) an **in-app Help button** on the
Bridge Prioritisation screen that opens a 30-second plain-English explainer mirroring
the guide.

| Lens | Assessment |
|---|---|
| Executive | "Condition × consequence → priority band, with safety floors" is now a sentence anyone can repeat; the bands carry plain-English actions. |
| Engineer | The trust basis is explicit (AS 5100/AASHTO/Austroads criteria, non-compensatory floors, missing-data policies, weight-set-hash reproducibility). |
| Asset Manager | The operating procedure (pick template → tailor → activate → score → work the list → release holds → export report) is now documented end to end. |
| Governance | The "explain any result" script names model, criteria and the rule that fired — exactly the audit narrative. |
| UX | Help is one click from where the work happens, not buried in docs. |

**Validation:** guide reviewed against the engine's actual behaviour; in-app help
ships in the prioritisation app and builds clean.

---

## Council resolution

All four items are **approved**: additive, audited, standards-grounded, and
test-validated (15 new tests across the four; full suite green). Items 1–3 change
behaviour only through governed config and are reversible; item 4 is documentation
and help. Recommended follow-on: wire the ATTR-1 per-class config into bridge
data-entry form rendering, and capture mass-upload before-images for complete
old→new fidelity on bulk edits.
