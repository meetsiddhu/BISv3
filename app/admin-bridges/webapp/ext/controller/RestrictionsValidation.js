(function () {
    "use strict";

    var TYPE_UNIT_MAP = {
        "Speed Restriction": ["km/h"],
        "Mass Limit":        ["t"],
        "Dimension Limit":   ["m"],
        "Access Restriction": ["approval"]
    };
    var NUMERIC_TYPES   = ["Mass Limit", "Speed Restriction", "Dimension Limit"];
    var NUMERIC_UNITS   = ["km/h", "m", "t"];
    var DECIMAL_PATTERN = /^-?(?:\d+|\d*\.\d*)?$/;

    function getControl(input) {
        try {
            return sap.ui.getCore().byId(input.id.replace(/-inner$/, "").replace(/-placeholder$/, ""));
        } catch (_e) { return null; }
    }

    function getBindingContext(input) {
        var ctrl = getControl(input);
        return ctrl && ctrl.getBindingContext && ctrl.getBindingContext();
    }

    function requiresNumeric(ctx) {
        if (!ctx) return false;
        var type = ctx.getProperty("restrictionType") || "";
        var unit = ctx.getProperty("restrictionUnit") || "";
        return NUMERIC_TYPES.indexOf(type) !== -1 || NUMERIC_UNITS.indexOf(unit) !== -1;
    }

    function nextValue(input, event) {
        var value = input.value || "";
        var start = input.selectionStart == null ? value.length : input.selectionStart;
        var end   = input.selectionEnd   == null ? value.length : input.selectionEnd;
        return value.slice(0, start) + (event.data || "") + value.slice(end);
    }

    function showUnitWarning(type, unit) {
        var allowed = TYPE_UNIT_MAP[type];
        if (!allowed) return;
        try {
            sap.m.MessageToast.show(
                "Unit \u201c" + unit + "\u201d is not valid for \u201c" + type +
                "\u201d. Expected: " + allowed.join(", ") + ".",
                { duration: 4000 }
            );
        } catch (_e) {}
    }

    function setUnitValueState(errorMsg) {
        document.querySelectorAll("input[id*='restrictionUnit']").forEach(function (input) {
            var ctrl = getControl(input);
            if (!ctrl) return;
            if (ctrl.setValueState) {
                ctrl.setValueState(errorMsg ? "Error" : "None");
                if (ctrl.setValueStateText) ctrl.setValueStateText(errorMsg || "");
            }
        });
    }

    function checkTypeUnitCompatibility(ctx) {
        if (!ctx) return;
        var type    = ctx.getProperty("restrictionType") || "";
        var unit    = ctx.getProperty("restrictionUnit") || "";
        var allowed = TYPE_UNIT_MAP[type];
        if (type && unit && allowed && allowed.indexOf(unit) === -1) {
            showUnitWarning(type, unit);
            setUnitValueState("Unit \u201c" + unit + "\u201d is not valid for \u201c" + type + "\u201d. Expected: " + allowed.join(", ") + ".");
        } else {
            setUnitValueState(null);
        }
    }

    /* ── Guard: restrictionValue must be numeric when type/unit requires it ── */
    function applyValueGuard(input) {
        if (input._bmsRestrictionValueGuard) return;
        input._bmsRestrictionValueGuard = true;

        input.addEventListener("beforeinput", function (event) {
            if (!event.data) return;
            if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") return;
            var ctx = getBindingContext(input);
            if (!requiresNumeric(ctx)) return;
            if (!DECIMAL_PATTERN.test(nextValue(input, event))) event.preventDefault();
        });

        input.addEventListener("paste", function (event) {
            var ctx = getBindingContext(input);
            if (!requiresNumeric(ctx)) return;
            var pasted = event.clipboardData && event.clipboardData.getData("text");
            if (pasted == null) return;
            var value = input.value || "";
            var start = input.selectionStart == null ? value.length : input.selectionStart;
            var end   = input.selectionEnd   == null ? value.length : input.selectionEnd;
            var candidate = value.slice(0, start) + pasted + value.slice(end);
            if (DECIMAL_PATTERN.test(candidate)) return;
            event.preventDefault();
        });
    }

    /* ── Watch: restrictionUnit / restrictionType changes → compatibility check ── */
    function applyCompatibilityWatch(input) {
        if (input._bmsCompatWatch) return;
        input._bmsCompatWatch = true;
        input.addEventListener("change", function () {
            setTimeout(function () {
                var ctx = getBindingContext(input);
                checkTypeUnitCompatibility(ctx);
            }, 150);
        });
    }

    function scan() {
        document.querySelectorAll("input[id*='restrictionValue']").forEach(applyValueGuard);
        document.querySelectorAll("input[id*='restrictionUnit'], input[id*='restrictionType']").forEach(applyCompatibilityWatch);
    }

    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}());
