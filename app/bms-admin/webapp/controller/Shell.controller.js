sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast"
], function (Controller, MessageToast) {
  "use strict";

  const ROUTE_TO_KEY = {
    home:             "changeDocuments",
    changeDocuments:  "changeDocuments",
    systemConfig:     "systemConfig",
    bnacConfig:       "bnacConfig",
    gisConfig:        "gisConfig",
    attributeConfig:  "attributeConfig",
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
      const sKey  = ROUTE_TO_KEY[sName] || "changeDocuments";
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
      const sKey = oEvent.getParameter("item").getKey();
      if (sKey === "attributeConfig") {
        // Class & characteristics definition now lives in the Fiori Elements
        // 'Attribute Classes' app (draft CRUD). Redirect there instead of the
        // legacy custom page (whose direct writes are incompatible with drafts).
        sap.ushell.Container.getServiceAsync("CrossApplicationNavigation").then(function (oNav) {
          oNav.toExternal({ target: { semanticObject: "AttributeClasses", action: "manage" } });
        }).catch(function () {
          this.getOwnerComponent().getRouter().navTo(sKey);
        }.bind(this));
        return;
      }
      this.getOwnerComponent().getRouter().navTo(sKey);
    }
  });
});
