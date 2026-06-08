# Pre-Mortem — Bridge Prioritisation Module (2026-06)

Expert-council pre-mortem run **before** implementation (5 lenses + synthesis), then every
finding addressed in the delivered v3.9.28 module. The module is bounded (own service, engine,
app, tile), additive, and the existing solution (incl. the gold Restrictions tile) is untouched.

## Verdict (as found)
Design intent sound; the naive build was unsafe. Biggest risk to the EXISTING app: the launchpad
is one shared served artifact — a syntax error while adding the tile blanks the whole FLP.

## Critical correction (one inverted finding)
The council claimed the served launchpad source is the inline `tileConfig` in
`app/router/fiori-apps.html`. **Verified empirically the opposite**: the v3.9.26 commit that made
"REPORTS & ANALYTICS" appear live touched **only** `fioriSandboxConfig.json` (both copies) +
`launchpad.js` — never `fiori-apps.html`. So `fioriSandboxConfig.json` is **authoritative in
prod** (the ushell sandbox bootstrap fetches `/appconfig/fioriSandboxConfig.json`, overriding the
stale inline config). Action: wired the tile into **`fioriSandboxConfig.json` (both copies)** and
deliberately **did not touch `fiori-apps.html`** (where a syntax error really could blank the shell).

## MUST-FIX — status
| # | Finding | Resolution |
|---|---|---|
| 1 | Tile into the served launchpad file | Added tile + `Prioritisation-display` inbound to BOTH `fioriSandboxConfig.json` copies (authoritative); `fiori-apps.html` untouched. Live-verified the tile appears + gold Restrictions tile intact. |
| 2 | "Immutable run" must be append-only at the SERVICE layer | `@restrict` grants **READ,CREATE only** (no UPDATE/DELETE); `before('UPDATE')` rejects; corrections create a new run (`supersededBy`); soft-delete via `active`. Test: PATCH rejected. |
| 3 | Compute server-side; never trust client scores; exclude from bulk | `before('CREATE')` computes ALL outputs via the engine and overwrites client values; not registered in mass-upload/mass-edit. Test: bogus client score/band ignored. |
| 4 | FIVE bands + 0-floor + guarded lookup | Seeded 5-band ladder; engine `bandOf` sorts desc + falls back to lowest (never throws); reuses `validateRiskBands`. Test: sub-20 → P5, no crash. |
| 5 | Coerce every config value to a number | Engine `num()` (Number + isFinite + documented defaults) at the boundary; Decimal-as-string config never NaNs the fleet. Test: string/non-finite config → finite score. |
| 6 | Separate config; NO fleet-recompute hook; past runs replay from snapshot | New `PrioritisationConfig` (not RiskConfig/RiskBand); each run stores `paramSnapshot`; editing config retires the old version (future runs only). Test: config edit doesn't change a stored run. |
| 7 | Resolve XSUAA scope in the same release | **Reused** existing scopes (view=read, manage=create, admin=config) — no new scope, no role-collection re-grant. Test: view-only 403 on CREATE. |
| 8 | Feature flag enforced server-side | `SystemConfig prioritisationEnabled` (default-ON kill-switch) gates CUD in `before('CREATE')`. Tile is deploy-time (static FLP can't conditionally hide). |
| 9 | Reports READ the stored run, never recompute | Exec + engineer bind to the persisted figures; reconcile by construction. Live-verified (Assessed/band/score match the worklist). |
| 10 | Constrained matrix sets likelihood only — by construction | Cell press sets only likelihood; consequence column is the computed tier; server recomputes tier on save. Live-verified (C-column = tier, cell = likelihood). |
| 11 | Atomic html5-module wiring + archive verify | mta.yaml module + app-deployer artifact + manifest id + FLP inbound, all in one change; archive verified to contain `prioritisation.zip` (manifest id + Component-preload) before deploy. |

## Deferred (per the approved spec)
- **PDF export** of the exec one-pager (button present; uses browser print for now).
- **EAM-outbound work requests** — there is no live EAM write surface; MVP stays strictly read-only (never modifies EAM).
- Runtime kill-switch flag refinement; a dedicated XSUAA scope (only if access policy later demands separation).

## Verification
17 suites / 158 tests (engine reproducibility + service append-only/gating/prefill/reproducibility +
FLP consistency); ESLint 0/0; `cds build --production` clean; archive content-verified; deployed
v3.9.28 and **live smoke-tested** end-to-end (tile → worklist → assess w/ federated prefill +
constrained matrix + formula inspector → save server-computed immutable run → reports reconcile),
with the gold Restrictions tile and all existing apps confirmed intact.
