sap.ui.define([], function () {
  "use strict";
  return {
    onOpenGISConfig: function () {
      var router = sap.ui.core.UIComponent.getRouterFor(this);
      if (router) {
        router.navTo("GISConfig");
      } else {
        window.location.hash = "#GISConfig";
      }
    }
  };
});
