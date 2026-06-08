sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/ui/core/Item",
  "sap/m/VBox",
  "sap/m/Label",
  "BridgeManagement/bmsadmin/model/odataCrud"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Input, ComboBox, Item, VBox, Label, odataCrud) {
  "use strict";

  return Controller.extend("BridgeManagement.bmsadmin.controller.AssetStrategy", {

    onInit: function () {
      this._svc = odataCrud(this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/AdminService/uri"));
      this.getView().setModel(new JSONModel({ rows: [], assetClasses: [], transportModes: [] }));
      this._load();
      // Lookups for the dialog dropdowns (non-fatal if they fail; free-text still works).
      this._svc.list("AssetClasses", "?$orderby=code").then(function (r) { this.getView().getModel().setProperty("/assetClasses", r); }.bind(this)).catch(function () {});
      this._svc.list("TransportModes", "?$orderby=code").then(function (r) { this.getView().getModel().setProperty("/transportModes", r); }.bind(this)).catch(function () {});
    },

    _load: function () {
      var m = this.getView().getModel();
      this._svc.list("AssetClassStrategy", "?$orderby=assetClass,transportMode").then(function (rows) {
        m.setProperty("/rows", rows);
      }).catch(function (e) { MessageBox.error("Failed to load strategies: " + e.message); });
    },

    onRefresh: function () { this._load(); MessageToast.show("Refreshed."); },
    _savedToast: function () { MessageToast.show("Saved. Inspection-due & risk recalculated across the fleet."); },

    onToggleActive: function (oEvent) {
      var self = this, src = oEvent.getSource();
      var row = src.getBindingContext().getObject();
      var state = oEvent.getParameter("state");
      // Server rejects deactivating a strategy that is still assigned to a bridge (409) —
      // surface that and revert the switch.
      this._svc.update("AssetClassStrategy", row.ID, { active: state })
        .then(function () { self._savedToast(); self._load(); })
        .catch(function (e) { MessageBox.error(e.message); src.setState(!state); });
    },

    onAdd: function () { this._openDialog(null); },
    onEdit: function (oEvent) { this._openDialog(oEvent.getSource().getBindingContext().getObject()); },

    _combo: function (label, path, listProp) {
      var cb = new ComboBox({ selectedKey: "{dlg>" + path + "}", value: "{dlg>" + path + "}", width: "100%",
        items: { path: listProp, template: new Item({ key: "{code}", text: "{= ${code} + (${name} ? ' — ' + ${name} : '') }" }) } });
      return new VBox({ items: [ new Label({ text: label }), cb ] });
    },

    _openDialog: function (data) {
      var self = this;
      var bEdit = !!(data && data.ID);
      var dlg = new JSONModel(Object.assign({
        ID: null, name: "", assetClass: "", transportMode: "Road", inspectionIntervalMonths: 24,
        targetConditionRating: null, interventionThreshold: null, reviewCycleMonths: null,
        description: "", eamMaintenancePlan: "", active: true
      }, data || {}));
      dlg.setProperty("/_lists", this.getView().getModel().getData());
      var d = new Dialog({
        title: bEdit ? "Edit Asset Class Strategy" : "Add Asset Class Strategy",
        contentWidth: "480px",
        content: [ new VBox({ class: "sapUiContentPadding", items: [
          new Label({ text: "Strategy name *" }), new Input({ value: "{dlg>/name}" }),
          this._combo("Asset Class *", "/assetClass", "dlg>/_lists/assetClasses"),
          this._combo("Transport Mode *", "/transportMode", "dlg>/_lists/transportModes"),
          new Label({ text: "Inspection Interval (months) *" }), new Input({ value: "{dlg>/inspectionIntervalMonths}", type: "Number" }),
          new Label({ text: "Target Condition (1–10)" }), new Input({ value: "{dlg>/targetConditionRating}", type: "Number" }),
          new Label({ text: "Intervention Threshold (1–10)" }), new Input({ value: "{dlg>/interventionThreshold}", type: "Number" }),
          new Label({ text: "Review Cycle (months)" }), new Input({ value: "{dlg>/reviewCycleMonths}", type: "Number" }),
          new Label({ text: "EAM Maintenance Plan (ref)" }), new Input({ value: "{dlg>/eamMaintenancePlan}" }),
          new Label({ text: "Description" }), new Input({ value: "{dlg>/description}" })
        ]})],
        beginButton: new Button({ text: bEdit ? "Save" : "Add", type: "Emphasized", press: function () {
          var v = dlg.getData();
          if (!String(v.name || "").trim()) { MessageToast.show("Strategy name is required."); return; }
          if (!String(v.assetClass || "").trim() || !String(v.transportMode || "").trim()) { MessageToast.show("Asset Class and Transport Mode are required."); return; }
          var interval = Number(v.inspectionIntervalMonths);
          if (!Number.isFinite(interval) || interval < 1 || interval > 240) { MessageToast.show("Inspection interval must be 1–240 months."); return; }
          // Natural-key uniqueness check (assetClass + transportMode) within the current list.
          var dupe = self.getView().getModel().getProperty("/rows").find(function (r) {
            return r.ID !== v.ID && (r.assetClass || "") === v.assetClass && (r.transportMode || "") === v.transportMode;
          });
          if (dupe) { MessageBox.error("A strategy already exists for " + v.assetClass + " / " + v.transportMode + ". Edit that one instead."); return; }
          var num = function (x) { return x === "" || x == null ? null : Number(x); };
          var body = {
            name: v.name, assetClass: v.assetClass, transportMode: v.transportMode,
            inspectionIntervalMonths: interval, targetConditionRating: num(v.targetConditionRating),
            interventionThreshold: num(v.interventionThreshold), reviewCycleMonths: num(v.reviewCycleMonths),
            description: v.description, eamMaintenancePlan: v.eamMaintenancePlan, active: v.active !== false
          };
          var p = bEdit ? self._svc.update("AssetClassStrategy", v.ID, body) : self._svc.create("AssetClassStrategy", body);
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
        "Asset Class Strategy defines the inspection interval and intervention policy per asset class and " +
        "transport mode (the ISO 55000 strategy layer). It drives each bridge's Next Inspection Due / Overdue / " +
        "Policy-Intervention-Due signals and the RUL estimate, and maps to an SAP EAM maintenance plan (EAM executes " +
        "the schedule). Editing a strategy recalculates inspection-due + risk for the fleet. A strategy assigned to a " +
        "bridge cannot be deactivated until those bridges are reassigned (soft-delete; the audit trail is preserved).",
        { title: "Asset Class Strategy (inspection & intervention policy)" });
    }
  });
});
