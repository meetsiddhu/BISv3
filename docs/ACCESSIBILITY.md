# Accessibility (WCAG 2.1 AA) — Status & Checklist

> Addresses COUNCIL-REPORT finding **C-8**.
> Fiori Elements controls are accessible by default; the risk is in **custom**
> controls (the Leaflet map and dashboard tiles). Safe ARIA fixes are applied now;
> a full automated audit is staged as a follow-up.

## Applied now (low-risk, non-breaking)

- Custom GIS map controls (`ext/controller/gisMapInit.js`):
  - Icon buttons given `type="button"` + descriptive `aria-label`
    ("Open map in full view", "Copy coordinates to clipboard") — emoji alone is
    not a reliable accessible name.
  - Map canvas given `role="application"` + `aria-label`
    ("Interactive bridge location map").

## Checklist for the full audit (follow-up)

| Criterion | Area | How to verify |
|-----------|------|---------------|
| 1.1.1 Non-text content | Map markers, emoji buttons | axe scan; manual SR pass |
| 1.4.3 Contrast (AA) | Dashboard tile colours (`Main.controller.js` state colours), buttons | contrast checker on `#0a6ed1`, status palette |
| 1.4.11 Non-text contrast | Map controls, borders | contrast checker |
| 2.1.1 Keyboard | Map pan/zoom, custom buttons | tab through, no mouse |
| 2.4.3 Focus order | Custom DOM injected outside UI5 control tree | keyboard walk |
| 2.4.7 Focus visible | Injected buttons | confirm visible focus ring |
| 4.1.2 Name/role/value | `role="application"` map, custom buttons | axe + SR |
| 3.3.2 Labels/instructions | Forms (mostly FE-handled) | spot-check custom fields |

## How to run the audit

```bash
# With the app running locally (Node 20):
npx playwright test            # add an axe-core integration spec
# or load @axe-core/playwright and assert zero violations on:
#   - admin-bridges object page (map visible)
#   - dashboard tiles
#   - map-view full screen
```

## Notes

- Standard Fiori Elements list/object pages already meet WCAG 2.1 AA via SAPUI5;
  do not re-implement what the framework provides.
- Keep all user-facing strings in i18n so screen-reader text is localisable.
