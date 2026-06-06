sap.ui.define([], function () {
  "use strict";

  // Icon per attribute data type — gives the list quick visual scannability.
  var DATA_TYPE_ICONS = {
    Text:         "sap-icon://text",
    Integer:      "sap-icon://number-sign",
    Decimal:      "sap-icon://measure",
    Date:         "sap-icon://appointment-2",
    Boolean:      "sap-icon://accept",
    SingleSelect: "sap-icon://slim-arrow-down",
    MultiSelect:  "sap-icon://multi-select"
  };

  return {
    /** Icon for a data type (falls back to a generic icon). */
    dataTypeIcon: function (dataType) {
      return DATA_TYPE_ICONS[dataType] || "sap-icon://attachment-text-file";
    },

    /** Semantic state for an Active/Inactive status. */
    statusState: function (status) {
      return status === "Active" ? "Success" : "None";
    },

    /** Whether a data type uses an allowed-value list. */
    isSelectType: function (dataType) {
      return dataType === "SingleSelect" || dataType === "MultiSelect";
    },

    /** "<DataType> · <unit>" subtitle for an attribute list row. */
    attrSubtitle: function (dataType, unit) {
      return (dataType || "") + (unit ? "  ·  " + unit : "");
    },

    /** Title-case an object-type key (e.g. "bridge" -> "Bridge") for display. */
    objectTypeLabel: function (objectType) {
      if (!objectType) { return ""; }
      return objectType.charAt(0).toUpperCase() + objectType.slice(1);
    },

    /** Count label for allowed values, e.g. "3 values". */
    countText: function (n) {
      var c = n || 0;
      return c + (c === 1 ? " value" : " values");
    }
  };
});
