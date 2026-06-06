# AGENTS.md

This project's engineering contract — locked architectural rules, stack, GIS/CRS
policy, EAM alignment, and working agreements — is maintained in **[CLAUDE.md](./CLAUDE.md)**.

Agents and contributors: read `CLAUDE.md` before making changes. Key non-negotiables:

- **Additive-only** schema; **soft-delete only** (no hard DELETE on business entities).
- **ChangeLog** on every create/update/deactivate.
- **Zero hardcoding** — config via `SystemConfig` / admin tile.
- **XSUAA-first** security; no secrets in the repo.
- **Node 20** runtime; run `npx cds build` + `npm test` before committing.

Supporting docs: `docs/RUNBOOK.md` (deploy/rollback), `docs/defects.md` (defect
register), `docs/eam-mapping/` (S/4 EAM alignment), `COUNCIL-REPORT.md` (latest audit).
