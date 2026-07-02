sap.ui.define(["sap/fe/core/AppComponent"], function (AppComponent) {
  "use strict";

  // Inject a plain <script> for an app-relative module, resolving its URL via the UI5
  // module loader (sap.ui.require.toUrl) so it works wherever the app is mounted: local
  // `cds watch`, the FLP sandbox, or the BTP managed approuter (where the BUILT app is
  // served at the namespace root with NO "/webapp/" segment). A hardcoded absolute path
  // ("/restrictions/webapp/...") or a fragment-relative "../webapp/..." src 404s on BTP —
  // which is why the Custom Attributes panel previously rendered blank. Mirrors the
  // admin-bridges Component, whose custom-attributes script loads the same robust way.
  function injectScript(id, moduleName) {
    if (document.getElementById(id)) return;
    var src = (sap.ui.require && sap.ui.require.toUrl) ? sap.ui.require.toUrl(moduleName) : moduleName;
    var script = document.createElement("script");
    script.id = id;
    script.src = src;
    document.head.appendChild(script);
  }

  return AppComponent.extend("BridgeManagement.restrictions.Component", {
    metadata: { manifest: "json" },
    init: function () {
      AppComponent.prototype.init.apply(this, arguments);
      injectScript("_restriction_numeric_guard_script", "BridgeManagement/restrictions/ext/controller/NumericInputGuard.js");
      injectScript("_restriction_custom_attrs_script", "BridgeManagement/restrictions/ext/controller/CustomAttributesRestrInit.js");
    }
  });
});
