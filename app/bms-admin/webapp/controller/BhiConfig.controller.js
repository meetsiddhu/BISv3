sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
  "use strict";

  // Structured editor for the BSI/BHI calculation config (council BHI-1). Reads the
  // ENGINE DEFAULTS + current overrides from /system/api/bhi-config (single source of
  // truth = srv/lib/bhi.js — nothing hardcoded here), lets an admin tune per-mode
  // element weights and environmental coefficients, validates, and writes back with an
  // audited old→new ChangeLog entry. Replaces editing raw JSON in System Config.

  // Friendly one-line description per coefficient (labels only — not values).
  var COEFF_DESC = {
    ageSpanYears: "Years over which age wear accrues to its max",
    ageWearMax: "Max condition reduction from age (0–1)",
    floodStep: "BSI penalty per flood-exposure level",
    corrStep: "BSI penalty per corrosion-zone level",
    seismicStep: "BSI penalty per seismic level",
    vulnCap: "Max vulnerability fraction (caps BHI uplift)",
    vulnAgeSpanYears: "Years over which age drives vulnerability",
    vulnAgeShare: "Age share of the vulnerability term",
    importBase: "Importance multiplier at class 1",
    importStep: "Importance multiplier added per class step",
    rslHorizonYears: "Design horizon for remaining-service-life",
    rslUtilisation: "Utilisation factor applied to RSL"
  };

  return Controller.extend("BridgeManagement.bmsadmin.controller.BhiConfig", {

    onInit: function () {
      this._systemBase = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/SystemService/uri").replace(/\/$/, "");
      this.getView().setModel(new JSONModel({ weights: [], coeffs: [], calibrated: [], sums: [], isCustom: false, dirty: false }), "bhi");
      this._load();
    },

    _load: function () {
      var self = this, m = this.getView().getModel("bhi");
      fetch(this._systemBase + "/bhi-config", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || "Load failed"); }); })
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
            return { key: k, value: Number(eff.env[k] ?? 0), def: Number(def.env[k] ?? 0), desc: COEFF_DESC[k] || "" };
          });
          var calibrated = (data.modes || []).map(function (mode) {
            return { mode: mode, on: (eff.calibrated || []).indexOf(mode) >= 0 };
          });
          m.setProperty("/weights", weights);
          m.setProperty("/coeffs", coeffs);
          m.setProperty("/calibrated", calibrated);
          m.setProperty("/isCustom", !!data.isCustom);
          m.setProperty("/dirty", false);
          self._recomputeSums();
        })
        .catch(function (e) { MessageBox.error("Could not load BSI/BHI config: " + e.message); });
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

    onRefresh: function () { this._load(); MessageToast.show("Reloaded."); },

    onSave: function () {
      var self = this, m = this.getView().getModel("bhi");
      var modeWeights = {}, env = {}, calibrated = [];
      (m.getProperty("/weights") || []).forEach(function (w) {
        (modeWeights[w.mode] = modeWeights[w.mode] || {})[w.bucket] = Number(w.value);
      });
      (m.getProperty("/coeffs") || []).forEach(function (c) { env[c.key] = Number(c.value); });
      (m.getProperty("/calibrated") || []).forEach(function (c) { if (c.on) calibrated.push(c.mode); });

      var warn = (m.getProperty("/sums") || []).filter(function (s) { return !s.ok; }).map(function (s) { return s.mode; });
      var doSave = function () {
        fetch(self._systemBase + "/bhi-config", {
          method: "PUT", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "x-csrf-token": "bms-bhi" },
          body: JSON.stringify({ modeWeights: modeWeights, env: env, calibrated: calibrated })
        }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || "Save failed"); }); })
          .then(function () { MessageToast.show("Saved — applies to BSI/BHI on the next compute. Change logged."); self._load(); })
          .catch(function (e) { MessageBox.error("Save failed: " + e.message); });
      };
      if (warn.length) {
        MessageBox.warning("Element weights for " + warn.join(", ") + " do not sum to 1.0. BSI normalises by total weight, so this still computes — but unintended weighting is a common error. Save anyway?",
          { actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL], onClose: function (a) { if (a === MessageBox.Action.OK) doSave(); } });
      } else { doSave(); }
    },

    onResetDefaults: function () {
      var self = this;
      MessageBox.confirm("Reset BSI/BHI configuration to the engine defaults (published-practice values)? This clears all overrides.", {
        title: "Reset to defaults",
        onClose: function (a) {
          if (a !== MessageBox.Action.OK) return;
          fetch(self._systemBase + "/bhi-config", {
            method: "PUT", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "x-csrf-token": "bms-bhi" },
            body: JSON.stringify({})
          }).then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e.error && e.error.message || "Reset failed"); }); })
            .then(function () { MessageToast.show("Reset to engine defaults. Change logged."); self._load(); })
            .catch(function (e) { MessageBox.error("Reset failed: " + e.message); });
        }
      });
    }
  });
});
