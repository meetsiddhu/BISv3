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
          version: c.version || "v1", formulaVersion: c.formulaVersion || "v1-normalised"
        };
        self._recompute();
      }).catch(function () { /* defaults stand */ });
    },

    _loadBridges: function () {
      var self = this;
      this._get("/AssessableBridges?$orderby=bridgeName&$top=500").then(function (d) {
        self.getView().getModel("br").setProperty("/rows", d.value || []);
      }).catch(function () {});
    },

    _loadWorklist: function () {
      var self = this;
      this._get("/Assessments?$filter=active eq true&$orderby=priorityScore desc&$top=500").then(function (d) {
        var rows = (d.value || []).map(function (a) {
          return Object.assign({}, a, {
            bandState: BAND_STATE[a.band] || "None",
            confidence: (a.inputsAvailable != null ? a.inputsAvailable + " of " + a.inputsTotal : "—") + (a.conditionAsAtMonths != null ? " · " + a.conditionAsAtMonths + " mo" : ""),
            assessedAtText: a.assessedAt ? String(a.assessedAt).slice(0, 10) : "",
            critTier: (a.criticality != null ? Number(a.criticality).toFixed(1) : "—") + " · tier " + (a.tier != null ? a.tier : "—"),
            residualText: (a.residual != null ? a.residual + " / " + (this._cfg ? this._cfg.maxResidual : 25) : "—")
          });
        }, this);
        self.getView().getModel("wl").setProperty("/rows", rows);
        self._buildReports(rows);
      }.bind(this)).catch(function () {});
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
      // segmented selections
      this._DIMS.forEach(function (d) { this._segOn(this.byId("seg_" + d[0]), v[d[0]]); }, this);
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
      this._DIMS.forEach(function (d) {
        var row = new sap.m.HBox({ alignItems: "Center", justifyContent: "SpaceBetween" }).addStyleClass("sapUiTinyMarginBottom");
        row.addItem(new sap.m.Label({ text: d[1], width: "10rem" }));
        row.addItem(self._seg("seg_" + d[0], 5, function (val) { self.getView().getModel("v").setProperty("/" + d[0], val); self._recompute(); }));
        box.addItem(row);
      });
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
            var cell = new sap.m.Button({ text: String(L * C), width: "2.6rem",
              tooltip: "Likelihood " + L + " × consequence " + C + " = residual " + (L * C) + ". Click to set likelihood " + L + ".",
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
          self._recompute();
        })
        .catch(function (e) { MessageToast.show("Could not load bridge facts: " + e.message); });
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
    onExportPdf: function () { window.print(); },

    _buildReports: function (rows) {
      var rep = this.getView().getModel("rep");
      var counts = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 };
      var stale = 0, top = 0;
      rows.forEach(function (r) { if (counts[r.band] != null) counts[r.band]++; if (r.conditionAsAtMonths != null && r.conditionAsAtMonths > 12) stale++; if (Number(r.priorityScore) > top) top = Number(r.priorityScore); });
      rep.setProperty("/assessed", rows.length);
      rep.setProperty("/p1", counts.P1);
      rep.setProperty("/stale", stale);
      rep.setProperty("/topScore", top);
      rep.setProperty("/bands", ["P1", "P2", "P3", "P4", "P5"].map(function (c) { return { code: c, count: counts[c], state: BAND_STATE[c] }; }));
      rep.setProperty("/headline", counts.P1 + " structure(s) are P1 critical of " + rows.length + " assessed. " + stale + " run(s) rely on condition data older than 12 months and should be re-inspected before the funding submission. (All figures read from the immutable stored runs.)");
    }
  });
});
