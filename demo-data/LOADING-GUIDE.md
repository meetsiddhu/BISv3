# Mass Upload — Loading Guide (demo data + your own customer data)

## 1. Which file / template to use

| Purpose | File | Where |
|---|---|---|
| **Practice / demo** | `BridgeManagement-DemoData.xlsx` (15 bridges + 8 restrictions, all sheets) | this `demo-data/` folder |
| Demo, single dataset | `Bridges.csv` / `Restrictions.csv` | this folder |
| Allowed-value reference | `BridgeManagement-AllowedValues.xlsx` (valid codes per dropdown) | this folder |
| **YOUR customer data** | **Download the live template from the app** (always matches the deployed schema) | Mass Upload tile → **Download Template** (Excel = all datasets; CSV = one) |

> For real data, always start from the **app's downloaded template**, not a hand-made file — the header row and the
> required-field markers (`*`) are guaranteed correct. The Excel template's **`DropdownExamples`** sheet lists the
> valid code values for every dropdown column (assetClass, state, condition, restrictionType, …).

## 2. Load SEQUENCE (order matters — dependencies)

Load in this order so references resolve:

1. **Allowed values / lookups** — *only if your data uses codes that aren't already in the app.*
   Sheets: AssetClasses, States, Regions, StructureTypes, DesignLoads, PostingStatuses, ConditionStates,
   RestrictionTypes/Statuses/Categories/Units, VehicleClasses, RestrictionDirections.
   (The standard Australian values are already seeded — skip this step if you only use those. To add custom codes,
   load the lookup sheet first, or add them in the Admin config tile.)
2. **Bridges** — the master records. Must exist before restrictions can link to them.
3. **Restrictions** — child records; each links to a bridge via the **`bridgeRef`** column (= the bridge's `bridgeId`).
   Load *after* bridges. (If a `bridgeRef` has no matching bridge, the row still loads but the bridge link is left
   blank — a warning, not a failure.)
4. **Config datasets** (Risk Bands / Risk Factors / Asset Class Strategies) — admin-only, independent of bridges; load any time.

**Shortcut:** a single **Excel workbook with all sheets** loads everything in one upload, and the importer resolves
bridge→restriction links *within the same batch* automatically. So `BridgeManagement-DemoData.xlsx` (and a customer
workbook built the same way) is the one-shot option — no manual ordering needed.

## 3. Steps for EVERY upload

1. **Mass Upload tile** → pick the file (Excel = all sheets; CSV = pick the one dataset).
2. **Upload mode** (radio):
   - **Create & Update** (default) — insert new rows, update existing ones (matched by `bridgeId` / `restrictionRef`).
   - **Create only** — first-time load; any key that already exists is reported as an error and skipped.
   - **Update only** — corrections to existing records; any unknown key is reported as an error and skipped.
3. **Validate** — fix every row flagged **Error** (and review Warnings) before uploading. The preview shows the row
   number + reason.
4. **Upload** — review the per-row results table; **Download results CSV** for your records. The raw file you
   uploaded is also retained (downloadable from the results / history).
5. **Verify** in the **Bridge Register** / **Map** / **Dashboard** tiles (the data lands in HANA; the upload tile's
   screen is just transient and clears on refresh).

## 4. Rules to get a clean load

- **Required fields** (header marked `*`) must be filled, or the row is skipped:
  - Bridges: `bridgeName*, state*, latitude*, longitude*, assetOwner*`
  - Restrictions: `restrictionRef*, restrictionCategory*, restrictionType*, restrictionStatus*`
- **Dropdown columns** must use a valid code (see the `DropdownExamples` sheet or `BridgeManagement-AllowedValues.xlsx`).
- Give every bridge a unique **`bridgeId`** and every restriction a unique **`restrictionRef`** — these are the keys
  used to match rows for *update* and to link restrictions to bridges.
- Re-uploading the same file in **Create & Update** updates the existing rows (safe to re-run).

## 5. Recommended path for a real customer load

1. Download the **Excel template** from the app.
2. (If needed) fill the lookup sheets with any custom codes.
3. Fill the **Bridges** sheet, then the **Restrictions** sheet (use the bridges' `bridgeId` values in `bridgeRef`).
4. Mode = **Create only** for the initial load → **Validate** → fix errors → **Upload** → download results CSV.
5. Verify in the Register/Map. For later corrections, use **Update only**.
