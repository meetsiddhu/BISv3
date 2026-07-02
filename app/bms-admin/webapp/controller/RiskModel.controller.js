sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
  "use strict";

  // Governed Risk configuration (weighting factors + band thresholds) as a VERSIONED model —
  // mirrors the BSI/BHI config screen. Reads/writes /system/api/risk-config (backed by the
  // relational RiskModel; the risk engine reads the ACTIVE version). Clone → tune a Draft →
  // Activate (retiring the prior version). Nothing hardcoded; every change is audited.

  return Controller.extend("BridgeManagement.bmsadmin.controller.RiskModel", {

    _t: function (k, a) { return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(k, a); },

    onInit: function () {
      this._systemBase = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/SystemService/uri").replace(/\/$/, "");
      this.getView().setModel(new JSONModel({ factors: [], bands: [], models: [], selectedModel: null, dirty: false }), "risk");
      this._load();
    },

    _load: function (modelID) {
      var self = this, m = this.getView().getModel("risk");
      var url = this._systemBase + "/risk-config" + (modelID ? "?modelID=" + encodeURIComponent(modelID) : "");
      fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("risk.msg.loadFailedShort")); }); })
        .then(function (data) {
          self._currentModelID = (data.selectedModel && data.selectedModel.ID) || null;
          // Only the global ('*') factors + bands are edited here; per-class overrides are API-managed.
          m.setProperty("/factors", (data.factors || []).filter(function (f) { return (f.assetClass || "*") === "*"; })
            .map(function (f) { return { factorKey: f.factorKey, name: f.name || f.factorKey, weight: Number(f.weight) }; }));
          m.setProperty("/bands", (data.bands || []).filter(function (b) { return (b.assetClass || "*") === "*"; })
            .sort(function (a, b) { return Number(b.minScore) - Number(a.minScore); })
            .map(function (b) { return { code: b.code, name: b.name, minScore: Number(b.minScore), maxScore: b.maxScore == null ? null : Number(b.maxScore), colour: b.colour, sortOrder: b.sortOrder, rationale: b.rationale }; }));
          m.setProperty("/models", (data.models || []).map(function (v) {
            return { ID: v.ID, code: v.code, version: v.version, status: v.status, label: (v.name || v.code) + " · v" + v.version + " (" + v.status + ")" };
          }));
          m.setProperty("/selectedModel", data.selectedModel || null);
          m.setProperty("/dirty", false);
        })
        .catch(function (e) { MessageBox.error(self._t("risk.msg.loadFailed", [e.message])); });
    },

    onCellChange: function () { this.getView().getModel("risk").setProperty("/dirty", true); },

    onAddBand: function () {
      var m = this.getView().getModel("risk"), bands = (m.getProperty("/bands") || []).slice();
      bands.push({ code: "NEW", name: "New band", minScore: 0, maxScore: null, colour: "Neutral", sortOrder: bands.length });
      m.setProperty("/bands", bands);
      m.setProperty("/dirty", true);
    },

    onRemoveBand: function (oEvent) {
      var idx = parseInt(oEvent.getSource().getBindingContext("risk").getPath().split("/").pop(), 10);
      var m = this.getView().getModel("risk"), bands = (m.getProperty("/bands") || []).slice();
      bands.splice(idx, 1);
      m.setProperty("/bands", bands);
      m.setProperty("/dirty", true);
    },

    onSave: function () {
      var self = this, m = this.getView().getModel("risk");
      var factors = (m.getProperty("/factors") || []).map(function (f) { return { assetClass: "*", factorKey: f.factorKey, name: f.name, weight: Number(f.weight) }; });
      var bands = (m.getProperty("/bands") || []).map(function (b) { return { assetClass: "*", code: b.code, name: b.name, minScore: Number(b.minScore), maxScore: b.maxScore === null || b.maxScore === "" ? null : Number(b.maxScore), colour: b.colour, sortOrder: b.sortOrder, rationale: b.rationale }; });
      fetch(this._systemBase + "/risk-config", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": "bms-risk" },
        body: JSON.stringify({ modelID: this._currentModelID, factors: factors, bands: bands })
      }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("risk.msg.saveFailedShort")); }); })
        .then(function () { MessageToast.show(self._t("risk.msg.saved")); self._load(self._currentModelID); })
        .catch(function (e) { MessageBox.error(self._t("risk.msg.saveFailed", [e.message])); });
    },

    onRefresh: function () { this._load(this._currentModelID); MessageToast.show(this._t("risk.msg.reloaded")); },

    // ── Governed versioning ──────────────────────────────────────────────────────────
    onSelectVersion: function (oEvent) {
      var item = oEvent.getParameter("selectedItem"), id = item && item.getKey(), self = this;
      var m = this.getView().getModel("risk");
      if (id && id !== this._currentModelID) {
        if (m.getProperty("/dirty")) {
          MessageBox.confirm(self._t("risk.msg.discardConfirm"), { onClose: function (a) {
            if (a === MessageBox.Action.OK) { self._load(id); } else { m.setProperty("/selectedModel/ID", self._currentModelID); }
          } });
        } else { this._load(id); }
      }
    },

    onCloneVersion: function () {
      var self = this, id = this._currentModelID;
      if (!id) { return; }
      fetch(this._systemBase + "/risk-config/clone", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": "bms-risk" },
        body: JSON.stringify({ modelID: id })
      }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("risk.msg.cloneFailedShort")); }); })
        .then(function (res) { MessageToast.show(self._t("risk.msg.cloned", [String(res.version)])); self._load(res.modelID); })
        .catch(function (e) { MessageBox.error(self._t("risk.msg.cloneFailed", [e.message])); });
    },

    onActivateVersion: function () {
      var self = this, sel = this.getView().getModel("risk").getProperty("/selectedModel");
      if (!sel) { return; }
      if (sel.status === "Active") { MessageToast.show(self._t("risk.msg.alreadyActive")); return; }
      MessageBox.confirm(self._t("risk.msg.activateConfirm", [String(sel.version)]), {
        title: self._t("risk.msg.activateTitle"),
        onClose: function (a) {
          if (a !== MessageBox.Action.OK) { return; }
          fetch(self._systemBase + "/risk-config/activate", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "x-csrf-token": "bms-risk" },
            body: JSON.stringify({ modelID: sel.ID })
          }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("risk.msg.activateFailedShort")); }); })
            .then(function () { MessageToast.show(self._t("risk.msg.activated")); self._load(sel.ID); })
            .catch(function (e) { MessageBox.error(self._t("risk.msg.activateFailed", [e.message])); });
        }
      });
    }
  });
});
