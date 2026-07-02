// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: governed-config — the shared shape of a versioned, templated,
// admin-governed configuration model (the pattern PrioritisationModel already proves).
// Self-contained + additive (CLAUDE.md §2.1). This file defines ONLY a reusable ASPECT
// (a mixin), so it creates NO table on its own and has ZERO effect until a concrete
// entity includes it (e.g. `entity BhiModel : plugins.governedconfig.governedModel {…}`).
// Portable: another engine (BHI, Risk) gets clone/version/activate governance for free by
// including this aspect + driving it with the pure helpers in ./index.js. No BIS specifics.
// ─────────────────────────────────────────────────────────────────────────────
namespace plugins.governedconfig;
using { cuid, managed } from '@sap/cds/common';

// The governance envelope every configurable engine model shares. Mirrors the proven
// PrioritisationModel fields so the three engines converge on ONE lifecycle vocabulary.
aspect governedModel : cuid, managed {
  code         : String(40);                       // business key, stable across versions (e.g. 'BHI-DEFAULT')
  name         : String(120);
  version      : Integer default 1;                // immutable once Active; clone bumps to max+1
  status       : String(20)  default 'Draft';      // Draft | Active | Retired | Template
  isTemplate   : Boolean     default false;        // seeded, standards-calibrated starting point (excluded from Active resolution)
  description  : LargeString;
  clonedFrom   : UUID;                             // provenance — the model this was copied from
  // Sign-off governance (mirrors RiskBand / PrioritisationModel review fields).
  reviewedBy   : String(111);
  reviewedAt   : Date;
  reviewSource : String(255);
}
