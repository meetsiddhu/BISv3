# UAT Fix List — BIS v3.10.0 — 2026-06-11

### [P1-001] Pack weight seed IDs are malformed UUIDs → Model Builder PATCH 400 — **FIXED THIS RUN**
- **File**: `db/data/bridge.management-AssetClassCriterionWeight.csv` (rows `…-9410-00000xxxxx`, 10-hex tail)
- **Symptom**: `PATCH /odata/v4/prioritisation/ModelClassWeights(<ID>)` → 400 (OData cannot parse the key as a GUID); Model Builder weight/include/policy edits fail for all 150 pack rows.
- **Expected**: valid 8-4-4-4-12 UUIDs; PATCH 200.
- **Root cause**: seed generator formatted the final UUID segment with `{n:05d}` (10 hex chars) instead of 12.
- **Fix**: zero-padded all malformed tails to 12 chars (44 rows); committed `fix(rule-engine): …malformed UUIDs…`; db module redeployed (hdbtabledata full reload replaces old rows).
- **Test**: `test/rule-engine-schema.test.js` green (6/6); live retest: ModelClassWeights GET by key + PATCH after redeploy.
- **Persona**: PO/SME + Power user (admin tuning weights).
- **Status**: ✅ fixed, redeployed.

### [P3-001] FLP session after redeploy requires hard refresh
- **File**: platform behaviour (approuter session vs cached document)
- **Symptom**: after `cf deploy`, an already-open FLP tab issues OData calls that bounce to login HTML until Cmd+Shift+R.
- **Fix**: none required in-app; documented in tile report (user guidance). Optional later: approuter `sessionTimeout` tuning or a 401→reload interceptor in the apps.
- **Persona**: New user.
- **Status**: documented.

### [P3-002] Deep per-tile create flows on Inspections/Defects/Capacity not re-exercised this run
- **Symptom**: this UAT prioritised the new rule-engine surface; those tiles got render+read only.
- **Fix**: covered by the 192-test automated suite + prior live UAT runs (v3.9.27–33); re-run a focused pass next cycle if desired.
- **Persona**: QA.
- **Status**: tracked.
