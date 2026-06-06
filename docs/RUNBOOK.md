# BIS — Operations Runbook

> Deploy, rollback, and environment reference for the Bridge Information System
> (BIS / BridgeManagement) on SAP BTP Cloud Foundry.

## 1. Toolchain (pinned)

| Tool | Version | Pinned in |
|------|---------|-----------|
| Node.js | **20.x** | `.nvmrc`, `.tool-versions`, `package.json` engines |
| @sap/cds | ^9 | `package.json` |
| @sap/cds-dk | ^9 | `package.json` devDependencies |
| CF CLI | v8 | install per `deploy.yml` |
| MTA build tool (`mbt`) | latest | install per `deploy.yml` |

> Local dev **must** use Node 20. `nvm use` (reads `.nvmrc`) or
> `export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`. Node 16/18 cannot run @sap/cds v9.

## 2. Branch → Space mapping

| Git branch | CF space | Promotion |
|------------|----------|-----------|
| feature / `bridgev2/*` | `dev` | automatic-eligible (manual dispatch, no approval) |
| `main` (release candidate) | `test` | manual dispatch + **environment approval** |
| tagged release (`vX.Y`) | `prod` | manual dispatch + **environment approval** |

Enforcement: `.github/workflows/deploy.yml` takes the target space as an input and
binds it to a GitHub **Environment**. Configure required reviewers on `test` and
`prod` environments so promotion needs a human approval.

## 3. Standard deploy (CI/CD)

1. Push branch → `ci.yml` runs install → lint → CDS compile → build → test.
2. Trigger **Deploy (manual, gated)** workflow → choose space → approve if prompted.
3. Workflow runs tests again, builds the MTA, `cf deploy`, then `cf apps` smoke check.

## 4. Manual deploy (fallback)

```bash
nvm use                       # Node 20 from .nvmrc
npm ci
mbt build                     # produces mta_archives/*.mtar
cf login -a <CF_API> -o <ORG> -s <SPACE>
cf deploy mta_archives/*.mtar
```

If the HANA Cloud instance is stopped (free tier auto-stops):

```bash
cf update-service Hanaclouddb -c '{"data":{"serviceStopped":false}}'
# poll until "update succeeded", then deploy. On deployer failure:
cf deploy -i <operationId> -a retry
```

## 5. Rollback

- MTA keeps the previous version; to roll back, redeploy the prior `.mtar`
  (retain release artifacts) or `cf deploy <previous>.mtar`.
- DB changes in this app are **additive-only and soft-delete only**, so a code
  rollback does not require a destructive schema migration.

## 6. Observability

- Every request carries a correlation ID (`x-correlation-id`, set in
  `srv/server.js` bootstrap). Search SAP Cloud Logging by this id to trace a
  single user action end-to-end.
- Health probe: `GET /health` (no auth) for load-balancer / BTP checks.

## 7. Safety rules (do not automate)

- Never auto-deploy to `prod`; promotion is a deliberate, approved act.
- Never commit secrets; CF credentials live in GitHub Environment secrets only.
- No hard deletes — removal is via the `deactivate` soft-delete action.
