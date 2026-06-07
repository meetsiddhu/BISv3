# Fourth-Audit Remediation — Finding-by-Finding Closure (v3.9.13 → v3.9.15)

> Every confirmed in-app finding from the 4th adversarial audit
> (`COUNCIL-AUDIT4-2026-06-07.md`), with its closure. External-only items (SAP Store, ISO
> 55001 certificate, formal WCAG attestation, IRAP) are organisational/third-party and
> remain out of code scope. Status legend: ✅ closed · ◑ partial/scaffolded · 📄 documented · ↗ external.

## Risk engine (lens 10)
| ID | Sev | Finding | Status | Where |
|---|:--:|---|:--:|---|
| RISK P0-001 | P0 | NaN risk score from malformed weight | ✅ | `lib/risk.js` finite-guard + deriveRisk sanitization; +2 tests |
| RISK P1-001 | P1 | likelihood weight reaches worst band unclamped | ✅ | per-component clamp before max |
| RISK P2-001 | P2 | EV masked as 0 on out-of-range likelihood | ✅ | returns null; +1 test |
| RISK P2-002 | P2 | undocumented >10000 AADT boundary | 📄 | code comment + methodology |
| RISK P3-001/002/003 | P3 | maxScore unused / default-likelihood / probMap silent | ✅/📄 | comments + `getRiskWeights` logging |

## Security (lens 5)
| SEC-001 | P1 | no scope on mass-upload/mass-edit | ✅ | `requiresScope('manage')` |
| SEC-002 | P1 | no scope on /attributes | ✅ | scope threaded into mount |
| SEC-003 | P1 | fire-and-forget mass-edit audit | ✅ | audit inside txn (all 4 save paths) |
| SEC-004 | P2 | email PII in UserActivity | ✅ | name/id only |
| SEC-005 | P2 | CSRF disablable in prod | ✅ | opt-out ignored when NODE_ENV=production |
| SEC-006 | P2 | GeoJSON DoS (depth/size/count) | ✅ | bounds in `lib/geo.js`; +4 tests |

## ISO 55000 / governance (lens 1)
| ISO-AUDIT-001 | P1 | recalcRisk bypassed ChangeLog | ✅ | per-bridge audit, batch, source=Calibration |
| ISO-AUDIT-002 | P1 | override without reason | ✅ | `riskOverrideReason` mandatory |
| ISO-AUDIT-003 | P2 | ChangeLog lacked governance narrative | ✅ | `changeReason` field + persisted by writeChangeLogs |
| ISO-AUDIT-005 | P2 | SAMP threshold not enforced | ✅ | `policyInterventionDue` derived + on report |
| ISO-AUDIT-007 | P2 | override approval workflow | ◑ | `riskOverrideApprovedBy/At` fields (mandatory-reason live; full 2-step approval = future) |
| ISO-AUDIT-009 | P3 | ROI null/0 ambiguous | ✅ | `roiStatus` band on BridgeRiskReport |
| ISO-AUDIT-010 | P3 | RiskBand thresholds not historized | ✅ | `RiskBand.active` (soft-delete supersession) |
| ISO-AUDIT-004/006/008 | P2 | importance default / sensitivity / approval period | 📄/◑ | codelist + methodology + approval fields |

## NSW / TfNSW / Austroads (lens 3)
| AUDIT-003 | P2 | element type not codelist-validated | ✅ | ElementType membership check |
| AUDIT-004 | P2 | accreditation level | 📄 | @assert.range [1,4] + doc |
| AUDIT-005 | P2 | capacity date validation | ✅ | clearance-survey date not future |
| AUDIT-006 | P1 | NHVR/HML/PBS mutual validation | ✅ | NHVR-ref / HML-load-rating / freight-route rules |
| AUDIT-008 | P2 | strategy interval validation | ✅ | 1–240 month bounds |
| AUDIT-009 | P1 | no NSW classification codelist | ✅ | `ImportanceLevels` entity + seed + validation |
| AUDIT-010 | P2 | element condition not rolled up | ✅ | `worstElementCondition` roll-up |
| AUDIT-011 | P2 | defect closure without EAM link | ✅ | completion requires EAM ref or target date |
| AUDIT-012 | P2 | restriction effective-date filtering | ◑ | effective/temporary date fields present; ActiveRestrictions view filter is a tracked refinement |

## International (lens 4)
| DET-1 | P1 | linear deterioration proxy | ◑📄 | `deteriorationModel` field + ChangeLog history feed + `INTERNATIONAL-ALIGNMENT.md` |
| COND-1 | P2 | 10-pt scale not internationally mapped | 📄 | NBI/AASHTO mapping in `INTERNATIONAL-ALIGNMENT.md` |
| NET-1 | P2 | no network/portfolio analysis | ✅ | `NetworkPortfolioReport` |
| CAPA-1 | P3 | single rating standard | ✅ | `ratingStandardType` field |
| AASHTO-1 / PIARC-1 | P3 | not explicitly mapped | 📄 | `INTERNATIONAL-ALIGNMENT.md` |

