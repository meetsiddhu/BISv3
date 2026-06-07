sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Input",
  "sap/m/Button",
  "sap/m/VBox",
  "sap/m/Label",
  "sap/m/FormattedText"
], function (Controller, JSONModel, MessageBox, MessageToast, Dialog, Input, Button, VBox, Label,  FormattedText) {
  "use strict";

  return Controller.extend("BridgeManagement.adminbridges.ext.controller.GISConfig", {

    onInit: function () {
      this._adminBase    = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/AdminService/uri").replace(/\/$/, "");
      this._gisConfigUrl = this._adminBase + "/GISConfig('default')";
      this._refLayerUrl  = this._adminBase + "/ReferenceLayerConfig";
      this.getView().setModel(new JSONModel(this._defaults()), "config");
      this.getView().setModel(new JSONModel({ layers: [] }), "refLayers");
      this._bundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
      this._loadConfig();
      this._loadRefLayers();
    },

    _t: function (sKey) { try { return this._bundle ? this._bundle.getText(sKey) : sKey; } catch (e) { return sKey; } },

    _defaults: function () {
      return {
        id: "default",
        defaultBasemap: "osm",
        hereApiKey: "",
        showStateBoundaries: false,
        showLgaBoundaries: false,
        enableScaleBar: true,
        enableGps: true,
        enableMinimap: true,
        enableHeatmap: false,
        enableTimeSlider: false,
        enableStatsPanel: true,
        enableProximity: true,
        enableMgaCoords: true,
        enableStreetView: true,
        enableConditionAlerts: true,
        enableCustomWms: false,
        enableServerClustering: false,
        conditionAlertThreshold: 3,
        proximityDefaultRadiusKm: 10,
        heatmapRadius: 20,
        heatmapBlur: 15,
        viewportLoadingZoom: 8,
        customWmsLayers: []
      };
    },

    _loadConfig: function () {
      var self  = this;
      var model = self.getView().getModel("config");
      fetch(self._gisConfigUrl, { headers: { "Accept": "application/json" } })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.statusText); })
        .then(function (data) {
          var cfg = Object.assign(this._defaults(), data);
          if (typeof cfg.customWmsLayers === "string") {
            try { cfg.customWmsLayers = JSON.parse(cfg.customWmsLayers); } catch (_) { cfg.customWmsLayers = []; }
          }
          if (!Array.isArray(cfg.customWmsLayers)) { cfg.customWmsLayers = []; }
          model.setData(cfg);
        }.bind(this))
        .catch(function () {
          // Entity may not exist yet: use defaults, save will upsert
        });
    },

    onNavBack: function () {
      var router = sap.ui.core.UIComponent.getRouterFor(this);
      if (router) {
        router.navTo("BridgesList");
      } else {
        window.history.go(-1);
      }
    },

    onSave: function () {
      var self  = this;
      var model = this.getView().getModel("config");
      var data  = JSON.parse(JSON.stringify(model.getData()));

      // Serialise custom WMS layers back to JSON string
      data.customWmsLayers = JSON.stringify(data.customWmsLayers || []);

      // Remove OData metadata fields
      delete data["@context"];
      delete data["@metadataEtag"];

      fetch(self._gisConfigUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          if (res.status === 404 || res.status === 201) {
            // Try POST/PUT to create
            return fetch(self._adminBase + "/GISConfig", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify(data)
            });
          }
          if (!res.ok) return Promise.reject(res.statusText);
          return res;
        })
        .then(function (res) {
          if (res && !res.ok) return Promise.reject(res.statusText);
          MessageToast.show(this._t("gisConfigSaved"));
        })
        .catch(function (err) {
          MessageBox.error(this._t("gisConfigSaveFailed") + " " + (err || this._t("gisUnknownError")));
        });
    },

    onDiscard: function () {
      this._loadConfig();
      MessageToast.show(this._t("gisChangesDiscarded"));
    },

    // ── Reference Layer Library ──────────────────────────────────────────────

    _loadRefLayers: function () {
      var model = this.getView().getModel("refLayers");
      fetch(this._refLayerUrl + "?$orderby=category,sortOrder,name", { headers: { "Accept": "application/json" } })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.statusText); })
        .then(function (data) { model.setProperty("/layers", data.value || []); })
        .catch(function () { /* non-fatal */ });
    },

    onToggleRefLayerActive: function (oEvent) {
      var src = oEvent.getSource();
      var ctx = src.getBindingContext("refLayers") || src.getParent().getBindingContext("refLayers");
      var row  = ctx.getObject();
      fetch(this._refLayerUrl + "('" + row.ID + "')", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: oEvent.getParameter("state") })
      }).catch(function () { MessageToast.show(self._t("gisLayerUpdateFailed")); });
    },

    onToggleRefLayerDefault: function (oEvent) {
      var src = oEvent.getSource();
      var ctx = src.getBindingContext("refLayers") || src.getParent().getBindingContext("refLayers");
      var row = ctx.getObject();
      fetch(this._refLayerUrl + "('" + row.ID + "')", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledByDefault: oEvent.getParameter("state") })
      }).catch(function () { MessageToast.show(self._t("gisLayerUpdateFailed")); });
    },

    _openRefLayerDialog: function (oData) {
      var self  = this;
      var oAppCfg       = self.getOwnerComponent().getModel("appConfig");
      var LAYER_CATEGORIES = oAppCfg.getProperty("/layerCategories");
      var LAYER_TYPES      = oAppCfg.getProperty("/layerTypes");
      var bEdit = !!oData.ID;
      var oModel = new JSONModel(Object.assign({
        ID: null, name: "", category: "Custom", layerType: "WMS",
        url: "", subLayers: "", attribution: "", opacity: 0.70,
        description: "", enabledByDefault: false, active: true,
        wmsFormat: "image/png", transparent: true, minZoom: 0, maxZoom: 19
      }, oData));

      var makeLabelInput = function (label, path, placeholder) {
        return new VBox({ items: [
          new Label({ text: label, required: path === "/url" || path === "/name" }),
          new Input({ value: "{dlg>" + path.slice(1) + "}", placeholder: placeholder || "" })
        ]}).addStyleClass("sapUiSmallMarginBottom");
      };

      var oSelect = function (label, path, items) {
        var sap_m = sap.m;
        var oSel = new sap_m.Select({ selectedKey: "{dlg>" + path.slice(1) + "}" });
        items.forEach(function (selectOption) { oSel.addItem(new sap.ui.core.Item({ key: selectOption, text: selectOption })); });
        return new VBox({ items: [new Label({ text: label }), oSel] }).addStyleClass("sapUiSmallMarginBottom");
      };

      var oDialog = new Dialog({
        title: bEdit ? self._t("gisEditRefLayer") : self._t("gisAddRefLayer"),
        contentWidth: "520px",
        content: [
          new VBox({ class: "sapUiSmallMargin", items: [
            makeLabelInput(self._t("gisDlgLayerName"), "/name", self._t("gisDlgLayerNamePh")),
            oSelect(self._t("colCategory"), "/category", LAYER_CATEGORIES),
            oSelect(self._t("gisDlgLayerType"), "/layerType", LAYER_TYPES),
            makeLabelInput(self._t("gisDlgServiceUrl"), "/url", self._t("gisDlgServiceUrlPh")),
            makeLabelInput(self._t("gisDlgSubLayers"), "/subLayers", self._t("gisDlgSubLayersPh")),
            makeLabelInput(self._t("gisDlgAttribution"), "/attribution", self._t("gisDlgAttributionPh")),
            makeLabelInput(self._t("colDescription"), "/description", self._t("gisDlgDescPh")),
            new VBox({ items: [
              new Label({ text: self._t("gisOpacityLabel") }),
              new sap.m.Slider({ value: "{dlg>/opacity}", min: 0, max: 1, step: 0.05, width: "100%" })
            ]}).addStyleClass("sapUiSmallMarginBottom"),
            new HBox({ items: [
              new Label({ text: self._t("gisEnableByDefault"), width: "12rem" }),
              new sap.m.Switch({ state: "{dlg>/enabledByDefault}" })
            ]})
          ]})
        ],
        beginButton: new Button({
          text: bEdit ? self._t("gisSave") : self._t("gisAdd"),
          type: "Emphasized",
          press: function () {
            var referenceLayer = oModel.getData();
            if (!referenceLayer.name || !referenceLayer.url) { MessageToast.show(self._t("gisNameUrlRequired")); return; }
            var method = bEdit ? "PATCH" : "POST";
            var url    = bEdit ? self._refLayerUrl + "('" + referenceLayer.ID + "')" : self._refLayerUrl;
            var body   = Object.assign({}, referenceLayer);
            delete body["@context"]; delete body["@metadataEtag"];
            fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
              .then(function (res) { return res.ok ? res : Promise.reject(res.statusText); })
              .then(function () { self._loadRefLayers(); oDialog.close(); })
              .catch(function (error) { MessageBox.error(self._t("gisLayerSaveFailed") + " " + error); });
          }
        }),
        endButton: new Button({ text: self._t("gisCancel"), press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.setModel(oModel, "dlg");
      oDialog.addStyleClass("sapUiContentPadding");
      oDialog.open();
    },

    onAddRefLayer: function () {
      this._openRefLayerDialog({});
    },

    onEditRefLayer: function (oEvent) {
      var src = oEvent.getSource();
      var ctx = src.getBindingContext("refLayers") || src.getParent().getBindingContext("refLayers");
      this._openRefLayerDialog(Object.assign({}, ctx.getObject()));
    },

    onDeleteRefLayer: function (oEvent) {
      var self = this;
      var src  = oEvent.getSource();
      var ctx  = src.getBindingContext("refLayers") || src.getParent().getBindingContext("refLayers");
      var row  = ctx.getObject();
      MessageBox.confirm(self._t("gisDeleteLayerConfirm") + " \"" + row.name + "\"?", {
        onClose: function (action) {
          if (action !== "OK") return;
          fetch(self._refLayerUrl + "('" + row.ID + "')", { method: "DELETE" })
            .then(function () { self._loadRefLayers(); })
            .catch(function () { MessageToast.show(self._t("gisLayerDeleteFailed")); });
        }
      });
    },

    // ── Custom WMS ──────────────────────────────────────────────────────────

    onAddCustomWms: function () {
      var model = this.getView().getModel("config");
      var layers = model.getProperty("/customWmsLayers") || [];
      layers.push({ label: "", url: "", layers: "", opacity: 0.7, transparent: true });
      model.setProperty("/customWmsLayers", layers);
    },

    onDeleteCustomWms: function (oEvent) {
      var model = this.getView().getModel("config");
      var ctx = oEvent.getSource().getBindingContext("config");
      var path = ctx.getPath();
      var idx = parseInt(path.split("/").pop(), 10);
      var layers = model.getProperty("/customWmsLayers") || [];
      layers.splice(idx, 1);
      model.setProperty("/customWmsLayers", layers.slice());
    },

    onShowHelp: function () {
      var sHtml = this._t("gisHelpHtml");   // FREE_UX-R3: externalised to i18n
      var oDialog = new Dialog({
        title: this._t("gisHelpTitle"),
        contentWidth: "480px",
        content: [new FormattedText({ htmlText: sHtml })],
        endButton: new Button({ text: this._t("gisClose"), press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.addStyleClass("sapUiContentPadding");
      oDialog.open();
    }
  });
});
