sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/SegmentedButton",
  "sap/m/SegmentedButtonItem"
], function (Controller, JSONModel, MessageToast, MessageBox, SegmentedButton, SegmentedButtonItem) {
  "use strict";

  // band -> sap.ui.core.ValueState (label+number ALWAYS shown too — never colour-only, WCAG).
  var BAND_STATE = { P1: "Error", P2: "Error", P3: "Warning", P4: "Success", P5: "None" };

  // Rubric anchors per criticality dimension per 1-5 level (council gap #3; spec-mandated, so an
  // assessor knows what "Safety = 4" means without training). Config (PrioritisationConfig.rubrics)
  // overrides these defaults when present (rule 4: config-driven, versioned).
  var DEFAULT_RUBRICS = {
    dimSafety: { 1: "Negligible safety consequence", 2: "Minor injury possible", 3: "Serious injury credible", 4: "Single fatality credible", 5: "Multiple fatalities credible" },
    dimNetwork: { 1: "No network disruption", 2: "Local detour, minutes", 3: "Sub-network impact, hours", 4: "Key corridor severed, days", 5: "Strategic corridor lost, weeks+" },
    dimFinancial: { 1: "Trivial cost", 2: "Minor repair budget", 3: "Material capital cost", 4: "Major capital + indirect cost", 5: "Severe whole-of-life / liability cost" },
    dimEnvironmental: { 1: "No environmental effect", 2: "Contained, reversible", 3: "Local, remediable", 4: "Significant, prolonged", 5: "Severe / protected-area harm" },
    dimReputational: { 1: "No public interest", 2: "Local complaint", 3: "Regional media", 4: "State media / ministerial", 5: "National / inquiry-level" }
  };
  // Residual-severity legend (matrix), non-colour: residual = likelihood × consequence(tier).
  var SEV = function (v) { return v >= 15 ? { label: "Very High", state: "Error" } : v >= 8 ? { label: "High", state: "Error" } : v >= 4 ? { label: "Medium", state: "Warning" } : { label: "Low", state: "Success" }; };
  // Wireframe-default params; replaced by the live config loaded from the service.
  var DEFAULT_CFG = {
    dimWeights: [0.35, 0.25, 0.15, 0.10, 0.15], priorityWeights: [0.40, 0.40, 0.20],
    maxResidual: 25, maxCriticality: 5,
    urgency: { Renew: 80, Maintain: 50, Monitor: 20, Decommission: 30 },
    bandThresholds: [{ code: "P1", min: 80 }, { code: "P2", min: 60 }, { code: "P3", min: 40 }, { code: "P4", min: 20 }, { code: "P5", min: 0 }],
    version: "default", formulaVersion: "v1-normalised"
  };

  return Controller.extend("BridgeManagement.prioritisation.controller.App", {

    onInit: function () {
      this._svc = "/odata/v4/prioritisation";
      this._cfg = DEFAULT_CFG;
      this._rubrics = DEFAULT_RUBRICS;
      this.getView().setModel(new JSONModel({
        bridgeID: null, strategy: "Renew",
        dimSafety: 3, dimNetwork: 3, dimFinancial: 3, dimEnvironmental: 3, dimReputational: 3,
        likelihood: 4, likelihoodDerived: 4, likelihoodOverridden: false, likelihoodOverrideReason: "",
        criticality: "3.0", tier: 3, residual: 12, priorityScore: 0, band: "—", bandState: "None",
        formula: "", facts: {}, confidenceText: "", confidenceState: "None"
      }), "v");
      this.getView().setModel(new JSONModel({ rows: [] }), "wl");
      this.getView().setModel(new JSONModel({ rows: [] }), "br");
      this.getView().setModel(new JSONModel({ mode: "exec", bands: [], assessed: 0, p1: 0, stale: 0, topScore: 0, headline: "" }), "rep");

      this._DIMS = [["dimSafety", "Safety"], ["dimNetwork", "Network service"], ["dimFinancial", "Financial"], ["dimEnvironmental", "Environmental"], ["dimReputational", "Reputational"]];
      this._buildDimControls();
      this._buildLikelihood();
      this._buildMatrix();

      this._loadConfig();
      this._loadBridges();
      this._loadWorklist();
      this._recompute();
    },

    // ── data loads (fetch; OData V4 model handles auth/session) ──
    _get: function (path) {
      return fetch(this._svc + path, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error(r.statusText); return r.json(); });
    },

    _loadConfig: function () {
      var self = this;
      this._get("/Config?$filter=active eq true&$orderby=modifiedAt desc&$top=1").then(function (d) {
        var c = (d.value || [])[0];
        if (!c) return;
        var ladder; try { ladder = JSON.parse(c.bandThresholds); } catch (_e) { ladder = DEFAULT_CFG.bandThresholds; }
        self._cfg = {
          dimWeights: [+c.wSafety, +c.wNetwork, +c.wFinancial, +c.wEnvironmental, +c.wReputational],
          priorityWeights: [+c.wRisk, +c.wCrit, +c.wStrat],
          maxResidual: +c.maxResidual || 25, maxCriticality: +c.maxCriticality || 5,
          urgency: { Renew: +c.urgencyRenew, Maintain: +c.urgencyMaintain, Monitor: +c.urgencyMonitor, Decommission: +c.urgencyDecommission },
          bandThresholds: Array.isArray(ladder) ? ladder : DEFAULT_CFG.bandThresholds,
          version: c.version || "v1", formulaVersion: c.formulaVersion || "v1-normalised",
          methodologyOwner: c.methodologyOwner || "—"
        };
        // config-driven rubrics override the built-in anchors (gap #3)
        if (c.rubrics) { try { self._rubrics = JSON.parse(c.rubrics); } catch (_e) { /* keep defaults */ } }
        self.getView().getModel("v").setProperty("/methodologyOwner", self._cfg.methodologyOwner);
        self.getView().getModel("v").setProperty("/configVersion", self._cfg.version);
        self._recompute();
      }).catch(function (_e) {
        // surface (don't swallow) — the engine defaults still apply, but the user should know
        MessageToast.show("Live config unavailable — showing default methodology weights.");
      });
    },

    _loadBridges: function () {
      var self = this;
      this._bridgesLoaded = false;
      this._get("/AssessableBridges?$orderby=bridgeName&$top=500").then(function (d) {
        self.getView().getModel("br").setProperty("/rows", d.value || []);
        self._bridgesLoaded = true;
        self._buildReports(self.getView().getModel("wl").getProperty("/rows") || []); // refresh coverage once known
      }).catch(function (_e) {
        self._bridgesLoaded = false; // coverage must NOT default to 100% on failure
        MessageToast.show("Bridge list unavailable — portfolio coverage will show as unknown.");
      });
    },

    // Decorate a raw Assessment row with display fields (shared by the worklist + run history).
    _decorate: function (a) {
      return Object.assign({}, a, {
        bandState: BAND_STATE[a.band] || "None",
        confidence: (a.inputsAvailable != null ? a.inputsAvailable + " of " + a.inputsTotal : "—") + (a.conditionAsAtMonths != null ? " · " + a.conditionAsAtMonths + " mo" : ""),
        assessedAtText: a.assessedAt ? String(a.assessedAt).slice(0, 10) : "",
        critTier: (a.criticality != null ? Number(a.criticality).toFixed(1) : "—") + " · tier " + (a.tier != null ? a.tier : "—"),
        residualText: (a.residual != null ? a.residual + " / " + (this._cfg ? this._cfg.maxResidual : 25) : "—")
      });
    },

    _loadWorklist: function () {
      var self = this;
      var tbl = this.byId("wlTable"); if (tbl) { tbl.setBusy(true); }
      this.getView().getModel("wl").setProperty("/error", null);
      this._get("/Assessments?$filter=active eq true&$orderby=priorityScore desc&$top=500").then(function (d) {
        var rows = (d.value || []).map(function (a) { return self._decorate(a); });
        self.getView().getModel("wl").setProperty("/rows", rows);
        self._buildReports(rows);
        if (tbl) { tbl.setBusy(false); }
      }.bind(this)).catch(function (e) {
        if (tbl) { tbl.setBusy(false); }
        self.getView().getModel("wl").setProperty("/error", "Could not load the worklist: " + (e && e.message ? e.message : "service unavailable") + ". Retry, or check your access.");
      });
    },

    // ── live client preview engine (mirrors srv/lib/prioritisation.js with the loaded config) ──
    _normalise: function (w) { var s = w.reduce(function (a, b) { return a + Math.max(0, +b || 0); }, 0); return s <= 0 ? w.map(function () { return 1 / w.length; }) : w.map(function (x) { return Math.max(0, +x || 0) / s; }); },
    _bandOf: function (score) {
      var list = (this._cfg.bandThresholds || DEFAULT_CFG.bandThresholds).slice().sort(function (a, b) { return b.min - a.min; });
      var hit = list.find(function (b) { return score >= (+b.min || 0); });
      return (hit || list[list.length - 1]).code;
    },
    _compute: function () {
      var v = this.getView().getModel("v").getData();
      var dims = [v.dimSafety, v.dimNetwork, v.dimFinancial, v.dimEnvironmental, v.dimReputational].map(function (d) { return Math.min(5, Math.max(1, +d || 3)); });
      var w = this._normalise(this._cfg.dimWeights);
      var crit = dims.reduce(function (s, d, i) { return s + d * w[i]; }, 0);
      var tier = Math.min(5, Math.max(1, Math.round(crit)));
      var L = Math.min(5, Math.max(1, +v.likelihood || 3));
      var residual = L * tier;
      var riskN = residual / this._cfg.maxResidual * 100;
      var critN = crit / this._cfg.maxCriticality * 100;
      var stratN = +this._cfg.urgency[v.strategy] || 0;
      var pw = this._normalise(this._cfg.priorityWeights);
      var score = Math.round(pw[0] * riskN + pw[1] * critN + pw[2] * stratN);
      return { dims: dims, w: w, pw: pw, crit: crit, tier: tier, L: L, residual: residual, riskN: riskN, critN: critN, stratN: stratN, score: score, band: this._bandOf(score) };
    },

    _recompute: function () {
      var m = this.getView().getModel("v"); var v = m.getData();
      var c = this._compute();
      m.setProperty("/criticality", c.crit.toFixed(1));
      m.setProperty("/tier", c.tier);
      m.setProperty("/residual", c.residual);
      m.setProperty("/priorityScore", c.score);
      m.setProperty("/band", c.band);
      m.setProperty("/bandState", BAND_STATE[c.band] || "None");
      m.setProperty("/likelihoodOverridden", Number(v.likelihood) !== Number(v.likelihoodDerived));
      // segmented selections + the on-screen rubric anchor for each selected level (gap #3)
      this._DIMS.forEach(function (d) {
        this._segOn(this.byId("seg_" + d[0]), v[d[0]]);
        if (this._dimDesc && this._dimDesc[d[0]]) { this._dimDesc[d[0]].setText(v[d[0]] + " = " + this._rubricFor(d[0], v[d[0]])); }
      }, this);
      this._segOn(this.byId("seg_likelihood"), v.likelihood);
      // matrix highlight (consequence column = tier; active = tier × L)
      this._paintMatrix(c.tier, c.L);
      // decomposition + formula inspector (LIVE substituted values, not a static formula)
      this._renderDecomp(c);
      var rnd = function (x) { return Math.round(x * 100) / 100; };
      var f1 = "criticality = " + c.w.map(function (x, i) { return rnd(x) + "·" + c.dims[i]; }).join(" + ") + " = " + c.crit.toFixed(2) + "  → tier " + c.tier;
      var f2 = "residual risk = L(" + c.L + ") × consequence(" + c.tier + ") = " + c.residual + "   [restriction is a flag, not in the score]";
      var f3 = "priority = " + rnd(c.pw[0]) + "·riskN + " + rnd(c.pw[1]) + "·critN + " + rnd(c.pw[2]) + "·stratN = " +
        Math.round(c.pw[0] * c.riskN) + " + " + Math.round(c.pw[1] * c.critN) + " + " + Math.round(c.pw[2] * c.stratN) + " = " + c.score + "  → " + c.band;
      m.setProperty("/formula", f1 + "\n" + f2 + "\n" + f3);
    },

    // ── programmatic controls ──
    _seg: function (id, count, onPress) {
      var sb = new SegmentedButton(this.createId(id));
      for (var i = 1; i <= count; i++) { (function (val) { sb.addItem(new SegmentedButtonItem({ key: String(val), text: String(val), press: function () { onPress(val); } })); })(i);
      }
      return sb;
    },
    _segOn: function (sb, val) { if (sb) { try { sb.setSelectedKey(String(val)); } catch (_e) {} } },

    _buildDimControls: function () {
      var box = this.byId("dimsBox"); var self = this;
      this._dimDesc = {};
      this._DIMS.forEach(function (d) {
        var vb = new sap.m.VBox().addStyleClass("sapUiTinyMarginBottom");
        var row = new sap.m.HBox({ alignItems: "Center", justifyContent: "SpaceBetween" });
        row.addItem(new sap.m.Label({ text: d[1], width: "10rem" }));
        row.addItem(self._seg("seg_" + d[0], 5, function (val) { self.getView().getModel("v").setProperty("/" + d[0], val); self._recompute(); }));
        vb.addItem(row);
        // GAP #3: on-screen rubric anchor for the SELECTED level, so scoring is repeatable + needs no training.
        var desc = new sap.m.Text({ wrapping: true }).addStyleClass("sapUiTinyMarginBegin");
        desc.addStyleClass("sapUiContentLabelColor");
        self._dimDesc[d[0]] = desc;
        vb.addItem(desc);
        box.addItem(vb);
      });
    },
    _rubricFor: function (dimKey, level) {
      var r = (this._rubrics && this._rubrics[dimKey]) || DEFAULT_RUBRICS[dimKey] || {};
      return r[level] || r[String(level)] || "";
    },
    _buildLikelihood: function () {
      var self = this;
      this.byId("likBox").addItem(this._seg("seg_likelihood", 5, function (val) {
        self.getView().getModel("v").setProperty("/likelihood", val); self._recompute();
      }));
    },
    _buildMatrix: function () {
      var self = this; var box = this.byId("matrixBox");
      var grid = new sap.m.VBox(); // rows L5..L1
      this._matrixCells = {};
      for (var L = 5; L >= 1; L--) {
        var rowBox = new sap.m.HBox({ alignItems: "Center" });
        rowBox.addItem(new sap.m.Label({ text: "L" + L, width: "2rem" }).addStyleClass("sapUiTinyMarginEnd"));
        for (var C = 1; C <= 5; C++) {
          (function (L, C) {
            var sev = SEV(L * C);
            // GAP #12: aria-label carries the FULL meaning (L, C, residual, severity) — never
            // colour-only; the residual number is the visible text + the severity word is in the label.
            var cell = new sap.m.Button({ text: String(L * C), width: "2.6rem",
              tooltip: "Likelihood " + L + " × consequence " + C + " = residual " + (L * C) + " (" + sev.label + " severity). Click to set likelihood " + L + ".",
              press: function () { self.getView().getModel("v").setProperty("/likelihood", L); self._recompute(); } });
            cell.addStyleClass("sapUiTinyMarginEnd").addStyleClass("sapUiTinyMarginBottom");
            self._matrixCells[L + "_" + C] = cell;
            rowBox.addItem(cell);
          })(L, C);
        }
        grid.addItem(rowBox);
      }
      var foot = new sap.m.HBox(); foot.addItem(new sap.m.Label({ text: "", width: "2rem" }).addStyleClass("sapUiTinyMarginEnd"));
      ["C1", "C2", "C3", "C4", "C5"].forEach(function (c) { foot.addItem(new sap.m.Label({ text: c, width: "2.6rem", textAlign: "Center" }).addStyleClass("sapUiTinyMarginEnd")); });
      grid.addItem(foot);
      box.addItem(grid);
      // Non-colour severity legend (residual bands) — readable without relying on cell colour.
      var legend = new sap.m.HBox({ wrap: "Wrap" }).addStyleClass("sapUiTinyMarginTop");
      [["Low", "1–3"], ["Medium", "4–7"], ["High", "8–14"], ["Very High", "15–25"]].forEach(function (s) {
        legend.addItem(new sap.m.ObjectStatus({ text: s[0] + " (" + s[1] + ")", state: SEV(s[0] === "Low" ? 1 : s[0] === "Medium" ? 5 : s[0] === "High" ? 10 : 20).state, inverted: true }).addStyleClass("sapUiTinyMarginEnd"));
      });
      box.addItem(legend);
    },
    _paintMatrix: function (tier, L) {
      Object.keys(this._matrixCells || {}).forEach(function (k) {
        var parts = k.split("_"); var cl = +parts[0], C = +parts[1]; var cell = this._matrixCells[k];
        var resid = cl * C;
        // residual severity via button type (carries semantic state + the number text — not colour only)
        cell.setType(resid >= 15 ? "Reject" : resid >= 8 ? "Critical" : resid >= 4 ? "Attention" : "Accept");
        // the active (selected) cell = computed tier column × chosen likelihood row
        cell.setEnabled(true);
        if (C === tier && cl === L) { cell.setIcon("sap-icon://accept"); } else { cell.setIcon(""); }
      }, this);
    },
    _renderDecomp: function (c) {
      var box = this.byId("decompBox"); box.removeAllItems();
      var rows = [["Risk", c.pw[0] * c.riskN, c.riskN], ["Criticality", c.pw[1] * c.critN, c.critN], ["Strategy", c.pw[2] * c.stratN, c.stratN]];
      rows.forEach(function (r) {
        var hb = new sap.m.HBox({ alignItems: "Center" }).addStyleClass("sapUiTinyMarginBottom");
        hb.addItem(new sap.m.Label({ text: r[0], width: "6rem" }));
        hb.addItem(new sap.m.ProgressIndicator({ percentValue: Math.max(0, Math.min(100, Math.round(r[2]))), displayValue: "+" + Math.round(r[1]), showValue: true, width: "16rem", state: "Information" }));
        box.addItem(hb);
      });
    },

    // ── interactions ──
    onChange: function () { this._recompute(); },

    onPickBridge: function (oEvent) {
      var item = oEvent.getParameter("selectedItem"); if (!item) return;
      var id = parseInt(item.getKey(), 10);
      var self = this; var m = this.getView().getModel("v");
      m.setProperty("/bridgeID", id);
      // prefill action (read-only federated facts) via OData V4 unbound action
      fetch(this._svc + "/prefill", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin", body: JSON.stringify({ bridgeID: id }) })
        .then(function (r) { if (!r.ok) throw new Error(r.statusText); return r.json(); })
        .then(function (f) {
          m.setProperty("/likelihoodDerived", f.derivedLikelihood);
          m.setProperty("/likelihood", f.derivedLikelihood);
          m.setProperty("/facts", {
            conditionText: f.conditionRating != null ? ("CS rating " + f.conditionRating + (f.conditionAsAtMonths != null ? " · as-at " + f.conditionAsAtMonths + " mo" : "")) : "no condition data",
            loadText: f.loadRating != null ? (f.loadRating + " (" + (f.ratingStandardType || "AS5100") + ")") : "—",
            restrictionSummary: f.restrictionSummary || "None",
            riskText: "see register"
          });
          var fresh = f.conditionAsAtMonths;
          m.setProperty("/confidenceText", (f.inputsAvailable + " of " + f.inputsTotal + " inputs") + (fresh != null ? " · condition as-at " + fresh + " mo" : ""));
          m.setProperty("/confidenceState", (f.inputsAvailable < f.inputsTotal || (fresh != null && fresh > 12)) ? "Warning" : "Success");
          // RULE ENGINE: resolved model + read-only auto criteria (value · source · score)
          m.setProperty("/modelText", f.modelCode ? (f.modelCode + " v" + f.modelVersion + " · " + (f.aggregationMethod || "")) : "");
          var auto;
          try { auto = JSON.parse(f.autoCriteria || "[]"); } catch (_e) { auto = []; }
          m.setProperty("/autoCriteria", auto.map(function (a) {
            return { code: a.code, rawText: (a.raw == null ? "—" : String(a.raw)), source: a.source,
              scoreText: (a.score == null ? (a.note || "missing → flagged") : String(a.score)), weight: a.weight };
          }));
          self._recompute();
        })
        .catch(function (e) { MessageToast.show("Could not load bridge facts: " + e.message); });
    },

    // GAP #7: open ONE past run with its FROZEN inputs + the methodology from THAT run's snapshot
    // (the auditor/engineer view — reproduces a single ranking decision).
    onOpenRun: function (oEvent) {
      var ctx = oEvent.getSource().getBindingContext("wl"); if (!ctx) return;
      this._openRunDialog(ctx.getObject());
    },

    // Render one run's FROZEN detail (works for active OR superseded runs — full auditability).
    _openRunDialog: function (r) {
      var self = this;
      var rb = this.getView().getModel("i18n").getResourceBundle();
      // Council B4 (UI honesty): a fleet batch run is DATA-ONLY — say so up front, and never
      // render its empty judgement fields (strategy) as if an engineer chose them.
      var isFleet = r.runType === "fleet";
      var snap; try { snap = JSON.parse(r.paramSnapshot); } catch (_e) { snap = null; }
      var rub; try { rub = JSON.parse(r.rubricSnapshot); } catch (_e) { rub = null; }
      var L = function (k, val) { return new sap.m.HBox({ justifyContent: "SpaceBetween" }).addItem(new sap.m.Label({ text: k })).addItem(new sap.m.Text({ text: String(val == null ? "—" : val) })); };
      var dims = "S " + r.dimSafety + " · N " + r.dimNetwork + " · F " + r.dimFinancial + " · E " + r.dimEnvironmental + " · R " + r.dimReputational;
      var methodology;
      if (snap && isFleet) {
        // B6: fleet runs freeze the RESOLVED model bundle — summarise what was captured.
        methodology = rb.getText("runDetail.fleetBundle", [snap.model, snap.v,
          (snap.criteria || []).length, (snap.weights || []).length, (snap.rules || []).length,
          (snap.userTypeWeights || []).length, (snap.preFilters || []).length]);
      } else if (snap) {
        methodology = "criticality weights " + (snap.dimWeights || []).map(function (x) { return Math.round(x * 100) / 100; }).join("/") + "; priority " + (snap.priorityWeights || []).map(function (x) { return Math.round(x * 100) / 100; }).join("/") + "; bands " + (snap.bandThresholds || []).map(function (b) { return b.code + "≥" + b.min; }).join(", ");
      } else {
        methodology = "snapshot unavailable";
      }
      var items = [
        new sap.m.ObjectStatus({ text: r.band + " · score " + r.priorityScore + (r.active === false ? " · SUPERSEDED" : ""), state: r.bandState, inverted: true }).addStyleClass("sapUiTinyMarginBottom")
      ];
      if (isFleet) {
        items.push(new sap.m.ObjectStatus({ text: rb.getText("runDetail.fleetNote"), state: "Information" }).addStyleClass("sapUiTinyMarginBottom"));
      }
      items = items.concat([
        L(rb.getText("runDetail.runType"), rb.getText(isFleet ? "runDetail.runTypeFleet" : "runDetail.runTypeManual")),
        L("Criticality dimensions (1-5)", dims),
        L("Criticality · tier", r.critTier),
        L("Likelihood", r.likelihood + (r.likelihoodOverridden ? " (override of " + r.likelihoodDerived + ")" : " (derived)")),
        L("Override reason", r.likelihoodOverrideReason || (r.likelihoodOverridden ? "(missing)" : "n/a")),
        L("Residual", r.residualText),
        L("Strategy", isFleet ? rb.getText("runDetail.noStrategy") : r.strategy),
        L("Active restriction (flag)", r.restrictionFlag ? "Yes — treatment, not a score input" : "No"),
        L("Likely failure / mitigation $", (r.likelyFailureCostAud != null ? "$" + r.likelyFailureCostAud : "—") + " / " + (r.mitigationCostAud != null ? "$" + r.mitigationCostAud : "—")),
        L("Confidence", r.confidence),
        L("Assessed by · at", (r.assessedBy || "—") + " · " + r.assessedAtText),
        L("Methodology", r.formulaVersion + " / config " + r.configVersion)
      ]);
      // FROZEN rubric wording used at assess time (gap: reproduced runs must show what a level MEANT).
      if (rub) {
        items.push(new sap.m.Title({ text: "Scoring rubric used (frozen)", level: "H6" }).addStyleClass("sapUiSmallMarginTop"));
        [["dimSafety", "Safety"], ["dimNetwork", "Network"], ["dimFinancial", "Financial"], ["dimEnvironmental", "Environmental"], ["dimReputational", "Reputational"]].forEach(function (d) {
          var e = rub[d[0]]; if (e) items.push(new sap.m.Text({ text: d[1] + " " + e.level + " — " + e.text }).addStyleClass("sapUiContentLabelColor"));
        });
      }
      // RULE ENGINE: per-criterion model evaluation (configured model runs)
      var bd; try { bd = JSON.parse(r.criterionBreakdown); } catch (_e) { bd = null; }
      if (bd && bd.rows && !bd.delegated) {
        items.push(new sap.m.Title({ text: "Model evaluation — " + (r.modelCode || "") + " v" + (r.modelVersion || "") + (bd.forceReview ? "  ·  REVIEW REQUIRED" : ""), level: "H6" }).addStyleClass("sapUiSmallMarginTop"));
        bd.rows.filter(function (x) { return x.included !== false || x.note; }).slice(0, 24).forEach(function (x) {
          items.push(new sap.m.Text({ text: x.code + ": " + (x.raw == null ? "—" : x.raw) + " → " + (x.score == null ? (x.note || "missing") : x.score) + " ×w" + x.weight + (x.confidence < 1 ? " ×conf" + x.confidence : "") + " = +" + (x.contribution || 0), wrapping: true }).addStyleClass("sapUiContentLabelColor"));
        });
        (bd.flags || []).forEach(function (fl) {
          items.push(new sap.m.ObjectStatus({ text: fl, state: "Warning" }));
        });
      } else if (bd && bd.delegated) {
        items.push(new sap.m.Text({ text: "Model: " + (r.modelCode || "NSW-RISK-V1") + " v" + (r.modelVersion || 1) + " (approved formula, delegated)", wrapping: true }).addStyleClass("sapUiTinyMarginTop sapUiContentLabelColor"));
      }
      items.push(new sap.m.Text({ text: methodology, wrapping: true }).addStyleClass("sapUiSmallMarginTop sapUiContentLabelColor"));
      var dlg = new sap.m.Dialog({
        title: "Run detail — " + (r.bridgeName || r.bridgeRef), contentWidth: "540px",
        content: [new sap.m.VBox({ items: items }).addStyleClass("sapUiContentPadding")],
        buttons: [
          new sap.m.Button({ text: "Run history", icon: "sap-icon://history", press: function () { dlg.close(); self.onShowHistory(r.bridgeRef, r.bridgeName); } }),
          new sap.m.Button({ text: "Close", type: "Emphasized", press: function () { dlg.close(); } })
        ],
        afterClose: function () { dlg.destroy(); }
      });
      dlg.open();
    },

    // BL2: list ALL runs (active + superseded) for a bridge — each openable to its frozen detail.
    onShowHistory: function (bridgeRef, bridgeName) {
      var self = this;
      this._get("/Assessments?$filter=bridgeRef eq '" + String(bridgeRef).replace(/'/g, "''") + "'&$orderby=assessedAt desc&$top=200").then(function (d) {
        var rows = (d.value || []).map(function (a) { return self._decorate(a); });
        var list = new sap.m.List({ noDataText: "No runs for this bridge." });
        rows.forEach(function (r) {
          list.addItem(new sap.m.StandardListItem({
            title: r.assessedAtText + (r.active === false ? " · superseded" : " · current"),
            description: "Score " + r.priorityScore + " · " + (r.assessedBy || "—"),
            info: r.band, infoState: r.bandState, type: "Active",
            press: function () { hist.close(); self._openRunDialog(r); }
          }));
        });
        var hist = new sap.m.Dialog({
          title: "Run history — " + (bridgeName || bridgeRef), contentWidth: "480px",
          content: [list],
          beginButton: new sap.m.Button({ text: "Close", press: function () { hist.close(); } }),
          afterClose: function () { hist.destroy(); }
        });
        hist.open();
      }).catch(function (e) { MessageToast.show("Could not load run history: " + (e && e.message ? e.message : "service error")); });
    },

    onWorklistPress: function (oEvent) {
      var ctx = oEvent.getParameter("listItem").getBindingContext("wl"); if (!ctx) return;
      var row = ctx.getObject();
      // jump to Assess for that bridge (pre-selects the picker)
      var picker = this.byId("bridgePicker");
      var match = (this.getView().getModel("br").getProperty("/rows") || []).find(function (b) { return b.bridgeId === row.bridgeRef; });
      if (match) { picker.setSelectedKey(String(match.ID)); this.onPickBridge({ getParameter: function () { return picker.getSelectedItem(); } }); }
      this.byId("tabs").setSelectedKey("assess");
    },

    onSave: function () {
      var self = this; var v = this.getView().getModel("v").getData();
      if (!v.bridgeID) { MessageToast.show("Pick a bridge first."); return; }
      // GAP #14: a likelihood override needs a logged reason (client block; server also rejects).
      var reasonInput = this.byId("overrideReason");
      if (v.likelihoodOverridden && !String(v.likelihoodOverrideReason || "").trim()) {
        if (reasonInput) { reasonInput.setValueState("Error"); reasonInput.setValueStateText("A logged reason is required when overriding the derived likelihood (" + v.likelihoodDerived + ")."); reasonInput.focus(); }
        MessageToast.show("Enter a reason for the likelihood override before saving.");
        return;
      }
      if (reasonInput) { reasonInput.setValueState("None"); }
      var body = {
        bridge_ID: v.bridgeID, dimSafety: v.dimSafety, dimNetwork: v.dimNetwork, dimFinancial: v.dimFinancial,
        dimEnvironmental: v.dimEnvironmental, dimReputational: v.dimReputational,
        likelihood: v.likelihood, likelihoodOverrideReason: v.likelihoodOverridden ? v.likelihoodOverrideReason : null,
        strategy: v.strategy
      };
      fetch(this._svc + "/Assessments", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error((b.error && b.error.message) || r.statusText); }); })
        .then(function (saved) {
          // show the SERVER-AUTHORITATIVE result (engine recomputed on the server)
          MessageToast.show(self.getView().getModel("i18n").getResourceBundle().getText("assess.saved") + " " + saved.band + " · " + saved.priorityScore);
          self._loadWorklist();
          self.byId("tabs").setSelectedKey("worklist");
        })
        .catch(function (e) { MessageBox.error("Save failed: " + e.message); });
    },

    onTabSelect: function () {},
    onReportMode: function () {},

    // Export the exec one-pager. Primary: SERVER-RENDERED branded A4 PDF (figures computed
    // server-side from the immutable runs — reproducible). Fallback: client print-to-PDF.
    onExportPdf: function () {
      var self = this;
      var win = window.open("", "_blank"); // open synchronously (popup-blocker friendly)
      if (win) { try { win.document.write("<p style='font-family:sans-serif;padding:24px'>Generating server-rendered PDF&hellip;</p>"); } catch (_e) {} }
      fetch(this._svc + "/reportPdf()", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error(r.statusText); return r.json(); })
        .then(function (d) {
          if (!d || !d.contentBase64) throw new Error("empty document");
          var bin = atob(d.contentBase64);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
          var url = URL.createObjectURL(new Blob([bytes], { type: d.contentType || "application/pdf" }));
          if (win) { win.location.href = url; } else { window.open(url, "_blank"); }
          MessageToast.show("Server-rendered one-pager " + (d.docId || "") + " (reconciles to the stored runs).");
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        })
        .catch(function (e) {
          MessageToast.show("Server PDF unavailable (" + e.message + ") — using print fallback.");
          if (win) { try { win.close(); } catch (_e2) {} }
          self._pdfHtmlFallback();
        });
    },

    // Fallback: client-side print-to-PDF (self-contained, branded, print-formatted document).
    _pdfHtmlFallback: function () {
      var rep = this.getView().getModel("rep").getData();
      var cfg = this._cfg;
      var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };
      var today = new Date().toISOString().slice(0, 10);
      var bandRows = (rep.bands || []).map(function (b) {
        return '<tr><td><b>' + esc(b.code) + '</b></td><td style="text-align:right">' + esc(b.count) + '</td></tr>';
      }).join("");
      var w = this._normalise(cfg.dimWeights).map(function (x) { return Math.round(x * 100) / 100; });
      var pw = this._normalise(cfg.priorityWeights).map(function (x) { return Math.round(x * 100) / 100; });
      var html =
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Bridge Prioritisation — Portfolio One-Pager</title>' +
        '<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a18;max-width:760px;margin:0 auto;padding:24px;line-height:1.5}' +
        'h1{font-size:20px;margin:0 0 2px}.sub{color:#5F5E5A;font-size:12px;margin:0 0 16px}' +
        '.kpis{display:flex;gap:10px;margin:12px 0}.kpi{flex:1;background:#f4f3ee;border-radius:8px;padding:10px}.kpi .l{font-size:11px;color:#5F5E5A}.kpi .v{font-size:22px;font-weight:600}' +
        'table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}td{padding:4px 0;border-bottom:0.5px solid rgba(0,0,0,.12)}' +
        'h2{font-size:13px;margin:18px 0 4px}.note{font-size:13px}.appendix{font-size:11.5px;color:#5F5E5A;border-top:0.5px solid rgba(0,0,0,.2);margin-top:18px;padding-top:10px;white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace}' +
        '@media print{button{display:none}}</style></head><body>' +
        '<h1>Bridge Prioritisation — Portfolio One-Pager</h1>' +
        '<p class="sub">Generated ' + today + ' · figures read from immutable stored runs · methodology ' + esc(cfg.formulaVersion) + ' / config ' + esc(cfg.version) + '</p>' +
        '<div class="kpis">' +
        '<div class="kpi"><div class="l">Top-decile cost (' + esc(rep.topDecileN) + ' worst)</div><div class="v">' + esc(rep.topDecileCost) + '</div></div>' +
        '<div class="kpi"><div class="l">P1 critical</div><div class="v">' + esc(rep.p1) + '</div></div>' +
        '<div class="kpi"><div class="l">Assessed (coverage)</div><div class="v">' + esc(rep.assessed) + ' <span style="font-size:12px;color:#5F5E5A">/ ' + esc(rep.totalBridges) + ' · ' + esc(rep.coveragePct) + '%</span></div></div>' +
        '<div class="kpi"><div class="l">Stale inputs (&gt;12 mo)</div><div class="v">' + esc(rep.stale) + '</div></div></div>' +
        '<h2>Portfolio by band</h2><table>' + bandRows + '</table>' +
        '<h2>Headline</h2><p class="note">' + esc(rep.headline) + '</p>' +
        '<h2>Governance</h2><table>' +
        '<tr><td>Prepared</td><td style="text-align:right">' + esc(today) + '</td></tr>' +
        '<tr><td>Methodology owner</td><td style="text-align:right">' + esc(rep.methodologyOwner) + ' · ' + esc(cfg.formulaVersion) + ' / config ' + esc(cfg.version) + '</td></tr>' +
        '<tr><td>Methodology versions in this list</td><td style="text-align:right">' + esc((rep.methodologyVersions || []).join(", ")) + (rep.methodologyVersions && rep.methodologyVersions.length > 1 ? ' ⚠ mixed' : '') + '</td></tr>' +
        '<tr><td>Endorsed by / date</td><td style="text-align:right">__________________________ / __________</td></tr></table>' +
        '<div class="appendix"><b>Methodology appendix (reproducible)</b>\n' +
        'criticality = Σ(dimension × weight), weights ' + w.join(" / ") + ' (safety/network/financial/environmental/reputational), normalised to 1\n' +
        'tier = round(criticality), clamped 1..5\n' +
        'residual = likelihood × tier   [an active restriction is a treatment FLAG, never a score input]\n' +
        'priorityScore = ' + pw[0] + '·riskN + ' + pw[1] + '·critN + ' + pw[2] + '·stratN (normalised); band: 80/60/40/20 → P1..P5\n' +
        'top-decile cost = Σ mitigationCostAud over the worst ' + esc(rep.topDecileN) + ' runs (each run carries its own cost snapshot)\n' +
        'maxResidual ' + cfg.maxResidual + ' · maxCriticality ' + cfg.maxCriticality + ' · formula ' + esc(cfg.formulaVersion) + ' · config ' + esc(cfg.version) + '\n' +
        'Every run stores its inputs + its exact parameter snapshot, so any past list reproduces byte-identically. ' +
        ((rep.methodologyVersions || []).length > 1 ? 'WARNING: this list mixes methodology versions (' + esc((rep.methodologyVersions || []).join(", ")) + ') — re-run all assessments under one version before an external submission.' : 'All runs in this list share one methodology version.') +
        '</div>' +
        '<p style="margin-top:14px"><button onclick="window.print()">Print / Save as PDF</button></p>' +
        '</body></html>';
      var win = window.open("", "_blank");
      if (!win) { MessageToast.show("Allow pop-ups to export the one-pager."); return; }
      win.document.open(); win.document.write(html); win.document.close();
      win.focus();
      setTimeout(function () { try { win.print(); } catch (_e) {} }, 400);
    },

    // Raise an EAM work request from a stored run (bound action; server queues it — EAM untouched).
    onRaiseWorkRequest: function (oEvent) {
      var ctx = oEvent.getSource().getBindingContext("wl"); if (!ctx) return;
      var row = ctx.getObject();
      if (!row.ID) { MessageToast.show("No stored run for this row."); return; }
      var url = this._svc + "/Assessments(" + row.ID + ")/PrioritisationService.raiseWorkRequest";
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ requestType: "Inspection", notes: "Raised from prioritisation worklist (" + row.band + " · " + row.priorityScore + ")" }) })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (b) { throw new Error((b.error && b.error.message) || r.statusText); }); })
        .then(function (wr) { MessageToast.show("EAM work request " + wr.status + " for " + (wr.bridgeName || wr.bridgeRef) + " → " + wr.targetEamSystem + " (EAM not modified)."); })
        .catch(function (e) { MessageBox.error("Could not raise work request: " + e.message); });
    },

    _buildReports: function (rows) {
      var rep = this.getView().getModel("rep");
      var counts = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
      var stale = 0, top = 0;
      rows.forEach(function (r) { if (counts[r.band] != null) counts[r.band]++; if (r.conditionAsAtMonths != null && r.conditionAsAtMonths > 12) stale++; if (Number(r.priorityScore) > top) top = Number(r.priorityScore); });
      // GAP #9: $ cost of the TOP DECILE (ceil 10% of assessed, by score) — from each run's cost snapshot.
      var sorted = rows.slice().sort(function (a, b) { return Number(b.priorityScore) - Number(a.priorityScore); });
      var decileN = Math.max(1, Math.ceil(sorted.length * 0.1));
      var topDecileCost = sorted.slice(0, decileN).reduce(function (s, r) { return s + (Number(r.mitigationCostAud) || 0); }, 0);
      var fmtM = function (n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "m" : n > 0 ? "$" + Math.round(n / 1000) + "k" : "$0"; };
      // GAP #11 (hardened): coverage denominator = total portfolio. If the bridge list FAILED to
      // load, coverage is UNKNOWN — never fall back to rows.length (which would falsely read 100%).
      var brRows = this.getView().getModel("br").getProperty("/rows") || [];
      var bridgesKnown = this._bridgesLoaded === true && brRows.length > 0;
      var totalBridges = bridgesKnown ? brRows.length : null;
      var coveragePct = bridgesKnown ? Math.round(rows.length / totalBridges * 100) : null;
      // mixed-methodology guard for the appendix reproducibility note
      var versions = Array.from(new Set(rows.map(function (r) { return (r.formulaVersion || "?") + "/" + (r.configVersion || "?"); })));
      rep.setProperty("/assessed", rows.length);
      rep.setProperty("/totalBridges", bridgesKnown ? totalBridges : "—");
      rep.setProperty("/coveragePct", bridgesKnown ? coveragePct : "—");
      rep.setProperty("/p1", counts.P1);
      rep.setProperty("/stale", stale);
      rep.setProperty("/topScore", top);
      rep.setProperty("/topDecileCost", fmtM(topDecileCost));
      rep.setProperty("/topDecileN", decileN);
      rep.setProperty("/methodologyVersions", versions);
      rep.setProperty("/methodologyOwner", (this._cfg && this._cfg.methodologyOwner) || "—");
      rep.setProperty("/asAt", new Date().toISOString().slice(0, 10));
      rep.setProperty("/bands", ["P1", "P2", "P3", "P4", "P5"].map(function (c) { return { code: c, count: counts[c], state: BAND_STATE[c] }; }));
      rep.setProperty("/headline",
        counts.P1 + " of " + rows.length + " assessed structures are P1 critical" +
        (bridgesKnown ? " (covering " + coveragePct + "% of the " + totalBridges + "-bridge portfolio). " : " (portfolio size unavailable — coverage not shown). ") +
        "Funding the top decile (" + decileN + " worst) is an estimated " + fmtM(topDecileCost) + " of intervention. " +
        stale + " run(s) rely on condition data older than 12 months and should be re-inspected before the funding submission. " +
        "All figures read from the immutable stored runs" + (versions.length > 1 ? " (NOTE: " + versions.length + " methodology versions present — re-run for a single-version submission)." : ".")
      );
    }
  });
});
