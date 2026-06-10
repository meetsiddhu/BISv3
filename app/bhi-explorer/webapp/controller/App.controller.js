sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel", "sap/base/Log"],
function (Controller, JSONModel, Log) {
  "use strict";
  // Council B10: the picker is capped — single source of truth here, surfaced to the user
  // via the i18n pickCapNote text instead of silently truncating.
  var PICKER_CAP = 500;
  var ST = function (bsi) { return bsi === null ? "None" : bsi < 4 ? "Error" : bsi < 6 ? "Warning" : bsi < 7.5 ? "Information" : "Success"; };
  return Controller.extend("BridgeManagement.bhiexplorer.controller.App", {
    onInit: function () {
      this._svc = "/odata/v4/prioritisation";
      this._rb = this.getOwnerComponent().getModel("i18n").getResourceBundle();
      this.getView().setModel(new JSONModel({ rows: [] }), "br");
      this.getView().setModel(new JSONModel({}), "d");
      this.getView().setModel(new JSONModel({ rows: [] }), "cm");
      this.getView().setModel(new JSONModel({
        listBusy: false, cmBusy: false, detailBusy: false,
        listError: "", cmError: "", detailError: "",
        capNote: this._rb.getText("pickCapNote", [PICKER_CAP])
      }), "ui");
      this._loadBridgeList();
      this._loadCrossMode();
    },
    _loadBridgeList: function () {
      var self = this, ui = this.getView().getModel("ui");
      ui.setProperty("/listBusy", true); ui.setProperty("/listError", "");
      fetch(this._svc + "/AssessableBridges?$orderby=bridgeName&$top=" + PICKER_CAP, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) { throw new Error(r.statusText); } return r.json(); })
        .then(function (j) { self.getView().getModel("br").setProperty("/rows", j.value || []); })
        .catch(function (e) {
          Log.error("BHI explorer: bridge list load failed", e.message, "BridgeManagement.bhiexplorer");
          ui.setProperty("/listError", self._rb.getText("err.bridgeList"));
        })
        .finally(function () { ui.setProperty("/listBusy", false); });
    },
    _loadCrossMode: function () {
      var self = this, ui = this.getView().getModel("ui");
      ui.setProperty("/cmBusy", true); ui.setProperty("/cmError", "");
      fetch("/odata/v4/prioritisation-analytics/ConditionByMode", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) { throw new Error(r.statusText); } return r.json(); })
        .then(function (j) {
          self.getView().getModel("cm").setProperty("/rows", (j.value || []).map(function (m) {
            return Object.assign({}, m, {
              bhiPct: Math.round(Number(m.avgBhi) || 0),
              bhiDisplay: self._rb.getText("fmt.bhi", [m.avgBhi]),
              state: ST(Number(m.avgBsi))
            });
          }));
        })
        .catch(function (e) {
          Log.error("BHI explorer: cross-mode load failed", e.message, "BridgeManagement.bhiexplorer");
          ui.setProperty("/cmError", self._rb.getText("err.crossMode"));
        })
        .finally(function () { ui.setProperty("/cmBusy", false); });
    },
    onPick: function (oEvent) {
      var item = oEvent.getParameter("selectedItem"); if (!item) { return; }
      var self = this, rb = this._rb, ui = this.getView().getModel("ui");
      ui.setProperty("/detailBusy", true); ui.setProperty("/detailError", "");
      fetch(this._svc + "/bhiDetail(bridgeID=" + parseInt(item.getKey(), 10) + ")", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) { throw new Error(r.statusText); } return r.json(); })
        .then(function (res) {
          var d = JSON.parse(res.detail);
          var m = self.getView().getModel("d");
          m.setData({
            bsi: d.bsi, bhi: d.bhi, rsl: d.rsl, priority: d.priority,
            bsiPct: Math.round((d.bsi || 0) * 10), state: ST(d.bsi),
            bsiDisplay: rb.getText("fmt.outOf10", [d.bsi]),
            bhiDisplay: rb.getText("fmt.outOf100", [d.bhi]),
            rslText: rb.getText("fmt.rslYears", [d.rsl]),
            headline: d.bridge.name + " · " + d.bridge.mode + " · " + rb.getText(d.usedFallback ? "headline.fallback" : "headline.elementData"),
            coverageText: rb.getText("fmt.coverage", [d.coverage]),
            elementBreakdown: (d.elementBreakdown || []).map(function (e) {
              return { bucket: e.bucket, weight: e.weight, ratingText: e.rating === null ? rb.getText("noDataExcluded") : String(e.rating),
                ratingPct: e.rating === null ? 0 : e.rating * 10, ratingState: e.rating === null ? "None" : ST(e.rating) };
            }),
            models: (d.models || []).map(function (x) {
              var bsiText = x.bsi === null ? "—" : String(x.bsi);
              return { model: x.model, weightsText: Object.entries(x.weights).map(function (p) { return p[0] + " " + p[1]; }).join(" · "),
                bsiText: bsiText, bsiDisplay: rb.getText("fmt.outOf10", [bsiText]),
                bsiPct: Math.round((x.bsi || 0) * 10), state: ST(x.bsi) };
            }),
            formulas: (d.formulas || []).map(function (f) { return { t: f }; })
          });
        })
        .catch(function (e) {
          Log.error("BHI explorer: bhiDetail load failed", e.message, "BridgeManagement.bhiexplorer");
          ui.setProperty("/detailError", rb.getText("err.detail", [e.message]));
        })
        .finally(function () { ui.setProperty("/detailBusy", false); });
    }
  });
});
