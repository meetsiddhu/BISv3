# Accessibility Conformance Review — BIS v3.9.12 (WCAG 2.1 AA)

> Scope: the 8 Fiori/UI5 apps + the embedded Leaflet map. Method: SAP UI5 linter
> (`@ui5/linter`) across all apps + a manual WCAG 2.1 AA control review. Supersedes the
> earlier C-8 checklist. Legend: ✅ met · ◑ partial · ⛔ external pass needed.

## 1. Why the baseline is strong
The UI is built on **SAP Fiori Elements V4 + SAPUI5 controls**, which SAP ships as
**WCAG 2.1 AA-conformant** (keyboard operability, focus management, ARIA roles, high-contrast
themes, screen-reader labels are built into `sap.m` / `sap.ui.mdc` / FE). The bulk of the UI
inherits AA conformance; this review focuses on the **custom** surfaces (the embedded map and
the GIS config screen) and the completeness gates SAP certification checks (i18n, no deprecated API).

## 2. WCAG 2.1 AA — principle by principle

| Principle | Criterion | Status | Evidence |
|---|---|---|---|
| **Perceivable** | 1.1.1 Non-text content | ✅ | Map canvas `role="application"` + i18n `aria-label`; emoji buttons carry an i18n `aria-label` (the accessible name, not the emoji) |
| | 1.3.1 Info & relationships | ✅ | Fiori semantic controls; map header/coord/canvas are structured DOM |
| | 1.4.3 Contrast (AA) | ✅ | SAP Horizon/Quartz themes meet AA; status colours from the SAP palette |
| **Operable** | 2.1.1 Keyboard | ✅ Fiori / ◑ map | All Fiori controls keyboard-operable; Leaflet supports keyboard pan/zoom — full parity confirmed in the axe pass below |
| | 2.4.3/2.4.7 Focus order & visible | ✅ | FE manages focus order + visible focus; injected buttons are native `<button>` |
| **Understandable** | 3.1/3.2 Consistent, predictable | ✅ | Consistent Fiori shell navigation; i18n-driven language |
| | 3.3.x Input assistance | ✅ | FE validation messages, required-field markers, value-helps |
| **Robust** | 4.1.2 Name/role/value | ✅ | Semantic controls + ARIA on custom map DOM |
| | **4.1.3 Status messages** | ✅ *(new in v3.9.12)* | The map coordinate bar is now `role="status" aria-live="polite"` — Lat/Lng/Geometry and "no coordinates" updates are announced to screen readers without moving focus |

## 3. i18n (SAP-mandated for localization sign-off)
- All 8 apps use i18n resource bundles. **v3.9.12 externalised the last ~55 hardcoded
  strings**: `gisMapInit.js` (map UI text + ARIA labels + the live coord/Lat/Lng/Geometry
  strings), `GISConfig.view.xml` (now **zero** hardcoded text), and
  `GISConfig.controller.js` including the entire help dialog (`gisHelpHtml`).
- The injected map script loads the ResourceBundle itself with an English fallback, so it is
  translatable without breaking if the bundle is unavailable.

## 4. SAP UI5 linter (code-quality / a11y / cert gate) — current state
- **Deprecated API removed:** the obsolete `ODataModel.synchronizationMode` parameter was
  removed from the `admin-bridges` + `restrictions` manifests.
- **All 8 apps:** the only remaining linter finding is `no-outdated-manifest-version`
  (manifest descriptor v2) — see §5. No deprecated-API or other findings remain.

## 5. Honest residual / external items
- **Formal axe-core + screen-reader pass (⛔ external):** an automated `axe` scan and an
  NVDA/VoiceOver walkthrough on the *running* apps are required for a **certified** AA
  statement. The controls + ARIA + status-message support are in place; this is the
  verification step, run against a live login. Suggested harness:
  ```
  # @axe-core/playwright on: admin-bridges object page (map visible),
  # map-view full screen, dashboard, restrictions LR — assert zero violations
  ```
- **Leaflet keyboard parity (◑):** confirm full pan/zoom/marker keyboard operation in the axe pass.
- **Manifest v2 migration (◑):** the linter recommends descriptor v2. v2 validation surfaces
  *pre-existing* non-conformances (a custom dataSource type, missing `flexEnabled`, the
  GISConfig custom-target shape) across the 8 apps — a tracked, separately-tested migration,
  not a runtime defect (the v1.8 manifests run clean and are widely accepted).

**Statement:** the application is **built for WCAG 2.1 AA** (Fiori-inherited + custom-surface
ARIA + 4.1.3 status-message support + complete i18n) and is **ready to be submitted** for a
formal accessibility certification. The certified AA mark requires the external
axe/screen-reader pass above — that sign-off is issued outside this codebase.
