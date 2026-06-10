sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "BridgeManagement/bmsadmin/model/odataCrud"
], function (Controller, JSONModel, MessageToast, MessageBox, odataCrud) {
  "use strict";

  // Model Builder (rule engine): criteria catalogue, per-class weights, aggregation rules.
  // Reads/writes the governed config via PrioritisationService (admin-gated; ChangeLogged).
  return Controller.extend("BridgeManagement.bmsadmin.controller.PrioritisationModels", {

    onInit: function () {
      this._svc = odataCrud(this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/PrioritisationService/uri"));
      this.getView().setModel(new JSONModel({ models: [], selected: null, detail: {}, criteria: [], weights: [], rules: [] }), "pm");
      this._load();
    },

    _load: function () {
      var self = this; var pm = this.getView().getModel("pm");
      this._svc.list("Models", "?$orderby=code,version").then(function (models) {
        pm.setProperty("/models", models);
        var sel = pm.getProperty("/selected") || (models[0] && models[0].ID);
        pm.setProperty("/selected", sel);
        return self._loadDetail(sel);
      }).catch(function (e) { MessageBox.error("Could not load models: " + e.message); });
    },

    _loadDetail: function (modelId) {
      if (!modelId) { return Promise.resolve(); }
      var pm = this.getView().getModel("pm");
      var detail = (pm.getProperty("/models") || []).find(function (m) { return m.ID === modelId; }) || {};
      pm.setProperty("/detail", detail);
      return Promise.all([
        this._svc.list("ModelCriteria", "?$filter=model_ID eq " + modelId + "&$orderby=displayOrder"),
        this._svc.list("ModelClassWeights", "?$filter=model_ID eq " + modelId),
        this._svc.list("ModelRules", "?$filter=model_ID eq " + modelId),
        this._svc.list("ModelBindings", "")
      ]).then(function (r) {
        var crit = r[0]; var weights = r[1]; var rules = r[2]; var binds = r[3];
        var byId = {}; crit.forEach(function (c) { byId[c.ID] = c.code; });
        crit.forEach(function (c) {
          c.bindingText = binds.filter(function (b) { return b.criterion_ID === c.ID; })
            .map(function (b) { return b.sourceType + ":" + b.sourceRef; }).join(" | ");
        });
        weights.forEach(function (w) { w.criterionCode = byId[w.criterion_ID] || w.criterion_ID; });
        rules.forEach(function (x) { x.criterionCode = byId[x.criterion_ID] || (x.criterion_ID ? x.criterion_ID : "(global)"); });
        pm.setProperty("/criteria", crit);
        pm.setProperty("/weights", weights);
        pm.setProperty("/rules", rules);
      }).catch(function (e) { MessageBox.error("Could not load model detail: " + e.message); });
    },

    onModelChange: function () { this._loadDetail(this.getView().getModel("pm").getProperty("/selected")); },
    onRefresh: function () { this._load(); MessageToast.show("Refreshed."); },

    _patch: function (set, ctx, body, revert) {
      var self = this;
      var row = ctx.getObject();
      this._svc.update(set, row.ID, body).then(function () {
        MessageToast.show("Saved — applies to FUTURE runs only (past runs are immutable).");
      }).catch(function (e) {
        MessageBox.error("Save failed: " + e.message);
        if (revert) { revert(); }
        self._loadDetail(self.getView().getModel("pm").getProperty("/selected"));
      });
    },

    onWeightChange: function (oEvent) {
      var ctx = oEvent.getSource().getBindingContext("pm");
      var v = Number(oEvent.getParameter("value"));
      if (!Number.isFinite(v) || v < 0 || v > 10) { MessageToast.show("Weight must be 0–10."); this._loadDetail(this.getView().getModel("pm").getProperty("/selected")); return; }
      this._patch("ModelClassWeights", ctx, { weight: v });
    },
    onIncludedChange: function (oEvent) {
      this._patch("ModelClassWeights", oEvent.getSource().getBindingContext("pm"), { included: oEvent.getParameter("state") });
    },
    onPolicyChange: function (oEvent) {
      this._patch("ModelClassWeights", oEvent.getSource().getBindingContext("pm"), { missingDataPolicy: oEvent.getParameter("selectedItem").getKey() });
    },
    onCriterionActive: function (oEvent) {
      this._patch("ModelCriteria", oEvent.getSource().getBindingContext("pm"), { active: oEvent.getParameter("state") });
    },
    onRuleActive: function (oEvent) {
      this._patch("ModelRules", oEvent.getSource().getBindingContext("pm"), { active: oEvent.getParameter("state") });
    }
  });
});
