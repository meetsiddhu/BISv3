sap.ui.define(["sap/ui/core/mvc/Controller","sap/ui/model/json/JSONModel","sap/m/MessageToast"],
function (Controller, JSONModel, MessageToast) {
  "use strict";
  var ST = function (bsi) { return bsi === null ? "None" : bsi < 4 ? "Error" : bsi < 6 ? "Warning" : bsi < 7.5 ? "Information" : "Success"; };
  return Controller.extend("BridgeManagement.bhiexplorer.controller.App", {
    onInit: function () {
      this._svc = "/odata/v4/prioritisation";
      this.getView().setModel(new JSONModel({ rows: [] }), "br");
      this.getView().setModel(new JSONModel({}), "d");
      this.getView().setModel(new JSONModel({ rows: [] }), "cm");
      var self = this;
      fetch(this._svc + "/AssessableBridges?$orderby=bridgeName&$top=500", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.json(); }).then(function (j) { self.getView().getModel("br").setProperty("/rows", j.value || []); })
        .catch(function () { MessageToast.show("Bridge list unavailable."); });
      fetch("/odata/v4/prioritisation-analytics/ConditionByMode", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.json(); }).then(function (j) {
          self.getView().getModel("cm").setProperty("/rows", (j.value || []).map(function (m) {
            return Object.assign({}, m, { bhiPct: Math.round(Number(m.avgBhi) || 0), state: ST(Number(m.avgBsi)) });
          }));
        }).catch(function () { MessageToast.show("Cross-mode view unavailable — run computeBhi first."); });
    },
    onPick: function (oEvent) {
      var item = oEvent.getParameter("selectedItem"); if (!item) { return; }
      var self = this;
      fetch(this._svc + "/bhiDetail(bridgeID=" + parseInt(item.getKey(), 10) + ")", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) { throw new Error(r.statusText); } return r.json(); })
        .then(function (res) {
          var d = JSON.parse(res.detail);
          var m = self.getView().getModel("d");
          m.setData({
            bsi: d.bsi, bhi: d.bhi, rsl: d.rsl, priority: d.priority,
            bsiPct: Math.round((d.bsi || 0) * 10), state: ST(d.bsi),
            headline: d.bridge.name + " · " + d.bridge.mode + (d.usedFallback ? " · register-condition fallback" : " · element data"),
            coverageText: "Element coverage " + d.coverage + "%",
            elementBreakdown: (d.elementBreakdown || []).map(function (e) {
              return { bucket: e.bucket, weight: e.weight, ratingText: e.rating === null ? "no data (excluded)" : String(e.rating),
                ratingPct: e.rating === null ? 0 : e.rating * 10, ratingState: e.rating === null ? "None" : ST(e.rating) };
            }),
            models: (d.models || []).map(function (x) {
              return { model: x.model, weightsText: Object.entries(x.weights).map(function (p) { return p[0] + " " + p[1]; }).join(" · "),
                bsiText: x.bsi === null ? "—" : String(x.bsi), bsiPct: Math.round((x.bsi || 0) * 10), state: ST(x.bsi) };
            }),
            formulas: (d.formulas || []).map(function (f) { return { t: f }; })
          });
        })
        .catch(function (e) { MessageToast.show("Detail failed: " + e.message); });
    }
  });
});
