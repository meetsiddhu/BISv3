sap.ui.define([
    "sap/fe/core/AppComponent",
    "./fe-shims/NavServicePatch"
], function (AppComponent) {
    "use strict";

    var GIS_SCRIPT = "/admin-bridges/webapp/ext/controller/gisMapInit.js";
    var NUMERIC_GUARD_SCRIPT = "/admin-bridges/webapp/ext/controller/NumericInputGuard.js";
    var RESTRICTIONS_VALIDATION_SCRIPT = "/admin-bridges/webapp/ext/controller/RestrictionsValidation.js";
    var CUSTOM_ATTRS_SCRIPT = "/admin-bridges/webapp/ext/controller/CustomAttributesInit.js";
    var FK_MESSAGE_GUARD_SCRIPT = "/admin-bridges/webapp/ext/controller/FkMessageGuard.js";

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

    // Event-driven guard that suppresses the stale Integer-FK parse error on the
    // Defects/Inspections forms (see FkMessageGuard.js). Replaces the previous
    // 500 ms polling workaround.
    function startFkMessageGuard() {
        loadScript("_bms_fk_message_guard_script", FK_MESSAGE_GUARD_SCRIPT);
    }

    function titleForHash() {
        var hash = window.location.hash || "";
        if (hash.indexOf("/BridgeInspections") !== -1 || hash.indexOf("BridgeInspections-manage") !== -1) {
            return "Inspections";
        }
        if (hash.indexOf("/BridgeDefects") !== -1 || hash.indexOf("BridgeDefects-manage") !== -1) {
            return "Defects";
        }
        if (hash.indexOf("/BridgeCapacities") !== -1 || hash.indexOf("BridgeCapacities-manage") !== -1) {
            return "Bridge Capacity";
        }
        return "Bridge Asset Registry";
    }

    function updateShellTitle() {
        var title = titleForHash();
        document.title = title;

        if (sap.ushell && sap.ushell.Container) {
            sap.ushell.Container.getServiceAsync("ShellUIService").then(function (service) {
                if (service && service.setTitle) service.setTitle(title);
            }).catch(function () {});
        }

        var button = document.getElementById("shellAppTitle-button");
        if (button) button.title = title;
    }

    return AppComponent.extend("BridgeManagement.adminbridges.Component", {
        metadata: { manifest: "json" },
        init: function () {
            AppComponent.prototype.init.apply(this, arguments);
            startGIS();
            startNumericInputGuard();
            startRestrictionsValidation();
            startCustomAttributes();
            startFkMessageGuard();
            updateShellTitle();
            window.addEventListener("hashchange", updateShellTitle);
        }
    });
});
