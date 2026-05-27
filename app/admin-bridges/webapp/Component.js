sap.ui.define([
    "sap/fe/core/AppComponent",
    "./fe-shims/NavServicePatch"
], function (AppComponent) {
    "use strict";

    var GIS_SCRIPT = "/admin-bridges/webapp/ext/controller/gisMapInit.js";
    var NUMERIC_GUARD_SCRIPT = "/admin-bridges/webapp/ext/controller/NumericInputGuard.js";
    var RESTRICTIONS_VALIDATION_SCRIPT = "/admin-bridges/webapp/ext/controller/RestrictionsValidation.js";
    var CUSTOM_ATTRS_SCRIPT = "/admin-bridges/webapp/ext/controller/CustomAttributesInit.js";

    function loadScript(id, src) {
        if (document.getElementById(id)) return;
        var script = document.createElement("script");
        script.id = id;
        script.src = src;
        document.head.appendChild(script);
    }

    function startGIS() {
        loadScript("_gis_script", GIS_SCRIPT);
        var obs = new MutationObserver(function () {
            var el = document.getElementById("gisMapCanvas");
            if (el && !el._gisReady) {
                el._gisReady = true;
                setTimeout(function () { window._gisInit && window._gisInit(); }, 200);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    function startNumericInputGuard() {
        loadScript("_bms_numeric_guard_script", NUMERIC_GUARD_SCRIPT);
    }

    function startRestrictionsValidation() {
        loadScript("_bms_restrictions_validation_script", RESTRICTIONS_VALIDATION_SCRIPT);
    }

    function startCustomAttributes() {
        loadScript("_bms_custom_attrs_script", CUSTOM_ATTRS_SCRIPT);
    }

    return AppComponent.extend("BridgeManagement.adminbridges.Component", {
        metadata: { manifest: "json" },
        init: function () {
            AppComponent.prototype.init.apply(this, arguments);
            startGIS();
            startNumericInputGuard();
            startRestrictionsValidation();
            startCustomAttributes();
        }
    });
});
