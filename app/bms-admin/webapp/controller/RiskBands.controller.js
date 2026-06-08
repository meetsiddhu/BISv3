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

  return Controller.extend("BridgeManagement.bmsadmin.controller.RiskBands", {

    onInit: function () {
      this._svc = odataCrud(this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/AdminService/uri"));
      this.getView().setModel(new JSONModel({ rows: [] }));
      this._load();
    },

    _load: function () {
      var m = this.getView().getModel();
      this._svc.list("RiskBand", "?$orderby=sortOrder").then(function (rows) {
        m.setProperty("/rows", rows);
      }).catch(function (e) { MessageBox.error("Failed to load risk bands: " + e.message); });
    },

    onRefresh: function () { this._load(); MessageToast.show("Refreshed."); },
    _savedToast: function () { MessageToast.show("Saved. Risk priorities recalculated across the fleet."); },

    // Validate the resulting ACTIVE band ladder: a band starting at 0, strictly-decreasing
    // mins (no duplicate threshold), and minScore <= maxScore. Returns an error string or null.
    _validateLadder: function (rows) {
      var active = rows.filter(function (r) { return r.active !== false && r.minScore != null; })
        .map(function (r) { return { name: r.name || r.code, min: Number(r.minScore), max: Number(r.maxScore) }; })
        .sort(function (a, b) { return b.min - a.min; });
      if (!active.length) { return "At least one active band is required."; }
      for (var i = 0; i < active.length; i++) {
        if (!isFinite(active[i].min)) { return "Band \"" + active[i].name + "\" has a non-numeric Min Score."; }
        if (isFinite(active[i].max) && active[i].max < active[i].min) { return "Band \"" + active[i].name + "\": Max Score is below Min Score."; }
        if (i > 0 && active[i].min === active[i - 1].min) { return "Bands \"" + active[i - 1].name + "\" and \"" + active[i].name + "\" share the same Min Score (" + active[i].min + ")."; }
      }
      if (active[active.length - 1].min !== 0) { return "The lowest active band must start at Min Score 0 to cover the full range."; }
      return null;
    },

    onToggleActive: function (oEvent) {
      var self = this, src = oEvent.getSource();
      var row = src.getBindingContext().getObject();
      var state = oEvent.getParameter("state");
      // Validate the prospective ladder BEFORE committing (a toggle can open a gap).
      var rows = this.getView().getModel().getProperty("/rows").map(function (r) {
        return r.code === row.code ? Object.assign({}, r, { active: state }) : r;
      });
      var err = this._validateLadder(rows);
      if (err) { MessageBox.error("Cannot apply: " + err); src.setState(!state); return; }
      this._svc.update("RiskBand", "'" + encodeURIComponent(row.code) + "'", { active: state })
        .then(function () { self._savedToast(); self._load(); })
        .catch(function (e) { MessageBox.error("Failed to update: " + e.message); src.setState(!state); });
    },

    onAdd: function () { this._openDialog(null); },
    onEdit: function (oEvent) { this._openDialog(oEvent.getSource().getBindingContext().getObject()); },

    _openDialog: function (data) {
      var self = this;
      var bEdit = !!data;
      var dlg = new JSONModel(Object.assign({ code: "", name: "", minScore: 0, maxScore: 0, colour: "#0a6ed1", sortOrder: 0, active: true }, data || {}));
      var d = new Dialog({
        title: bEdit ? "Edit Risk Band" : "Add Risk Band",
        contentWidth: "440px",
        content: [ new VBox({ class: "sapUiContentPadding", items: [
          new Label({ text: "Code *" }), new Input({ value: "{dlg>/code}", editable: !bEdit, placeholder: "e.g. VeryHigh" }),
          new Label({ text: "Band name *" }), new Input({ value: "{dlg>/name}" }),
          new Label({ text: "Min Score (0–100) *" }), new Input({ value: "{dlg>/minScore}", type: "Number" }),
          new Label({ text: "Max Score (0–100) *" }), new Input({ value: "{dlg>/maxScore}", type: "Number" }),
          new Label({ text: "Colour (hex)" }), new Input({ value: "{dlg>/colour}", placeholder: "#BB0000" }),
          new Label({ text: "Sort Order" }), new Input({ value: "{dlg>/sortOrder}", type: "Number" })
        ]})],
        beginButton: new Button({ text: bEdit ? "Save" : "Add", type: "Emphasized", press: function () {
          var v = dlg.getData();
          if (!bEdit && !String(v.code || "").trim()) { MessageToast.show("Code is required."); return; }
          if (!String(v.name || "").trim()) { MessageToast.show("Band name is required."); return; }
          var min = Number(v.minScore), max = Number(v.maxScore);
          if (!isFinite(min) || min < 0 || min > 100 || !isFinite(max) || max < 0 || max > 100) { MessageToast.show("Min/Max must be between 0 and 100."); return; }
          if (max < min) { MessageToast.show("Max Score must be >= Min Score."); return; }
          // Validate the whole ladder with this row applied.
          var rows = self.getView().getModel().getProperty("/rows").slice();
          var idx = rows.findIndex(function (r) { return r.code === v.code; });
          var merged = { code: String(v.code).trim(), name: v.name, minScore: min, maxScore: max, colour: v.colour, sortOrder: Number(v.sortOrder) || 0, active: v.active !== false };
          if (idx >= 0) { rows[idx] = merged; } else { rows.push(merged); }
          var err = self._validateLadder(rows);
          if (err) { MessageBox.error("Cannot save — the band ladder would be invalid: " + err); return; }
          var body = { name: merged.name, minScore: min, maxScore: max, colour: merged.colour, sortOrder: merged.sortOrder, active: merged.active };
          var p = bEdit
            ? self._svc.update("RiskBand", "'" + encodeURIComponent(v.code) + "'", body)
            : self._svc.create("RiskBand", Object.assign({ code: merged.code }, body));
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
        "Risk Bands map a numeric risk score (0–100) to a priority label (e.g. Very High / High / " +
        "Medium / Low). The lowest band must start at 0 and each band's Min Score must be unique, so the " +
        "ladder covers the whole range with no gaps or overlaps. Editing a threshold re-scores every bridge's " +
        "priority immediately (audited as 'Calibration'). Use the Active switch to retire a band (soft-delete).",
        { title: "Risk Bands (score thresholds)" });
    }
  });
});
