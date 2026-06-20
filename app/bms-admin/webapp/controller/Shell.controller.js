sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast"
], function (Controller, _MessageToast) {
  "use strict";

  const ROUTE_TO_KEY = {
    home:             "systemConfig",
    systemConfig:     "systemConfig",
    bnacConfig:       "bnacConfig",
    gisConfig:        "gisConfig",
    riskBands:        "riskBands",
    riskFactors:      "riskFactors",
    assetStrategy:    "assetStrategy",
    bhiConfig:        "bhiConfig",
    demoMode:         "demoMode"
  };

  return Controller.extend("BridgeManagement.bmsadmin.controller.Shell", {

    onInit: function () {
      const oRouter = this.getOwnerComponent().getRouter();
      oRouter.attachRouteMatched(this._onRouteMatched, this);
    },

    // ── Route matching ──────────────────────────────────────────────────────
    _onRouteMatched: function (oEvent) {
      const sName = oEvent.getParameter("name");
      const sKey  = ROUTE_TO_KEY[sName] || "systemConfig";
      const oNavList = this.byId("navList");
      const aItems   = oNavList.getItems();
      const target   = aItems.find(item => item.getKey() === sKey);
      if (target) oNavList.setSelectedItem(target);
    },

    onToggleSideNav: function () {
      const oPage = this.byId("toolPage");
      oPage.setSideExpanded(!oPage.getSideExpanded());
    },

    onNavSelect: function (oEvent) {
      // Change Documents + Attribute Classes are now standalone Fiori Elements tiles
      // (#ChangeDocuments-display, #AttributeClasses-manage) — removed from this admin shell.
      const sKey = oEvent.getParameter("item").getKey();
      this.getOwnerComponent().getRouter().navTo(sKey);
    }
  });
});