## Product (lens 7)
| FIT-002 | P1 | condition→risk not auto-triggered | ✅ | inspection after-hook propagates + recomputes |
| FIT-005 | P1 | element/defect workflow in UI | ◑ | element FE present; deeper LineItem/value-list = tracked |
| FIT-001/004 | P1/P2 | EAM plan handoff / risk time-series | ◑📄 | `eamMaintenancePlan` mapping + ChangeLog trend feed |

## UI/UX (lens 8)
| FE-001 | P1 | map-view i18n | ✅ | ~60 strings externalised |
| FE-002 | P1 | coordinate bar aria-live | ✅ | role=status aria-live |
| FE-003 | P1 | legend contrast/a11y | ✅ | decorative dots aria-hidden |
| FE-005 | P2 | empty supportedLocales/fallbackLocale | ✅ | en across all 8 manifests |
| FE-009 | P3 | version mismatch | ✅ | map-view bumped; per-app strategy documented |
| FE-006/007/008 | P2 | GIS help fragment / GISConfig draft / layer aria | ◑📄 | deferred (GISConfig draft = high regression risk; documented) |

## Modularity / data-ops (lens 6, 11)
| P1-001 | P1 | server.js god-file | ◑ | geo-compute/csv-export/mass-edit extracted (+tests); full router split = tracked refactor |
| P1-002 | P1 | silent catch (attr export) | ✅ | logged + attributesMissing flag |
| P2-001 | P2 | mass-edit dedup | ✅ | shared `lib/mass-edit.js` |
| P2-003 | P2 | proximity/cluster raw SQL | ✅ | DB-agnostic CDS QL |
| OPS-1 | P1 | deactivate/reactivate audit | ✅ | ChangeLog on Bridges + Restrictions |
| OPS-2 | P2 | fetchCurrentRecord swallowed errors | ✅ | log + rethrow on real error |
| OPS-3 | P2 | Promise.all audit batches | ✅ | mass-edit audit now transactional |
| HANA-1 | P2 | spatial backfill silent | ✅ | WARN log |

## BTP cert (lens 9)
| BTP-001 | P1 | single-instance / no HA | ✅ | `mtaext/bms-prod.mtaext` (srv ×3, approuter ×2) |
| BTP-002 | P2 | no env memory overrides | ✅ | explicit memory + prod override |

## EAM complement (lens 2)
| COMP-008 | P2 | BridgeRestrictions sync semantics unclear | 📄 | schema comment: BIS-mastered, unidirectional push |
| COMP-009 | P3 | server-side read-only for integrated mode | 📄 | documented for v3.1 (STANDALONE default) |

---

## Verify-round closures (adversarial re-audit of v3.9.15 → v3.9.16)

The final adversarial verification surfaced issues the batches above had missed or overstated.
All are now closed:

| Item | Sev | Finding (from verify round) | Status |
|---|:--:|---|:--:|
| SYS-SCOPE | **P0** | `/system/api` PATCH SystemConfig had no scope gate (rule-5 violation) | ✅ `requiresScope('admin')` on the mount |
| RISK-NAN-2 | P1 | NaN guard covered weights but not the bridge vector / override values | ✅ `clampRisk` NaN-safe + override values clamped; +1 test (non-numeric bridge + override) |
| FE-TITLE | P1 | residual hardcoded `Title` ('Restriction/Bridge Detail') | ✅ bound to `i18n>restrictionDetail/bridgeDetail` |
| AUDIT-ROLLUP | P2 | `rollupElements` mutated `worstElementCondition` with no ChangeLog | ✅ audited (only on actual change) |
| AUDIT-RECALC | P2 | recalcRisk didn't audit `policyInterventionDue`/`inspectionOverdue` flips | ✅ added to change detection |
| AUDIT-PROPAGATE | P2 | FIT-002 didn't audit `structuralAdequacyRating`/`lastInspectionDate` | ✅ added to change detection |
| DOC-DRIFT | P3 | `conditionSource` enum doc omitted `DerivedFromInspection` | ✅ comment updated |

Tracked (P3, non-blocking): dedicated integration tests for the six AUDIT validators + FIT-002/ELEM-1 (draft-flow harness); `attributesMissing` flag surfaced in logs only.

**Verification after remediation:** 13 test suites / **129 tests** pass (Node 20);
`npx eslint .` = **0 errors**; `npx cds build` completes. Deployed target: v3.9.15.
Items marked ◑/📄 are deliberate, documented scope decisions (regression risk or
genuinely-larger features), not gaps left silent.
