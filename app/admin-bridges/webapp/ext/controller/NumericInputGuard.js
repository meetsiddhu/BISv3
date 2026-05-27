(function () {
  "use strict";

  var INTEGER_FIELDS = [
    "yearBuilt", "spanCount", "numberOfLanes", "conditionRating",
    "structuralAdequacyRating", "floodImmunityAriYears", "importanceLevel",
    "averageDailyTraffic", "speedLimit", "designLife"
  ];

  var DECIMAL_FIELDS = [
    "latitude", "longitude", "clearanceHeight", "spanLength", "totalLength",
    "deckWidth", "loadRating", "heavyVehiclePercent",
    "grossMassLimit", "axleMassLimit", "heightLimit", "widthLimit", "lengthLimit",
    "grossCombined", "steerAxleLimit", "singleAxleLimit", "tandemGroupLimit",
    "triAxleGroupLimit", "minClearancePosted", "lane1Clearance", "lane2Clearance",
    "carriagewayWidth", "trafficableWidth", "laneWidth", "ratingFactor",
    "floodClosureLevel", "consumedLife"
  ];

  var INTEGER_PATTERN = /^-?\d*$/;
  var DECIMAL_PATTERN = /^-?(?:\d+|\d*\.\d*)?$/;
  var NUMERIC_FIELDS = INTEGER_FIELDS.concat(DECIMAL_FIELDS);

  function hasFieldToken(input, field) {
    var control = null;
    try {
      control = window.sap && sap.ui && sap.ui.getCore && sap.ui.getCore().byId(input.id.replace(/-inner$/, ""));
    } catch (error) {
      control = null;
    }
    var binding = control && control.getBinding && (control.getBinding("value") || control.getBinding("selectedKey"));
    var bindingPath = binding && binding.getPath ? binding.getPath() : "";
    var text = [
      input.id,
      input.name,
      input.getAttribute("aria-labelledby"),
      input.getAttribute("aria-describedby"),
      bindingPath
    ].join(" ");
    return text.indexOf(field) !== -1;
  }

  function findRule(input) {
    for (var i = 0; i < INTEGER_FIELDS.length; i++) {
      if (hasFieldToken(input, INTEGER_FIELDS[i])) return { pattern: INTEGER_PATTERN, decimal: false };
    }
    for (var j = 0; j < DECIMAL_FIELDS.length; j++) {
      if (hasFieldToken(input, DECIMAL_FIELDS[j])) return { pattern: DECIMAL_PATTERN, decimal: true };
    }
    return null;
  }

  function nextValue(input, event) {
    var value = input.value || "";
    var start = input.selectionStart == null ? value.length : input.selectionStart;
    var end = input.selectionEnd == null ? value.length : input.selectionEnd;
    return value.slice(0, start) + (event.data || "") + value.slice(end);
  }

  function sanitize(value, allowDecimal) {
    var sanitized = String(value || "").replace(/[^\d.-]/g, "");
    var negative = sanitized.charAt(0) === "-";
    sanitized = sanitized.replace(/-/g, "");
    if (allowDecimal) {
      var parts = sanitized.split(".");
      sanitized = parts.shift() + (parts.length ? "." + parts.join("") : "");
    } else {
      sanitized = sanitized.replace(/\./g, "");
    }
    return (negative ? "-" : "") + sanitized;
  }

  function bind(input) {
    if (input._bmsNumericGuard) return;
    var rule = findRule(input);
    if (!rule) return;

    input._bmsNumericGuard = true;
    input.setAttribute("inputmode", rule.decimal ? "decimal" : "numeric");

    input.addEventListener("beforeinput", function (event) {
      if (!event.data || event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") return;
      if (!rule.pattern.test(nextValue(input, event))) event.preventDefault();
    });

    input.addEventListener("paste", function (event) {
      var pasted = event.clipboardData && event.clipboardData.getData("text");
      if (pasted == null) return;
      var value = input.value || "";
      var start = input.selectionStart == null ? value.length : input.selectionStart;
      var end = input.selectionEnd == null ? value.length : input.selectionEnd;
      var candidate = value.slice(0, start) + pasted + value.slice(end);
      if (rule.pattern.test(candidate)) return;
      event.preventDefault();
      input.value = sanitize(candidate, rule.decimal);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function scan() {
    NUMERIC_FIELDS.forEach(function (field) {
      document.querySelectorAll("input[id*='" + field + "'], input[name*='" + field + "']").forEach(bind);
    });
  }

  window._bmsNumericInputGuard = scan;
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}());
