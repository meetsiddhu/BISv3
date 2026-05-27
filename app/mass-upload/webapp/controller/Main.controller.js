sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/core/InvisibleMessage",
  "sap/ui/core/library",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/FormattedText"
], function (Controller, JSONModel, MessageBox, MessageToast, InvisibleMessage, coreLibrary, Dialog, Button,  FormattedText) {
  "use strict";

  const InvisibleMessageMode = coreLibrary.InvisibleMessageMode;

  return Controller.extend("BridgeManagement.massupload.controller.Main", {
    _ALL_DATASETS_KEY: "All",

    onInit: function () {
      const now = new Date();
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const model = new JSONModel({
        busy: false,
        datasets: [],
        historyFilterOptions: [],
        selectedDataset: this._ALL_DATASETS_KEY,
        selectedDatasetLabel: "",
        selectedDatasetDescription: "",
        selectedDatasetTemplateText: "",
        selectedDatasetFormat: "",
        selectedDatasetValidation: "",
        selectedTemplateActionText: "",
        selectedSelectionMode: "",
        selectedTemplateIncludes: "",
        selectedTemplateAdvice: "",
        selectedUploadAdvice: "",
        selectedMandatoryHint: "",
        uploadReadyText: "No file selected",
        uploadFormatText: "",
        uploadScopeText: "",
        canUpload: false,
        previewValidated: false,
        previewMessage: "",
        previewMessageType: "Information",
        previewRows: [],
        previewTitle: "",
        previewColHdr1: "",
        previewColHdr2: "",
        previewColHdr3: "",
        previewColHdr4: "",
        previewColHdr5: "",
        previewValidCount: 0,
        fileName: "",
        uploadSummaries: [],
        uploadWarnings: [],
        uploadWarningsTitle: "",
        lastMessage: "",
        skippedMessage: "",
        hasUploadResults: false,
        allHistoryRows: [],
        historyRows: [],
        historyFilter: "",
        historyStats: {
          totalFiles: 0,
          totalRows: 0,
          insertedRows: 0,
          updatedRows: 0
        },
        adminReport: {
          fromDate: this._formatDate(ninetyDaysAgo),
          toDate: this._formatDate(now),
          dataset: "",
          rows: [],
          summary: {
            totalFiles: 0,
            totalRows: 0,
            insertedRows: 0,
            updatedRows: 0
          }
        }
      });
      this.getView().setModel(model, "view");
      this._massUploadBase = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/MassUploadService/uri").replace(/\/$/, "");
      this._invisibleMessage = InvisibleMessage.getInstance();
      this._file = null;
      this._loadDatasets();
    },

    onExit: function () {
    },

    onAfterRendering: function () {
      const dropZone = this.byId("dropZone");
      if (!dropZone) {
        return;
      }

      const dropDomRef = dropZone.getDomRef();
      if (!dropDomRef || dropDomRef.dataset.massUploadBound === "true") {
        return;
      }

      dropDomRef.dataset.massUploadBound = "true";
      dropDomRef.addEventListener("dragenter", this._onDropZoneDragEnter.bind(this));
      dropDomRef.addEventListener("dragover", this._onDropZoneDragOver.bind(this));
      dropDomRef.addEventListener("dragleave", this._onDropZoneDragLeave.bind(this));
      dropDomRef.addEventListener("drop", this._onDropZoneDrop.bind(this));
      dropDomRef.addEventListener("click", this._openFileDialog.bind(this));
      dropDomRef.addEventListener("keydown", this._onDropZoneKeyDown.bind(this));
      dropDomRef.setAttribute("tabindex", "0");
      dropDomRef.setAttribute("role", "button");
    },

    onRefresh: function () {
      this._loadDatasets();
    },

    onTabSelect: async function (oEvent) {
      const key = oEvent.getParameter("key") || oEvent.getParameter("selectedKey");
      if (key === "history" || key === "adminReport") {
        await this._loadHistory();
      }
    },

    onDatasetChange: function (oEvent) {
      this._getViewModel().setProperty("/selectedDataset", oEvent.getSource().getSelectedKey());
      this._setSelectedFile(null);
      const uploader = this.byId("fileUploader");
      if (uploader) {
        uploader.clear();
      }
      this._updateSelectedDatasetContext();
    },

    onDownloadWorkbook: function () {
      window.open("/mass-upload/api/template.xlsx", "_blank");
    },

    onDownloadSelectedTemplate: function () {
      const dataset = this._getViewModel().getProperty("/selectedDataset");
      if (dataset === this._ALL_DATASETS_KEY) {
        this.onDownloadWorkbook();
        return;
      }
      this.onDownloadCsv();
    },

    onDownloadCsv: function () {
      const dataset = this._getViewModel().getProperty("/selectedDataset");
      if (!dataset) {
        MessageBox.warning("Select a dataset before downloading a CSV template.");
        return;
      }
      if (dataset === this._ALL_DATASETS_KEY) {
        this.onDownloadWorkbook();
        return;
      }
      const url = `/mass-upload/api/template.csv?dataset=${encodeURIComponent(dataset)}`;
      window.open(url, "_blank");
    },

    onHistoryFilterChange: function () {
      this._applyHistoryFilter();
    },

    onHistoryRefresh: async function () {
      await this._loadHistory();
      MessageToast.show("Upload history refreshed");
    },

    onRunAdminReport: function () {
      const model = this._getViewModel();
      const adminReport = model.getProperty("/adminReport") || {};
      const rows = this._filterHistoryRows(
        model.getProperty("/allHistoryRows") || [],
        adminReport.dataset,
        adminReport.fromDate,
        adminReport.toDate
      );
      model.setProperty("/adminReport/rows", rows);
      model.setProperty("/adminReport/summary", this._summarizeHistoryRows(rows));
    },

    onExportHistory: function () {
      this._downloadRowsAsCsv(this._getViewModel().getProperty("/historyRows") || [], "mass-upload-history.csv");
    },

    onExportAdminReport: function () {
      this._downloadRowsAsCsv(this._getViewModel().getProperty("/adminReport/rows") || [], "mass-upload-admin-report.csv");
    },

    onUploadAnother: function () {
      const uploader = this.byId("fileUploader");
      if (uploader) {
        uploader.clear();
      }
      this._setSelectedFile(null);
      const model = this._getViewModel();
      model.setProperty("/uploadSummaries", []);
      model.setProperty("/uploadWarnings", []);
      model.setProperty("/uploadWarningsTitle", "");
      model.setProperty("/lastMessage", "");
      model.setProperty("/skippedMessage", "");
      model.setProperty("/hasUploadResults", false);
      const wizard = this.byId("uploadWizard");
      if (wizard) {
        wizard.discardProgress(this.byId("stepEntity"));
      }
    },

    onWizardComplete: function () {
      var oCrossAppNav = sap.ushell && sap.ushell.Container && sap.ushell.Container.getService("CrossApplicationNavigation");
      if (oCrossAppNav) {
        oCrossAppNav.toExternal({ target: { semanticObject: "Dashboard", action: "display" } });
      } else {
        window.location.href = "/dashboard/webapp";
      }
    },

    onFileChange: function (oEvent) {
      const files = oEvent.getParameter("files") || [];
      this._setSelectedFile(files[0] || null);
      if (this._file) {
        this.onPreviewUpload();
      }
    },

    onPreviewUpload: async function () {
      if (!this._file) {
        MessageBox.warning("Choose a CSV or Excel file to validate.");
        return;
      }

      const model = this._getViewModel();
      model.setProperty("/busy", true);
      this._clearPreview();

      try {
        const [contentBase64, csrfToken] = await Promise.all([
          this._readFileAsBase64(this._file),
          this._fetchCsrfToken()
        ]);
        const response = await fetch(this._massUploadBase + "/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
          },
          body: JSON.stringify({
            fileName: this._file.name,
            dataset: model.getProperty("/selectedDataset"),
            contentBase64
          })
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error?.message || payload.message || "Validation failed");
        }

        const previewColumns = payload.previewColumns || [];
        model.setProperty("/previewValidated", true);
        model.setProperty("/previewMessage", payload.message || "Validation complete.");
        model.setProperty("/previewMessageType", payload.errorCount > 0 ? (payload.validCount > 0 ? "Warning" : "Error") : "Success");
        model.setProperty("/previewRows", payload.previewRows || []);
        model.setProperty("/previewTitle", payload.previewTitle || "");
        model.setProperty("/previewColHdr1", previewColumns[0] || "");
        model.setProperty("/previewColHdr2", previewColumns[1] || "");
        model.setProperty("/previewColHdr3", previewColumns[2] || "");
        model.setProperty("/previewColHdr4", previewColumns[3] || "");
        model.setProperty("/previewColHdr5", previewColumns[4] || "");
        model.setProperty("/previewValidCount", Number(payload.validCount || 0));
      } catch (error) {
        model.setProperty("/previewValidated", true);
        model.setProperty("/previewMessage", error.message || "Validation failed");
        model.setProperty("/previewMessageType", "Error");
        MessageBox.error(error.message || "Validation failed");
      } finally {
        model.setProperty("/busy", false);
      }
    },

    onUpload: async function () {
      if (!this._file) {
        MessageBox.warning("Choose a CSV or Excel file to upload.");
        return;
      }
      if (!this._getViewModel().getProperty("/previewValidated")) {
        MessageBox.warning("Preview and validate the file before uploading.");
        return;
      }
      if (this._getViewModel().getProperty("/previewValidCount") <= 0) {
        MessageBox.warning("There are no valid rows to upload.");
        return;
      }

      const model = this._getViewModel();
      model.setProperty("/busy", true);

      try {
        const [contentBase64, csrfToken] = await Promise.all([
          this._readFileAsBase64(this._file),
          this._fetchCsrfToken()
        ]);
        const response = await fetch(this._massUploadBase + "/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken
          },
          body: JSON.stringify({
            fileName: this._file.name,
            dataset: model.getProperty("/selectedDataset"),
            contentBase64
          })
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(`Upload failed (HTTP ${response.status}). The server returned an unexpected response. Please try again or contact your administrator.`);
        }

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error?.message || payload.message || "Upload failed");
        }

        model.setProperty("/uploadSummaries", payload.summaries || []);
        model.setProperty("/lastMessage", payload.message || "Upload complete.");

        const skipped = payload.skipped || [];
        if (skipped.length) {
          const names = skipped.map((s) => s.label || s.name).join(", ");
          model.setProperty("/skippedMessage",
            `${skipped.length} dataset(s) were not found in the uploaded file and were skipped: ${names}. ` +
            "Check that the sheet names in your file exactly match these dataset names and re-upload."
          );
        } else {
          model.setProperty("/skippedMessage", "");
        }

        const warnings = payload.warnings || [];
        if (warnings.length) {
          model.setProperty("/uploadWarnings", warnings);
          model.setProperty("/uploadWarningsTitle",
            `${warnings.length} issue(s) found during upload: affected rows were skipped or fields were cleared. ` +
            "Review the details below and correct your data before re-uploading those rows."
          );
        } else {
          model.setProperty("/uploadWarnings", []);
          model.setProperty("/uploadWarningsTitle", "");
        }

        model.setProperty("/hasUploadResults", !!(payload.message || (payload.summaries || []).length));
        await this._appendUploadHistory();
        this._setSelectedFile(null);
        this.byId("fileUploader").clear();
        this.byId("uploadWizard").nextStep();
        MessageToast.show("Mass upload completed successfully");
      } catch (error) {
        MessageBox.error(error.message || "Upload failed");
      } finally {
        model.setProperty("/busy", false);
      }
    },

    _loadDatasets: async function () {
      const model = this._getViewModel();
      model.setProperty("/busy", true);

      try {
        const response = await fetch(this._massUploadBase + "/datasets");
        const payload = await response.json();
        model.setProperty("/datasets", [{
          name: this._ALL_DATASETS_KEY,
          label: "All",
          description: "Download the workbook template and validate all supported sheets together."
        }].concat((payload.datasets || []).map((dataset) => ({
          ...dataset,
          description: this._getDatasetDescription(dataset)
        }))));
        model.setProperty("/historyFilterOptions", [{
          name: "",
          label: "All"
        }].concat(model.getProperty("/datasets")));

        if (!model.getProperty("/datasets").some((dataset) => dataset.name === model.getProperty("/selectedDataset"))) {
          const defaultDataset = model.getProperty("/datasets").find((dataset) => dataset.name === "Bridges");
          model.setProperty("/selectedDataset", defaultDataset ? defaultDataset.name : this._ALL_DATASETS_KEY);
        }
        this._updateSelectedDatasetContext();
        await this._loadHistory();
      } catch (error) {
        MessageBox.error(error.message || "Failed to load upload datasets.");
      } finally {
        model.setProperty("/busy", false);
      }
    },

    _loadHistory: async function () {
      try {
        const response = await fetch(this._massUploadBase + "/history");
        const payload = await response.json();
        const model = this._getViewModel();
        const rows = (payload.rows || []).map((row) => ({
          id: row.ID,
          uploadedAt: row.uploadedAt,
          uploadedDate: row.uploadedAt ? row.uploadedAt.slice(0, 10) : "",
          uploadedAtFmt: row.uploadedAt ? new Date(row.uploadedAt).toLocaleString([], {
            year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit"
          }) : "",
          fileName: row.fileName || "",
          dataset: row.dataset || "",
          datasetLabel: row.datasetLabel || row.dataset || "",
          processed: Number(row.processed || 0),
          inserted: Number(row.inserted || 0),
          updated: Number(row.updated || 0),
          statusLabel: "Completed",
          statusState: "Success"
        }));
        model.setProperty("/allHistoryRows", rows);
        this._applyHistoryFilter();
        this.onRunAdminReport();
      } catch (_) {
        // History load failure is non-fatal
      }
    },

    _fetchCsrfToken: async function () {
      const response = await fetch(this._massUploadBase + "/datasets", {
        method: "GET",
        headers: { "X-CSRF-Token": "Fetch" }
      });
      return response.headers.get("X-CSRF-Token") || "";
    },

    _readFileAsBase64: function (file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (event) {
          const result = event.target.result || "";
          const parts = String(result).split(",");
          resolve(parts[parts.length - 1] || "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    _getViewModel: function () {
      return this.getView().getModel("view");
    },

    _formatDate: function (date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    },

    _appendUploadHistory: async function () {
      await this._loadHistory();
    },

    _applyHistoryFilter: function () {
      const model = this._getViewModel();
      const rows = this._filterHistoryRows(model.getProperty("/allHistoryRows") || [], model.getProperty("/historyFilter"));
      model.setProperty("/historyRows", rows);
      model.setProperty("/historyStats", this._summarizeHistoryRows(rows));
    },

    _filterHistoryRows: function (rows, dataset, fromDate, toDate) {
      return rows.filter((row) => {
        const datasetMatches = !dataset || dataset === this._ALL_DATASETS_KEY || row.dataset === dataset;
        const afterFrom = !fromDate || row.uploadedDate >= fromDate;
        const beforeTo = !toDate || row.uploadedDate <= toDate;
        return datasetMatches && afterFrom && beforeTo;
      });
    },

    _summarizeHistoryRows: function (rows) {
      return rows.reduce((summary, row) => {
        summary.totalFiles += 1;
        summary.totalRows += Number(row.processed || 0);
        summary.insertedRows += Number(row.inserted || 0);
        summary.updatedRows += Number(row.updated || 0);
        return summary;
      }, {
        totalFiles: 0,
        totalRows: 0,
        insertedRows: 0,
        updatedRows: 0
      });
    },

    _downloadRowsAsCsv: function (rows, fileName) {
      if (!rows.length) {
        MessageToast.show("No rows to export");
        return;
      }
      const headers = ["Uploaded At", "File Name", "Dataset", "Processed", "Inserted", "Updated", "Status"];
      const lines = rows.map((row) => [
        row.uploadedAtFmt,
        row.fileName,
        row.datasetLabel,
        row.processed,
        row.inserted,
        row.updated,
        row.statusLabel
      ].map(this._escapeCsvValue).join(","));
      const blob = new Blob([headers.join(",") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    _escapeCsvValue: function (value) {
      const text = value === undefined || value === null ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    },

    _setSelectedFile: function (file) {
      this._file = file || null;
      const model = this._getViewModel();
      model.setProperty("/fileName", this._file ? this._file.name : "");
      model.setProperty("/canUpload", !!this._file);
      model.setProperty("/uploadReadyText", this._file ? this._file.name : "No file selected");
      this._clearPreview();
      this._toggleDropzoneState(!!this._file);
    },

    _clearPreview: function () {
      const model = this._getViewModel();
      model.setProperty("/previewValidated", false);
      model.setProperty("/previewMessage", "");
      model.setProperty("/previewMessageType", "Information");
      model.setProperty("/previewRows", []);
      model.setProperty("/previewTitle", "");
      model.setProperty("/previewColHdr1", "");
      model.setProperty("/previewColHdr2", "");
      model.setProperty("/previewColHdr3", "");
      model.setProperty("/previewColHdr4", "");
      model.setProperty("/previewColHdr5", "");
      model.setProperty("/previewValidCount", 0);
    },

    _toggleDropzoneState: function (hasFile) {
      const dropZone = this.byId("dropZone");
      if (!dropZone) {
        return;
      }
      dropZone.toggleStyleClass("is-dragover", false);
      dropZone.toggleStyleClass("has-file", hasFile);
    },

    _openFileDialog: function () {
      const uploader = this.byId("fileUploader");
      const domRef = uploader && uploader.getFocusDomRef();
      if (domRef) {
        domRef.click();
      }
    },

    _onDropZoneKeyDown: function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this._openFileDialog();
      }
    },

    _onDropZoneDragEnter: function (event) {
      event.preventDefault();
      this.byId("dropZone").toggleStyleClass("is-dragover", true);
    },

    _onDropZoneDragOver: function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      this.byId("dropZone").toggleStyleClass("is-dragover", true);
    },

    _onDropZoneDragLeave: function (event) {
      const currentTarget = event.currentTarget;
      const relatedTarget = event.relatedTarget;
      if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
        return;
      }
      this.byId("dropZone").toggleStyleClass("is-dragover", false);
    },

    _onDropZoneDrop: function (event) {
      event.preventDefault();
      const files = event.dataTransfer?.files || [];
      const file = files[0] || null;
      if (!file) {
        this.byId("dropZone").toggleStyleClass("is-dragover", false);
        return;
      }

      const lowerName = (file.name || "").toLowerCase();
      if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
        this.byId("dropZone").toggleStyleClass("is-dragover", false);
        MessageBox.warning("Only CSV (.csv) and Excel (.xlsx) files are supported for upload.");
        return;
      }

      this._setSelectedFile(file);
      this._invisibleMessage.announce(`Selected file ${file.name}`, InvisibleMessageMode.Assertive);
      this.onPreviewUpload();
    },

    _updateSelectedDatasetContext: function () {
      const model = this._getViewModel();
      const datasets = model.getProperty("/datasets") || [];
      const selectedKey = model.getProperty("/selectedDataset");
      const selectedDataset = datasets.find((dataset) => dataset.name === selectedKey) || datasets[0] || null;
      const isAll = selectedDataset?.name === this._ALL_DATASETS_KEY;
      const datasetLabel = selectedDataset?.label || "";

      model.setProperty("/selectedDatasetLabel", datasetLabel);
      model.setProperty("/selectedDatasetDescription", selectedDataset?.description || "");
      model.setProperty("/selectedDatasetTemplateText", isAll
        ? "Download the full workbook template with all datasets, dropdown source sheets, a DropdownExamples guide (allowed values in sequence), and mandatory field markers."
        : `Download the full CSV template for ${datasetLabel || "the selected dataset"} with all supported columns, current values as the editing baseline, and required fields marked with *.`);
      model.setProperty("/selectedTemplateActionText", isAll
        ? "Download Excel Template"
        : "Download Template CSV");
      model.setProperty("/selectedMandatoryHint", this._getDatasetMandatoryHint(selectedDataset, isAll));
      model.setProperty("/uploadFormatText", isAll
        ? "CSV and Excel (.xlsx) formats are supported. Use the Excel workbook template for All: it validates every dataset sheet together. For a single dataset, CSV or Excel both work."
        : "CSV (.csv) and Excel (.xlsx) formats are supported. For CSV, ensure the column headers match the downloaded template exactly.");
      model.setProperty("/uploadScopeText", isAll ? "Validation scope: all supported sheets" : `Validation scope: ${datasetLabel || "selected dataset"} only`);
      model.setProperty("/canUpload", !!this._file);
      if (!this._file) {
        model.setProperty("/uploadReadyText", "No file selected");
      }
    },

    _getDatasetMandatoryHint: function (dataset, isAll) {
      if (!dataset) {
        return "";
      }
      if (isAll) {
        return "Bridges required: bridgeId, bridgeName, state, assetOwner, latitude, longitude. "
          + "Bridges optional: conditionRating (1-10), condition (GOOD|FAIR|POOR|CRITICAL), postingStatus (UNRESTRICTED|POSTED|CLOSED). "
          + "Restrictions required: restrictionRef, restrictionCategory, restrictionType, restrictionStatus. "
          + "All dropdown sheets require: code. Optional: name, descr.";
      }
      if (dataset.name === "Bridges") {
        return "Required: bridgeId, bridgeName, state, assetOwner, latitude, longitude. "
          + "Optional: conditionRating (1-10), condition (GOOD|FAIR|POOR|CRITICAL), postingStatus (UNRESTRICTED|POSTED|CLOSED), "
          + "assetClass, route, routeNumber, region, lga, location, managingAuthority, structureType, yearBuilt, designLoad, designStandard, "
          + "clearanceHeight, spanLength, material, spanCount, totalLength, deckWidth, numberOfLanes, structuralAdequacyRating, "
          + "seismicZone, floodImpacted (true|false), highPriorityAsset (true|false), remarks.";
      }
      if (dataset.name === "Restrictions") {
        return "Required: restrictionRef, restrictionCategory, restrictionType, restrictionStatus. "
          + "Optional: bridgeRef, name, descr, restrictionValue, restrictionUnit, appliesToVehicleClass, "
          + "grossMassLimit, axleMassLimit, heightLimit, widthLimit, lengthLimit, speedLimit, "
          + "permitRequired (true|false), escortRequired (true|false), temporary (true|false), active (true|false), "
          + "effectiveFrom (YYYY-MM-DD), effectiveTo (YYYY-MM-DD), direction, enforcementAuthority, "
          + "approvedBy, legalReference, remarks.";
      }
      if (dataset.name === "AssetClasses") {
        return "Required: code. Optional: name (e.g. Beam Bridge, Box Culvert, Arch Bridge), descr.";
      }
      if (dataset.name === "States") {
        return "Required: code (e.g. NSW, VIC, QLD). Optional: name (full state name), descr.";
      }
      if (dataset.name === "Regions") {
        return "Required: code. Optional: name (e.g. Northern, Southern, Western, Eastern), descr.";
      }
      if (dataset.name === "StructureTypes") {
        return "Required: code. Optional: name (e.g. Concrete, Steel, Timber, Composite), descr.";
      }
      if (dataset.name === "DesignLoads") {
        return "Required: code. Optional: name (e.g. T44, M1600, SM1600), descr.";
      }
      if (dataset.name === "PostingStatuses") {
        return "Required: code (e.g. UNRESTRICTED, POSTED, CLOSED). Optional: name, descr.";
      }
      if (dataset.name === "ConditionStates") {
        return "Required: code (e.g. GOOD, FAIR, POOR, CRITICAL). Optional: name, descr.";
      }
      if (dataset.name === "PbsApprovalClasses") {
        return "Required: code (e.g. CLASS_1, CLASS_2, CLASS_3). Optional: name, descr.";
      }
      if (dataset.name === "RestrictionTypes") {
        return "Required: code (e.g. MASS, HEIGHT, WIDTH, LENGTH, SPEED). Optional: name, descr.";
      }
      if (dataset.name === "RestrictionStatuses") {
        return "Required: code (e.g. ACTIVE, INACTIVE, PENDING). Optional: name, descr.";
      }
      if (dataset.name === "VehicleClasses") {
        return "Required: code (e.g. LIGHT, HEAVY, OVERSIZE). Optional: name, descr.";
      }
      if (dataset.name === "RestrictionCategories") {
        return "Required: code (e.g. Permanent, Temporary, Seasonal). Optional: name, descr.";
      }
      if (dataset.name === "RestrictionUnits") {
        return "Required: code (e.g. tonne, m, km/h). Optional: name, descr.";
      }
      if (dataset.name === "RestrictionDirections") {
        return "Required: code (e.g. BOTH, NORTHBOUND, SOUTHBOUND, EASTBOUND, WESTBOUND). Optional: name, descr.";
      }
      return `Required and optional fields for ${dataset.label || dataset.name} are marked with * in the downloaded CSV template header row.`;
    },

    _getDatasetDescription: function (dataset) {
      if (dataset.name === "Bridges") {
        return "Upload bridge asset records. Existing bridges are matched by bridgeId and updated. New bridgeIds create new records.";
      }
      if (dataset.name === "Restrictions") {
        return "Upload restriction records. Existing restrictions are matched by restrictionRef or ID and updated.";
      }
      if (dataset.name === "AssetClasses") {
        return "Manage bridge asset class dropdown values (e.g. Beam Bridge, Arch Bridge, Culvert).";
      }
      if (dataset.name === "States") {
        return "Manage Australian state/territory dropdown values used on bridge records.";
      }
      if (dataset.name === "Regions") {
        return "Manage region dropdown values for geographic grouping of bridge assets.";
      }
      if (dataset.name === "StructureTypes") {
        return "Manage bridge structure type dropdown values (e.g. Concrete, Steel, Timber).";
      }
      if (dataset.name === "DesignLoads") {
        return "Manage design load dropdown values (e.g. T44, M1600, SM1600).";
      }
      if (dataset.name === "PostingStatuses") {
        return "Manage posting status dropdown values (UNRESTRICTED, POSTED, CLOSED).";
      }
      if (dataset.name === "ConditionStates") {
        return "Manage bridge condition state dropdown values (GOOD, FAIR, POOR, CRITICAL).";
      }
      if (dataset.name === "PbsApprovalClasses") {
        return "Manage PBS approval class dropdown values used on bridge records.";
      }
      if (dataset.name === "RestrictionTypes") {
        return "Manage restriction type dropdown values (e.g. MASS, HEIGHT, WIDTH, SPEED).";
      }
      if (dataset.name === "RestrictionStatuses") {
        return "Manage restriction status dropdown values (e.g. ACTIVE, INACTIVE, PENDING).";
      }
      if (dataset.name === "VehicleClasses") {
        return "Manage vehicle class dropdown values used on restriction records.";
      }
      if (dataset.name === "RestrictionCategories") {
        return "Manage restriction category dropdown values (e.g. Permanent, Temporary, Seasonal).";
      }
      if (dataset.name === "RestrictionUnits") {
        return "Manage restriction unit dropdown values (e.g. tonne, m, km/h).";
      }
      if (dataset.name === "RestrictionDirections") {
        return "Manage restriction direction dropdown values (e.g. BOTH, NORTHBOUND, SOUTHBOUND).";
      }
      return dataset.description;
    },

    onShowHelp: function () {
      var sHtml = [
        "<h4>Purpose</h4>",
        "<p>Mass Upload allows bulk import of bridge and restriction records (and reference data) from CSV or Excel files.</p>",
        "<h4>Upload Tab: Step by Step</h4>",
        "<ol>",
        "<li><strong>Select Dataset:</strong> choose what type of data to import (e.g. Bridges, Restrictions).</li>",
        "<li><strong>Download Template:</strong> use the template link to get the correct column headers for your chosen dataset.</li>",
        "<li><strong>Browse File:</strong> select your prepared CSV or Excel file.</li>",
        "<li><strong>Preview:</strong> review the parsed data. Rows with validation errors are highlighted: fix errors before uploading.</li>",
        "<li><strong>Start Upload:</strong> submits valid rows. The result step shows inserted vs updated counts.</li>",
        "</ol>",
        "<h4>History Tab</h4>",
        "<p>Shows a log of all previous uploads: file name, dataset, row counts, and status. Use the filter to narrow by dataset type.</p>",
        "<h4>Admin Report Tab</h4>",
        "<p>Run a date-range report across all upload activity. Useful for auditing who uploaded what and when.</p>",
        "<h4>File Format</h4>",
        "<p>CSV files should use comma delimiters. Excel files should use the first sheet. Headers must match the template exactly (case-insensitive).</p>"
      ].join("");
      var oDialog = new Dialog({
        title: "Mass Upload: Help",
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
