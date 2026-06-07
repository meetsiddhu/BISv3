sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Panel",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/Title",
  "sap/m/Text",
  "sap/m/ObjectStatus",
  "sap/m/Label",
  "sap/m/CustomListItem",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/ScrollContainer",
  "sap/m/FormattedText"
], function (Controller, JSONModel, MessageToast, MessageBox,
             Panel, VBox, HBox, Title, Text, ObjectStatus, Label, CustomListItem,
             Dialog, Button, ScrollContainer, FormattedText) {
  "use strict";

  var FIELD_LABELS = {
    // Bridge — identity & location
    bridgeId:                 "Bridge ID",
    bridgeName:               "Bridge Name",
    state:                    "State",
    region:                   "Region",
    lga:                      "LGA",
    route:                    "Route",
    routeNumber:              "Route Number",
    location:                 "Location",
    latitude:                 "Latitude",
    longitude:                "Longitude",
    // Bridge — ownership
    assetClass:               "Asset Class",
    assetOwner:               "Asset Owner",
    managingAuthority:        "Managing Authority",
    // Bridge — structure
    structureType:            "Structure Type",
    material:                 "Material",
    yearBuilt:                "Year Built",
    designLoad:               "Design Load",
    designStandard:           "Design Standard",
    spanCount:                "Span Count",
    spanLength:               "Span Length (m)",
    totalLength:              "Total Length (m)",
    deckWidth:                "Deck Width (m)",
    clearanceHeight:          "Clearance Height (m)",
    numberOfLanes:            "Number of Lanes",
    // Bridge — condition
    condition:                "Condition",
    conditionRating:          "Condition Rating",
    conditionStandard:        "Condition Standard",
    conditionSummary:         "Condition Summary",
    conditionAssessor:        "Assessed By",
    conditionReportRef:       "Report Reference",
    conditionNotes:           "Condition Notes",
    structuralAdequacy:       "Structural Adequacy",
    structuralAdequacyRating: "Structural Adequacy Rating",
    // Bridge — risk & inspection
    postingStatus:            "Posting Status",
    status:                   "Status",
    lastInspectionDate:       "Last Inspection Date",
    seismicZone:              "Seismic Zone",
    floodImmunityAriYears:    "Flood Immunity ARI (years)",
    floodImpacted:            "Flood Impacted",
    highPriorityAsset:        "High Priority Asset",
    asBuiltDrawingReference:  "As-Built Drawing Reference",
    remarks:                  "Remarks",
    // Bridge — NHVR & approvals
    nhvrAssessed:             "NHVR Assessed",
    nhvrAssessmentDate:       "NHVR Assessment Date",
    nhvrReferenceUrl:         "NHVR Reference URL",
    loadRating:               "Load Rating (t)",
    pbsApprovalClass:         "PBS Approval Class",
    importanceLevel:          "Importance Level",
    averageDailyTraffic:      "Average Daily Traffic (ADT)",
    heavyVehiclePercent:      "Heavy Vehicle Percentage (%)",
    gazetteReference:         "Gazette Reference",
    freightRoute:             "Freight Route",
    overMassRoute:            "Over Mass Route",
    hmlApproved:              "HML Approved",
    bDoubleApproved:          "B-Double Approved",
    // Bridge — provenance
    dataSource:               "Data Source",
    sourceReferenceUrl:       "Source Reference URL",
    openDataReference:        "Open Data Reference",
    sourceRecordId:           "Source Record ID",
    isActive:                 "Active",
    // Restriction / BridgeRestriction
    restrictionRef:           "Reference",
    bridgeRef:                "Bridge Reference",
    bridge_ID:                "Bridge",
    restrictionCategory:      "Category",
    restrictionType:          "Restriction Type",
    restrictionValue:         "Value",
    restrictionUnit:          "Unit",
    restrictionStatus:        "Status",
    active:                   "Active",
    temporary:                "Temporary",
    appliesToVehicleClass:    "Applies to Vehicle Class",
    direction:                "Direction",
    effectiveFrom:            "Effective From",
    effectiveTo:              "Effective To",
    grossMassLimit:           "Gross Mass Limit (t)",
    axleMassLimit:            "Axle Mass Limit (t)",
    heightLimit:              "Height Limit (m)",
    widthLimit:               "Width Limit (m)",
    lengthLimit:              "Length Limit (m)",
    speedLimit:               "Speed Limit (km/h)",
    permitRequired:           "Permit Required",
    escortRequired:           "Escort Required",
    approvedBy:               "Approved By",
    approvalReference:        "Approval Reference",
    legalReference:           "Gazette / Legal Reference",
    issuingAuthority:         "Issuing Authority",
    enforcementAuthority:     "Enforcement Authority",
    temporaryFrom:            "Temporary From",
    temporaryTo:              "Temporary To",
    temporaryReason:          "Temporary Reason",
    name:                     "Name",
    descr:                    "Description",
    // Capacity
    capacityType:             "Capacity Type",
    capacityStatus:           "Capacity Status",
    ratingMethod:             "Rating Method",
    ratingFactor:             "Rating Factor",
    minClearancePosted:       "Min. Clearance Posted",
    grossCombined:            "Gross Combined (t)",
    steerAxleLimit:           "Steer Axle Limit (t)",
    singleAxleLimit:          "Single Axle Limit (t)",
    tandemGroupLimit:         "Tandem Group Limit (t)",
    triAxleGroupLimit:        "Tri-Axle Group Limit (t)",
    lane1Clearance:           "Lane 1 Clearance (m)",
    lane2Clearance:           "Lane 2 Clearance (m)",
    carriagewayWidth:         "Carriageway Width (m)",
    trafficableWidth:         "Trafficable Width (m)",
    laneWidth:                "Lane Width (m)",
    consumedLife:             "Consumed Life (%)",
    designLife:               "Design Life (years)",
    pbsClass:                 "PBS Class",
    floodClosureLevel:        "Flood Closure Level (m)",
    notes:                    "Notes",
    // System
    ID:                       "Record ID",
    createdAt:                "Created At",
    createdBy:                "Created By",
    modifiedAt:               "Modified At",
    modifiedBy:               "Modified By"
  };

  function fieldLabel(rawName) {
    return FIELD_LABELS[rawName] || rawName;
  }

  return Controller.extend("BridgeManagement.bmsadmin.controller.ChangeDocuments", {

    onInit: function () {
      this._auditBase = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/AuditService/uri").replace(/\/$/, "");
      this._model = new JSONModel({ changes: [], loading: false });
      this.getView().setModel(this._model, "audit");
    },

    _getFilterValues: function () {
      return {
        objectType: this.byId("filterObjectType").getSelectedKey(),
        source:     this.byId("filterSource").getSelectedKey(),
        user:       (this.byId("filterUser").getValue() || "").trim(),
        objectId:   (this.byId("filterObjectId").getValue() || "").trim(),
        from:       this.byId("filterDateFrom").getValue(),
        to:         this.byId("filterDateTo").getValue()
      };
    },

    onFilterChange: function () { /* live-change: do nothing until Apply */ },
    onApplyFilters: function () { this._loadChanges(); },
    onRefresh:      function () { this._loadChanges(); },

    onResetFilters: function () {
      this.byId("filterObjectType").setSelectedKey("");
      this.byId("filterSource").setSelectedKey("");
      this.byId("filterUser").setValue("");
      this.byId("filterObjectId").setValue("");
      this.byId("filterDateFrom").setValue("");
      this.byId("filterDateTo").setValue("");
      this.byId("emptyState").setVisible(true);
      this.byId("flatTablePanel").setVisible(false);
      this.byId("resultsPanel").setVisible(false);
      this.byId("kpiBox").setVisible(false);
    },

    _loadChanges: function () {
      const view = this.getView();
      view.setBusy(true);

      const filters = this._getFilterValues();
      const params  = new URLSearchParams();
      if (filters.objectType) params.set("objectType", filters.objectType);
      if (filters.source)     params.set("source",     filters.source);
      if (filters.user)       params.set("user",        filters.user);
      if (filters.from)       params.set("from",        filters.from);
      if (filters.to)         params.set("to",          filters.to);

      fetch(this._auditBase + "/changes?" + params.toString(), { credentials: "same-origin" })
        .then(r => r.json())
        .then(data => {
          view.setBusy(false);
          let rows = data.changes || [];
          if (filters.objectId) {
            const needle = filters.objectId.toLowerCase();
            rows = rows.filter(r =>
              (r.objectName || "").toLowerCase().includes(needle) ||
              (r.objectId   || "").toLowerCase().includes(needle)
            );
          }
          this._renderResults(rows);
        })
        .catch(err => {
          view.setBusy(false);
          MessageBox.error("Failed to load change documents: " + err.message);
        });
    },

    _renderResults: function (rows) {
      const isEmpty = !rows || !rows.length;
      this.byId("emptyState").setVisible(isEmpty);
      this.byId("flatTablePanel").setVisible(!isEmpty);
      this.byId("resultsPanel").setVisible(!isEmpty);
      this.byId("kpiBox").setVisible(!isEmpty);
      if (isEmpty) return;

      const enriched = rows.map(r => ({
        ...r,
        changedAtDisplay: r.changedAt
          ? new Date(r.changedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })
          : "",
        objectTypeState: this._objectTypeState(r.objectType),
        sourceState:     this._sourceState(r.changeSource)
      }));

      const table = this.byId("changeTable");
      table.setModel(new JSONModel({ items: enriched }));
      table.bindRows("/items");

      this.byId("flatCount").setText(enriched.length + " row(s)");
      this.byId("kpiTotalVal").setValue(enriched.length);
      this._renderGroupedPanel(enriched);
    },

    _renderGroupedPanel: function (rows) {
      const groups = new Map();
      for (const changeRow of rows) {
        const key = changeRow.objectType + "|" + changeRow.objectId;
        if (!groups.has(key)) {
          groups.set(key, { objectType: changeRow.objectType, objectId: changeRow.objectId, objectName: changeRow.objectName, batches: new Map() });
        }
        const objectChangeGroup = groups.get(key);
        const auditBatchKey = changeRow.batchId || changeRow.changedAt || Math.random();
        if (!objectChangeGroup.batches.has(auditBatchKey)) {
          objectChangeGroup.batches.set(auditBatchKey, { changedAt: changeRow.changedAt, changedAtDisplay: changeRow.changedAtDisplay, changedBy: changeRow.changedBy, source: changeRow.changeSource, fields: [] });
        }
        objectChangeGroup.batches.get(auditBatchKey).fields.push(changeRow);
      }

      const list = this.byId("objectGroupList");
      list.removeAllItems();

      for (const [, group] of groups) {
        const item    = new CustomListItem();
        const outerBox = new VBox({ class: "sapUiSmallMargin" });

        const headerBox = new HBox({ alignItems: "Center" });
        headerBox.addItem(new ObjectStatus({ text: group.objectType, state: this._objectTypeState(group.objectType), class: "sapUiSmallMarginEnd" }));
        headerBox.addItem(new Title({ text: group.objectName || group.objectId, level: "H4" }));
        outerBox.addItem(headerBox);

        for (const [, batch] of group.batches) {
          const batchPanel = new Panel({
            headerText: batch.changedAtDisplay + "  ·  " + batch.changedBy + "  ·  " + batch.source,
            expandable: true, expanded: false, class: "sapUiTinyMarginTop"
          });
          const fieldList = new sap.m.List({ mode: "None" });
          for (const fieldChange of batch.fields) {
            const row = new HBox({ alignItems: "Center", class: "sapUiTinyMarginTop sapUiTinyMarginBottom" });
            const oFieldLabel = new Label({ text: fieldLabel(fieldChange.fieldName), width: "200px", wrapping: false });
            oFieldLabel.addStyleClass("sapUiSmallMarginEnd");
            const previousValue = new Text({ text: fieldChange.oldValue || "-", wrapping: true, width: "160px" });
            const newValue      = new Text({ text: fieldChange.newValue || "-", wrapping: true });
            previousValue.addStyleClass("bmsAuditOld");
            newValue.addStyleClass("bmsAuditNew");
            row.addItem(oFieldLabel);
            row.addItem(previousValue);
            row.addItem(new sap.ui.core.Icon({ src: "sap-icon://arrow-right", color: "#8696a9", size: "0.75rem", class: "sapUiSmallMarginBeginEnd" }));
            row.addItem(newValue);
            fieldList.addItem(new sap.m.CustomListItem({ content: [row] }));
          }
          batchPanel.addContent(fieldList);
          outerBox.addItem(batchPanel);
        }
        item.addContent(outerBox);
        list.addItem(item);
      }

      this.byId("resultsTitle").setText("Objects with Changes (" + groups.size + ")");
      this.byId("recordCount").setText(rows.length + " field change(s)");
    },

    onExportCsv: function () {
      const model = this.byId("changeTable").getModel();
      if (!model) { MessageToast.show("No data to export."); return; }
      const items = model.getProperty("/items") || [];
      if (!items.length) { MessageToast.show("No data to export."); return; }

      const FIELDS  = ["changedAtDisplay","changedBy","objectType","objectName","objectId","fieldName","oldValue","newValue","changeSource","batchId"];
      const HEADERS = ["Changed At","Changed By","Object Type","Object Name","Object ID","Field","Old Value","New Value","Source","Batch ID"];
      const escapeCsvCell  = auditCell => { const cellText = (auditCell == null ? "" : String(auditCell)); return cellText.includes(",") || cellText.includes('"') || cellText.includes("\n") ? '"' + cellText.replace(/"/g, '""') + '"' : cellText; };
      const csv     = [HEADERS.join(","), ...items.map(changeRow => FIELDS.map(auditField => escapeCsvCell(changeRow[auditField])).join(","))].join("\n");
      const downloadLink       = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })), download: "BMS_ChangeDocument_" + new Date().toISOString().slice(0,10) + ".csv" });
      downloadLink.click();
      URL.revokeObjectURL(downloadLink.href);
      MessageToast.show("Export downloaded.");
    },

    _objectTypeState: function (type) {
      switch ((type || "").toLowerCase()) {
        case "bridge":             return "Success";
        case "restriction":        return "Warning";
        case "bridgerestriction":  return "Warning";
        case "bridgecapacity":     return "Information";
        case "gisconfig":          return "None";
        default:                   return "None";
      }
    },

    _sourceState: function (source) {
      switch ((source || "").toLowerCase()) {
        case "odata":      return "Success";
        case "massedit":   return "Warning";
        case "massupload": return "Error";
        default:           return "None";
      }
    },

    onTileInfo: function (_oEvent) {
      var sHtml = "<p><strong>Total Changes</strong> is the count of individual field-level change records matching your current filter criteria.</p>" +
                  "<p>Each row in the Field-Level Changes table represents one field change. Multiple field changes for the same object in the same session are grouped together in the grouped view above.</p>";
      var oDialog = new Dialog({
        title: "Total Changes",
        contentWidth: "460px",
        content: [new ScrollContainer({ width: "100%", vertical: true,
          content: [new FormattedText({ htmlText: sHtml })]
        })],
        endButton: new Button({ text: "Close", press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.addStyleClass("sapUiContentPadding");
      oDialog.open();
    },

    onShowHelp: function () {
      var sHtml = [
        "<h4>Purpose</h4>",
        "<p>The Change Document Report provides a complete audit trail of every field-level change made to Bridge and Restriction records in BMS. ",
        "Use it to investigate who changed what, when, and from which source (Fiori UI, Mass Edit, or Mass Upload).</p>",
        "<h4>How to Search</h4>",
        "<ol>",
        "<li>Use the <strong>Search &amp; Filter</strong> panel to narrow results by <em>Object Type</em>, <em>Change Source</em>, <em>Changed By</em> user, <em>Object Name/ID</em>, and a date range.</li>",
        "<li>Click <strong>Apply Filters</strong> to load matching changes. Results appear in two panels: a grouped object view and a flat field-level table.</li>",
        "<li>Click <strong>Reset</strong> to clear all filters and start over.</li>",
        "</ol>",
        "<h4>Reading the Results</h4>",
        "<ul>",
        "<li><strong>Grouped view:</strong> shows each affected object with the number of field changes in that batch. Expand to see individual fields.</li>",
        "<li><strong>Field-Level Changes table:</strong> shows every changed field with its old value, new value, timestamp, and source badge.</li>",
        "</ul>",
        "<h4>Exporting</h4>",
        "<p>Click <strong>Export CSV</strong> to download the current filtered results as a spreadsheet for offline analysis or compliance reporting.</p>",
        "<h4>Change Sources</h4>",
        "<ul>",
        "<li><strong>OData (Fiori UI):</strong> field edited directly in a Fiori form by a user.</li>",
        "<li><strong>Mass Edit:</strong> changed via the in-app grid editor.</li>",
        "<li><strong>Mass Upload:</strong> imported via CSV or Excel bulk upload.</li>",
        "</ul>"
      ].join("");
      var oDialog = new Dialog({
        title: "Change Document Report: Help",
        contentWidth: "480px",
        content: [new FormattedText({ htmlText: sHtml })],
        endButton: new Button({ text: "Close", press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.addStyleClass("sapUiContentPadding");
      oDialog.open();
    }
  });
});
