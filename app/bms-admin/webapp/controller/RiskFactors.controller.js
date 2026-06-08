sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Input",
  "sap/m/VBox",
  "sap/m/Label",
  "BridgeManagement/bmsadmin/model/odataCrud"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Input, VBox, Label, odataCrud) {
  "use strict";

  return Controller.extend("BridgeManagement.bmsadmin.controller.RiskFactors", {

    onInit: function () {
      var base = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/AdminService/uri");
      this._svc = odataCrud(base);
      this.getView().setModel(new JSONModel({ rows: [] }));
      this._load();
    },

    _load: function () {
      var m = this.getView().getModel();
      this._svc.list("RiskConfig", "?$orderby=factor").then(function (rows) {
        m.setProperty("/rows", rows);
      }).catch(function (e) { MessageBox.error("Failed to load risk factors: " + e.message); });
    },

    onRefresh: function () { this._load(); MessageToast.show("Refreshed."); },

    // Inform the user that scoring was recalculated (the AdminService after-handler rescored
    // the fleet on this config write). Surface the server's "N bridges rescored" message if present.
    _savedToast: function () { MessageToast.show("Saved. Risk scores recalculated across the fleet."); },

    onToggleActive: function (oEvent) {
      var self = this;
      var row = oEvent.getSource().getBindingContext().getObject();
      var state = oEvent.getParameter("state");
      this._svc.update("RiskConfig", "'" + encodeURIComponent(row.factor) + "'", { active: state })
        .then(function () { self._savedToast(); self._load(); })
        .catch(function (e) { MessageBox.error("Failed to update: " + e.message); oEvent.getSource().setState(!state); });
    },

    onAdd: function () { this._openDialog(null); },

    onEdit: function (oEvent) { this._openDialog(oEvent.getSource().getBindingContext().getObject()); },

    _openDialog: function (data) {
      var self = this;
      var bEdit = !!data;
      var dlg = new JSONModel(Object.assign({ factor: "", name: "", weight: 1, active: true }, data || {}));
      var d = new Dialog({
        title: bEdit ? "Edit Risk Factor" : "Add Risk Factor",
        contentWidth: "420px",
        content: [ new VBox({ class: "sapUiContentPadding", items: [
          new Label({ text: "Factor key *" }),
          new Input({ value: "{dlg>/factor}", editable: !bEdit, placeholder: "e.g. consequence_traffic" }),
          new Label({ text: "Name" }),
          new Input({ value: "{dlg>/name}" }),
          new Label({ text: "Weight (0–10) *" }),
          new Input({ value: "{dlg>/weight}", type: "Number" })
        ]})],
        beginButton: new Button({ text: bEdit ? "Save" : "Add", type: "Emphasized", press: function () {
          var v = dlg.getData();
          var w = Number(v.weight);
          if (!bEdit && !String(v.factor || "").trim()) { MessageToast.show("Factor key is required."); return; }
          if (!Number.isFinite(w) || w < 0 || w > 10) { MessageToast.show("Weight must be a number between 0 and 10."); return; }
          var body = { name: v.name, weight: w, active: v.active !== false };
          var p = bEdit
            ? self._svc.update("RiskConfig", "'" + encodeURIComponent(v.factor) + "'", body)
            : self._svc.create("RiskConfig", Object.assign({ factor: String(v.factor).trim() }, body));
          p.then(function () { d.close(); self._savedToast(); self._load(); })
           .catch(function (e) { MessageBox.error("Save failed: " + e.message); });
        }}),
        endButton: new Button({ text: "Cancel", press: function () { d.close(); } }),
        afterClose: function () { d.destroy(); }
      });
      d.setModel(dlg, "dlg");
      d.open();
    },

    onShowHelp: function () {
      MessageBox.information(
        "Risk Factors are the weightings the risk engine applies to each scoring component " +
        "(consequence_importance, likelihood_condition, mode_<Mode>, prob_<1..5>, etc.). " +
        "Editing a weight here re-scores the whole fleet immediately (audited as 'Calibration'). " +
        "Weights must be between 0 and 10; setting a factor inactive falls back to its built-in default.",
        { title: "Risk Factors (scoring weightings)" });
    }
  });
});
