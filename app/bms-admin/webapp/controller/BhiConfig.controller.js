sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Select",
  "sap/ui/core/Item",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/VBox"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Select, Item, Button, Label, VBox) {
  "use strict";

  // Structured editor for the BSI/BHI calculation config (council BHI-1). Reads the
  // ENGINE DEFAULTS + current overrides from /system/api/bhi-config (single source of
  // truth = srv/lib/bhi.js — nothing hardcoded here), lets an admin tune per-mode
  // element weights and environmental coefficients, validates, and writes back with an
  // audited old→new ChangeLog entry. Replaces editing raw JSON in System Config.

  // Friendly one-line description per coefficient (labels only — not values). The values
  // are i18n keys resolved against the app bundle in _load (see COEFF_DESC lookup).
  var COEFF_DESC_KEYS = {
    ageSpanYears: "bhi.coeffDesc.ageSpanYears",
    ageWearMax: "bhi.coeffDesc.ageWearMax",
    floodStep: "bhi.coeffDesc.floodStep",
    corrStep: "bhi.coeffDesc.corrStep",
    seismicStep: "bhi.coeffDesc.seismicStep",
    vulnCap: "bhi.coeffDesc.vulnCap",
    vulnAgeSpanYears: "bhi.coeffDesc.vulnAgeSpanYears",
    vulnAgeShare: "bhi.coeffDesc.vulnAgeShare",
    importBase: "bhi.coeffDesc.importBase",
    importStep: "bhi.coeffDesc.importStep",
    rslHorizonYears: "bhi.coeffDesc.rslHorizonYears",
    rslUtilisation: "bhi.coeffDesc.rslUtilisation"
  };

  return Controller.extend("BridgeManagement.bmsadmin.controller.BhiConfig", {

    _t: function (k, a) { return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(k, a); },

    onInit: function () {
      this._systemBase = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/SystemService/uri").replace(/\/$/, "");
      this.getView().setModel(new JSONModel({ weights: [], coeffs: [], calibrated: [], classWeights: [], sums: [], isCustom: false, dirty: false, models: [], selectedModel: null }), "bhi");
      this._load();
    },

    _load: function (modelID) {
      var self = this, m = this.getView().getModel("bhi");
      var url = this._systemBase + "/bhi-config" + (modelID ? "?modelID=" + encodeURIComponent(modelID) : "");
      fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("bhi.msg.loadFailedShort")); }); })
        .then(function (data) {
          var eff = data.effective || {}, def = data.defaults || {}, buckets = data.buckets || {};
          var weights = [];
          (data.modes || []).forEach(function (mode) {
            (buckets[mode] || []).forEach(function (b) {
              weights.push({
                mode: mode, bucket: b,
                value: Number((eff.modeWeights[mode] || {})[b] ?? 0),
                def: Number((def.modeWeights[mode] || {})[b] ?? 0),
                calibrated: (eff.calibrated || []).indexOf(mode) >= 0
              });
            });
          });
          var coeffs = (data.coefficientKeys || []).map(function (k) {
            return { key: k, value: Number(eff.env[k] ?? 0), def: Number(def.env[k] ?? 0), desc: COEFF_DESC_KEYS[k] ? self._t(COEFF_DESC_KEYS[k]) : "" };
          });
          var calibrated = (data.modes || []).map(function (mode) {
            return { mode: mode, on: (eff.calibrated || []).indexOf(mode) >= 0 };
          });
          // Per-class element-weight overrides (additive). Flatten {class:{mode:{bucket:w}}} into
          // editable rows; `def` is the mode-level effective weight (what the class gets WITHOUT an
          // override), so the admin sees exactly what they are deviating from.
          var classWeights = [], cmw = eff.classModeWeights || {};
          Object.keys(cmw).forEach(function (cls) {
            Object.keys(cmw[cls] || {}).forEach(function (mode) {
              Object.keys(cmw[cls][mode] || {}).forEach(function (bucket) {
                classWeights.push({
                  assetClass: cls, mode: mode, bucket: bucket,
                  value: Number(cmw[cls][mode][bucket]),
                  def: Number((eff.modeWeights[mode] || {})[bucket] ?? 0)
                });
              });
            });
          });
          self._eff = eff;                          // mode-effective weights (seed for new overrides)
          self._buckets = buckets;                  // mode -> [bucket]
          self._modes = data.modes || [];
          self._assetClasses = data.assetClasses || [];
          // Governed versioning: which version we're editing + the list for the picker.
          self._currentModelID = (data.selectedModel && data.selectedModel.ID) || null;
          m.setProperty("/models", (data.models || []).map(function (v) {
            return { ID: v.ID, code: v.code, version: v.version, status: v.status,
              label: (v.name || v.code) + " · v" + v.version + " (" + v.status + ")" };
          }));
          m.setProperty("/selectedModel", data.selectedModel || null);
          m.setProperty("/weights", weights);
          m.setProperty("/coeffs", coeffs);
          m.setProperty("/calibrated", calibrated);
          m.setProperty("/classWeights", classWeights);
          m.setProperty("/isCustom", !!data.isCustom);
          m.setProperty("/dirty", false);
          self._recomputeSums();
        })
        .catch(function (e) { MessageBox.error(self._t("bhi.msg.loadFailed", [e.message])); });
    },

    _recomputeSums: function () {
      var m = this.getView().getModel("bhi");
      var byMode = {};
      (m.getProperty("/weights") || []).forEach(function (w) {
        byMode[w.mode] = (byMode[w.mode] || 0) + (Number(w.value) || 0);
      });
      var sums = Object.keys(byMode).map(function (mode) {
        var s = Math.round(byMode[mode] * 1000) / 1000;
        return { mode: mode, sum: s.toFixed(3), ok: Math.abs(s - 1) <= 0.001 };
      });
      m.setProperty("/sums", sums);
    },

    onCellChange: function () {
      this.getView().getModel("bhi").setProperty("/dirty", true);
      this._recomputeSums();
    },
    onCalibratedChange: function () {
      this.getView().getModel("bhi").setProperty("/dirty", true);
    },

    // ── Per-class element-weight overrides ──────────────────────────────────────────
    // A class+mode override starts as a copy of the mode's effective weights, which the
    // admin then tweaks (precedence: class+mode -> mode -> Road, enforced in srv/lib/bhi.js).
    onAddClassOverride: function () {
      var self = this;
      if (!this._assetClasses || !this._assetClasses.length) {
        MessageBox.information(self._t("bhi.msg.noAssetClasses"));
        return;
      }
      var classSelect = new Select({ width: "100%" });
      this._assetClasses.forEach(function (c) { classSelect.addItem(new Item({ key: c.code, text: c.name })); });
      var modeSelect = new Select({ width: "100%" });
      (this._modes || []).forEach(function (mo) { modeSelect.addItem(new Item({ key: mo, text: mo })); });
      var dlg = new Dialog({
        title: self._t("bhi.dlg.addOverrideTitle"), contentWidth: "22rem",
        content: [new VBox({ items: [
          new Label({ text: self._t("bhi.dlg.assetClass"), labelFor: classSelect }), classSelect,
          new Label({ text: self._t("bhi.dlg.transportMode"), labelFor: modeSelect }).addStyleClass("sapUiSmallMarginTop"), modeSelect
        ] }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: self._t("bhi.dlg.add"), type: "Emphasized", press: function () {
          self._seedClassOverride(classSelect.getSelectedKey(), modeSelect.getSelectedKey()); dlg.close();
        } }),
        endButton: new Button({ text: self._t("bhi.dlg.cancel"), press: function () { dlg.close(); } }),
        afterClose: function () { dlg.destroy(); }
      });
      this.getView().addDependent(dlg);
      dlg.open();
    },

    _seedClassOverride: function (cls, mode) {
      if (!cls || !mode) { return; }
      var m = this.getView().getModel("bhi"), rows = m.getProperty("/classWeights") || [];
      if (rows.some(function (r) { return r.assetClass === cls && r.mode === mode; })) {
        MessageToast.show(this._t("bhi.msg.overrideExists")); return;
      }
      var modeEff = (this._eff && this._eff.modeWeights && this._eff.modeWeights[mode]) || {};
      var buckets = (this._buckets && this._buckets[mode]) || Object.keys(modeEff);
      buckets.forEach(function (b) {
        rows.push({ assetClass: cls, mode: mode, bucket: b, value: Number(modeEff[b] != null ? modeEff[b] : 0), def: Number(modeEff[b] != null ? modeEff[b] : 0) });
      });
      m.setProperty("/classWeights", rows.slice());
      m.setProperty("/dirty", true);
    },

    onRemoveClassRow: function (oEvent) {
      var ctx = oEvent.getSource().getBindingContext("bhi");
      var idx = parseInt(ctx.getPath().split("/").pop(), 10);
      var m = this.getView().getModel("bhi"), rows = (m.getProperty("/classWeights") || []).slice();
      rows.splice(idx, 1);
      m.setProperty("/classWeights", rows);
      m.setProperty("/dirty", true);
    },

    onRefresh: function () { this._load(); MessageToast.show(this._t("bhi.msg.reloaded")); },

    onSave: function () {
      var self = this, m = this.getView().getModel("bhi");
      var modeWeights = {}, env = {}, calibrated = [], classModeWeights = {};
      (m.getProperty("/weights") || []).forEach(function (w) {
        (modeWeights[w.mode] = modeWeights[w.mode] || {})[w.bucket] = Number(w.value);
      });
      (m.getProperty("/coeffs") || []).forEach(function (c) { env[c.key] = Number(c.value); });
      (m.getProperty("/calibrated") || []).forEach(function (c) { if (c.on) calibrated.push(c.mode); });
      // Always round-trip per-class overrides — a save from ANY tab must preserve them, never wipe them.
      (m.getProperty("/classWeights") || []).forEach(function (r) {
        var c = (classModeWeights[r.assetClass] = classModeWeights[r.assetClass] || {});
        (c[r.mode] = c[r.mode] || {})[r.bucket] = Number(r.value);
      });

      var warn = (m.getProperty("/sums") || []).filter(function (s) { return !s.ok; }).map(function (s) { return s.mode; });
      var doSave = function () {
        fetch(self._systemBase + "/bhi-config", {
          method: "PUT", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "x-csrf-token": "bms-bhi" },
          body: JSON.stringify({ modelID: self._currentModelID, modeWeights: modeWeights, env: env, calibrated: calibrated, classModeWeights: classModeWeights })
        }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("bhi.msg.saveFailedShort")); }); })
          .then(function () { MessageToast.show(self._t("bhi.msg.saved")); self._load(self._currentModelID); })
          .catch(function (e) { MessageBox.error(self._t("bhi.msg.saveFailed", [e.message])); });
      };
      if (warn.length) {
        MessageBox.warning(self._t("bhi.msg.sumWarning", [warn.join(", ")]),
          { actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL], onClose: function (a) { if (a === MessageBox.Action.OK) doSave(); } });
      } else { doSave(); }
    },

    onResetDefaults: function () {
      var self = this;
      MessageBox.confirm(self._t("bhi.msg.resetConfirm"), {
        title: self._t("bhi.msg.resetTitle"),
        onClose: function (a) {
          if (a !== MessageBox.Action.OK) return;
          fetch(self._systemBase + "/bhi-config", {
            method: "PUT", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "x-csrf-token": "bms-bhi" },
            body: JSON.stringify({})
          }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("bhi.msg.resetFailedShort")); }); })
            .then(function () { MessageToast.show(self._t("bhi.msg.resetDone")); self._load(); })
            .catch(function (e) { MessageBox.error(self._t("bhi.msg.resetFailed", [e.message])); });
        }
      });
    },

    // ── Governed versioning: switch / clone / activate a weight-set version ──────────
    onSelectVersion: function (oEvent) {
      var item = oEvent.getParameter("selectedItem");
      var id = item && item.getKey();
      if (id && id !== this._currentModelID) {
        var m = this.getView().getModel("bhi");
        if (m.getProperty("/dirty")) {
          var self = this;
          MessageBox.confirm(self._t("bhi.msg.discardConfirm"), { onClose: function (a) {
            if (a === MessageBox.Action.OK) { self._load(id); } else { m.setProperty("/selectedModel/ID", self._currentModelID); }
          } });
        } else { this._load(id); }
      }
    },

    onCloneVersion: function () {
      var self = this, id = this._currentModelID;
      if (!id) { return; }
      fetch(this._systemBase + "/bhi-config/clone", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": "bms-bhi" },
        body: JSON.stringify({ modelID: id })
      }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("bhi.msg.cloneFailedShort")); }); })
        .then(function (res) { MessageToast.show(self._t("bhi.msg.cloned", [String(res.version)])); self._load(res.modelID); })
        .catch(function (e) { MessageBox.error(self._t("bhi.msg.cloneFailed", [e.message])); });
    },

    onActivateVersion: function () {
      var self = this, sel = this.getView().getModel("bhi").getProperty("/selectedModel");
      if (!sel) { return; }
      if (sel.status === "Active") { MessageToast.show(self._t("bhi.msg.alreadyActive")); return; }
      MessageBox.confirm(self._t("bhi.msg.activateConfirm", [String(sel.version)]), {
        title: self._t("bhi.msg.activateTitle"),
        onClose: function (a) {
          if (a !== MessageBox.Action.OK) { return; }
          fetch(self._systemBase + "/bhi-config/activate", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "x-csrf-token": "bms-bhi" },
            body: JSON.stringify({ modelID: sel.ID })
          }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || self._t("bhi.msg.activateFailedShort")); }); })
            .then(function () { MessageToast.show(self._t("bhi.msg.activated")); self._load(sel.ID); })
            .catch(function (e) { MessageBox.error(self._t("bhi.msg.activateFailed", [e.message])); });
        }
      });
    }
  });
});
