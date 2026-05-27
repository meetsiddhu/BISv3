sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/table/Column",
  "sap/m/Text",
  "sap/m/Input",
  "sap/m/ComboBox",
  "sap/m/DatePicker",
  "sap/m/CheckBox",
  "sap/ui/core/Item",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/m/FormattedText"
], function (
  Controller, JSONModel, Filter, FilterOperator,
  MessageBox, MessageToast,
  Column, Text, Input, ComboBox, DatePicker, CheckBox, Item,
  Dialog, Button, List, StandardListItem, FormattedText
) {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════════════
     ENTITY CONFIGURATION
     Defines endpoints, fields, filter options and column layout for each
     entity type (Bridge / Restriction).
  ═══════════════════════════════════════════════════════════════════════════ */
  const ENTITY_CONFIG = {
    BRIDGE: {
      key: "BRIDGE",
      endpoint: "api/bridges",
      saveEndpoint: "api/bridges/save",
      statusFilterLabelKey: "postingStatus",
      statusField: "postingStatus",
      statusOptionsPath: "/options/postingStatuses",
      stateField: "state",
      searchFields: ["bridgeId", "bridgeName", "route", "region", "assetOwner", "remarks"],
      fields: [
        { key: "bridgeId",          labelKey: "bridgeId",          type: "text",    editable: false, minWidth: 110 },
        { key: "bridgeName",        labelKey: "bridgeName",        type: "text",    editable: true,  minWidth: 180 },
        { key: "state",             labelKey: "state",             type: "select",  editable: true,  minWidth: 220, optionsPath: "/options/states"            },
        { key: "route",             labelKey: "route",             type: "text",    editable: true,  minWidth: 130 },
        { key: "region",            labelKey: "region",            type: "text",    editable: true,  minWidth: 160 },
        { key: "assetOwner",        labelKey: "assetOwner",        type: "text",    editable: true,  minWidth: 160 },
        { key: "structureType",     labelKey: "structureType",     type: "select",  editable: true,  minWidth: 160, optionsPath: "/options/structureTypes"     },
        { key: "yearBuilt",         labelKey: "yearBuilt",         type: "number",  editable: true,  minWidth: 100 },
        { key: "condition",         labelKey: "condition",         type: "select",  editable: true,  minWidth: 120, optionsPath: "/options/conditions"         },
        { key: "conditionRating",   labelKey: "conditionRating",   type: "number",  editable: true,  minWidth: 110 },
        { key: "postingStatus",     labelKey: "postingStatus",     type: "select",  editable: true,  minWidth: 170, optionsPath: "/options/postingStatuses"    },
        { key: "lastInspectionDate",labelKey: "lastInspectionDate",type: "date",    editable: true,  minWidth: 140 },
        { key: "pbsApprovalClass",  labelKey: "pbsApprovalClass",  type: "select",  editable: true,  minWidth: 155, optionsPath: "/options/pbsApprovalClasses" },
        { key: "nhvrAssessed",      labelKey: "nhvrAssessed",      type: "boolean", editable: true,  minWidth: 100 },
        { key: "freightRoute",      labelKey: "freightRoute",      type: "boolean", editable: true,  minWidth: 100 },
        { key: "overMassRoute",     labelKey: "overMassRoute",     type: "boolean", editable: true,  minWidth: 100 },
        { key: "hmlApproved",       labelKey: "hmlApproved",       type: "boolean", editable: true,  minWidth: 100 },
        { key: "bDoubleApproved",   labelKey: "bDoubleApproved",   type: "boolean", editable: true,  minWidth: 110 },
        { key: "remarks",           labelKey: "remarks",           type: "text",    editable: true,  minWidth: 200 }
      ]
    },
    RESTRICTION: {
      key: "RESTRICTION",
      endpoint: "api/restrictions",
      saveEndpoint: "api/restrictions/save",
      statusFilterLabelKey: "restrictionStatus",
      statusField: "restrictionStatus",
      statusOptionsPath: "/options/restrictionStatuses",
      stateField: null,
      searchFields: ["restrictionRef", "bridgeRef", "restrictionType", "approvedBy", "remarks"],
      fields: [
        { key: "restrictionRef",        labelKey: "restrictionRef",        type: "text",    editable: false, minWidth: 140 },
        { key: "bridgeRef",             labelKey: "bridgeRef",             type: "text",    editable: false, minWidth: 120 },
        { key: "restrictionCategory",   labelKey: "restrictionCategory",   type: "select",  editable: true,  minWidth: 160, optionsPath: "/options/restrictionCategories" },
        { key: "restrictionType",       labelKey: "restrictionType",       type: "select",  editable: true,  minWidth: 170, optionsPath: "/options/restrictionTypes"      },
        { key: "restrictionValue",      labelKey: "restrictionValue",      type: "text",    editable: true,  minWidth: 120 },
        { key: "restrictionUnit",       labelKey: "restrictionUnit",       type: "select",  editable: true,  minWidth: 110, optionsPath: "/options/restrictionUnits"      },
        { key: "restrictionStatus",     labelKey: "restrictionStatus",     type: "select",  editable: true,  minWidth: 155, optionsPath: "/options/restrictionStatuses"   },
        { key: "appliesToVehicleClass", labelKey: "appliesToVehicleClass", type: "select",  editable: true,  minWidth: 180, optionsPath: "/options/vehicleClasses"        },
        { key: "grossMassLimit",        labelKey: "grossMassLimit",        type: "decimal", editable: true,  minWidth: 110 },
        { key: "axleMassLimit",         labelKey: "axleMassLimit",         type: "decimal", editable: true,  minWidth: 110 },
        { key: "heightLimit",           labelKey: "heightLimit",           type: "decimal", editable: true,  minWidth:  95 },
        { key: "widthLimit",            labelKey: "widthLimit",            type: "decimal", editable: true,  minWidth:  95 },
        { key: "lengthLimit",           labelKey: "lengthLimit",           type: "decimal", editable: true,  minWidth:  95 },
        { key: "speedLimit",            labelKey: "speedLimit",            type: "number",  editable: true,  minWidth:  95 },
        { key: "permitRequired",        labelKey: "permitRequired",        type: "boolean", editable: true,  minWidth: 105 },
        { key: "escortRequired",        labelKey: "escortRequired",        type: "boolean", editable: true,  minWidth: 105 },
        { key: "temporary",             labelKey: "temporary",             type: "boolean", editable: true,  minWidth:  95 },
        { key: "active",                labelKey: "active",                type: "boolean", editable: true,  minWidth:  80 },
        { key: "effectiveFrom",         labelKey: "effectiveFrom",         type: "date",    editable: true,  minWidth: 130 },
        { key: "effectiveTo",           labelKey: "effectiveTo",           type: "date",    editable: true,  minWidth: 130 },
        { key: "approvedBy",            labelKey: "approvedBy",            type: "text",    editable: true,  minWidth: 140 },
        { key: "direction",             labelKey: "direction",             type: "select",  editable: true,  minWidth: 115, optionsPath: "/options/restrictionDirections" },
        { key: "remarks",               labelKey: "remarks",               type: "text",    editable: true,  minWidth: 180 }
      ]
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     CONTROLLER
  ═══════════════════════════════════════════════════════════════════════════ */
  return Controller.extend("BridgeManagement.massedit.controller.MassEdit", {

    /* ─── Lifecycle ─────────────────────────────────────────────────────── */

    onInit: function () {

      // _baselineRows: deep-clone of server data used for dirty comparison + discard
      this._baselineRows  = [];
      this._lookupsLoaded = false;
      this._loading       = false;
      this._loadGeneration = 0;   // incremented on each load; stale async loads abort
      this._filterTimer   = null; // debounce handle for search liveChange
      this._lastFilterKey = null; // skip binding.filter() when criteria unchanged

      this.getView().setModel(new JSONModel({
        busy:              false,
        lastRefreshedLabel: "",
        entityKey:         "BRIDGE",
        allItems:          [],
        dirtyCount:        0,
        dirtyMessage:      "",
        selectedCount:     0,
        summaryText:       "",
        tableTitle:        "",
        showStateFilter:   true,
        showStatusFilter:  true,
        statusFilterLabel: "",
        statusFilterOptions: [],
        bulkVisible:       false,
        bulkButtonText:    "",
        applyButtonText:   "",
        bulkFieldKey:      "",
        bulkInputType:     "text",
        filters: { search: "", state: "", status: "", onlyDirty: false },
        options: {
          states: [], conditions: [], postingStatuses: [],
          structureTypes: [], pbsApprovalClasses: [],
          restrictionCategories: [], restrictionTypes: [], restrictionStatuses: [],
          restrictionUnits: [], restrictionDirections: [], vehicleClasses: [],
          bulkFields: [], bulkFieldOptions: []
        }
      }), "view");

      this._syncLabels();
      this._buildTable();
      this._loadEntityData();
    },

    onExit: function () {
      clearTimeout(this._filterTimer);
    },

    /* ─── Toolbar actions ───────────────────────────────────────────────── */

    onRefresh: function () {
      // Lookups are static: don't reset _lookupsLoaded (avoids re-binding 100+ ComboBox items)
      this._loadEntityData();
    },

    onSave: async function () {
      const vm    = this._vm();
      const dirty = (vm.getProperty("/allItems") || []).filter(function (bridgeRow) { return bridgeRow._dirty; });
      if (!dirty.length) { return; }

      vm.setProperty("/busy", true);
      try {
        const payload = dirty.map(this._toPayload.bind(this));
        const result  = await this._fetchJson(this._config().saveEndpoint, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body:    JSON.stringify({ updates: payload })
        });
        MessageToast.show(this._t("saveSuccess", [result.updated || payload.length]));
        await this._loadEntityData();
      } catch (err) {
        MessageBox.error(err.message || this._t("saveError"));
      } finally {
        vm.setProperty("/busy", false);
      }
    },

    onDiscard: function () {
      if (!this._vm().getProperty("/dirtyCount")) { return; }
      MessageBox.confirm(this._t("discardConfirm"), {
        title:           this._t("discardTitle"),
        actions:         [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.OK,
        onClose: function (action) {
          if (action !== MessageBox.Action.OK) { return; }
          this._vm().setProperty("/allItems", this._clone(this._baselineRows));
          this._lastFilterKey = null;
          this._applyFilters();
        }.bind(this)
      });
    },

    /* ─── Entity / filter controls ──────────────────────────────────────── */

    onEntityTypeChange: function (oEvent) {
      const newKey = oEvent.getParameter("item").getKey();
      const vm     = this._vm();
      // Guard: with OneWay binding the model still holds the OLD key here, so this
      // check is safety only: it prevents double-firing in edge cases.
      if (vm.getProperty("/entityKey") === newKey) { return; }

      // Bump generation so any in-flight load for the previous entity aborts
      this._loadGeneration++;

      vm.setProperty("/entityKey",   newKey);
      vm.setProperty("/allItems",    []);
      vm.setProperty("/dirtyCount",  0);
      vm.setProperty("/selectedCount", 0);
      vm.setProperty("/bulkVisible", false);
      vm.setProperty("/bulkFieldKey",   "");
      vm.setProperty("/bulkInputType",  "text");
      vm.setProperty("/options/bulkFieldOptions", []);
      vm.setProperty("/filters", { search: "", state: "", status: "", onlyDirty: false });
      this._clearBulkInput();
      this._baselineRows  = [];
      this._lastFilterKey = null;
      this._syncLabels();

      const table   = this.byId("massEditTable");
      const binding = table && table.getBinding("rows");
      if (binding) { binding.filter([]); }

      this._buildTable();
      this._loadEntityData();
    },

    onFilterChange: function () {
      if (this._loading) { return; }
      // 150 ms debounce: prevents binding.filter() on every keystroke
      clearTimeout(this._filterTimer);
      this._filterTimer = setTimeout(this._applyFilters.bind(this), 150);
    },

    onTableSelectionChange: function () {
      const selectedBridgeCount = this.byId("massEditTable").getSelectedIndices().length;
      this._vm().setProperty("/selectedCount",  selectedBridgeCount);
      this._vm().setProperty("/applyButtonText", this._t("applyToSelected", [selectedBridgeCount]));
    },

    /* ─── Bulk apply ─────────────────────────────────────────────────────── */

    onToggleBulkApply: function () {
      const vm      = this._vm();
      const visible = !vm.getProperty("/bulkVisible");
      vm.setProperty("/bulkVisible",    visible);
      vm.setProperty("/bulkButtonText", this._t(visible ? "hideBulkApply" : "bulkApply"));
      if (!visible) {
        vm.setProperty("/bulkFieldKey",  "");
        vm.setProperty("/bulkInputType", "text");
        vm.setProperty("/options/bulkFieldOptions", []);
        this._clearBulkInput();
      }
    },

    onBulkFieldChange: function (oEvent) {
      const field = this._config().fields.find(function (bulkEditableField) {
        return bulkEditableField.key === oEvent.getSource().getSelectedKey();
      });
      const vm = this._vm();
      vm.setProperty("/bulkInputType", field ? field.type : "text");
      vm.setProperty("/options/bulkFieldOptions",
        field && field.optionsPath ? (vm.getProperty(field.optionsPath) || []) : []);
      this._clearBulkInput();
    },

    onBulkApply: function () {
      const vm       = this._vm();
      const fieldKey = vm.getProperty("/bulkFieldKey");
      const field    = this._config().fields.find(function (bulkEditableField) { return bulkEditableField.key === fieldKey; });
      if (!field) { MessageToast.show(this._t("bulkNoField")); return; }

      const table    = this.byId("massEditTable");
      const selected = table.getSelectedIndices();
      if (!selected.length) { MessageToast.show(this._t("bulkNoRows")); return; }

      const value = this._readBulkValue(field);
      selected.forEach(function (idx) {
        const ctx = table.getContextByIndex(idx);
        if (ctx) { this._writeField(ctx.getPath(), field, value); }
      }.bind(this));

      table.clearSelection();
      vm.setProperty("/selectedCount",  0);
      vm.setProperty("/applyButtonText", this._t("applyToSelected", [0]));
      this._updateDirtyStats();
      MessageToast.show(this._t("bulkApplied", [selected.length]));
    },

    /* ─── Data loading ───────────────────────────────────────────────────── */

    _loadEntityData: async function () {
      this._loadGeneration++;
      const gen    = this._loadGeneration;
      this._loading = true;

      const vm     = this._vm();
      const config = this._config(); // snapshot BEFORE any await

      vm.setProperty("/busy", true);
      try {
        if (!this._lookupsLoaded) {
          const lookups = await this._fetchJson("api/lookups", { headers: { Accept: "application/json" } });
          if (gen !== this._loadGeneration) { return; }
          this._applyLookups(lookups);
          this._lookupsLoaded = true;
        }

        const data = await this._fetchJson(config.endpoint, { headers: { Accept: "application/json" } });
        if (gen !== this._loadGeneration) { return; }

        const payloadKey = config.key === "BRIDGE" ? "bridges" : "restrictions";
        const rows = (data[payloadKey] || []).map(function (businessRecord) {
          return Object.assign({}, businessRecord, { _dirty: false });
        });
        this._baselineRows = this._clone(rows);

        vm.setProperty("/allItems", rows);
        this._lastFilterKey = null;
        this._applyFilters();
        const now = new Date();
        vm.setProperty("/lastRefreshedLabel", now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      } catch (err) {
        if (gen !== this._loadGeneration) { return; }
        MessageBox.error(err.message || this._t("loadError"));
      } finally {
        if (gen === this._loadGeneration) {
          this._loading = false;
          vm.setProperty("/busy", false);
        }
      }
    },

    /* ─── Table building ─────────────────────────────────────────────────── */

    _buildTable: function () {
      const table  = this.byId("massEditTable");
      const config = this._config();
      table.destroyColumns();

      config.fields.forEach(function (field) {
        table.addColumn(new Column({
          minWidth:       field.minWidth,
          label:          new Text({ text: this._t(field.labelKey), wrapping: true }),
          template:       this._createCell(field),
          sortProperty:   field.key,
          filterProperty: field.key,
          autoResizable:  true
        }));
      }.bind(this));

      this._applyColumnVisibility();
      // Force a synchronous DOM update so the DynamicPage measures the new
      // column count immediately, avoiding a transient zero-height layout.
      sap.ui.getCore().applyChanges();
    },

    _createCell: function (field) {
      // Read-only columns
      if (!field.editable) {
        return new Text({ text: "{view>" + field.key + "}", wrapping: true });
      }

      // Select: ComboBox instead of Select:
      //   ComboBox renders as <input>, so on virtual-table row recycling it
      //   only patches input.value (no DOM replacement → zero flicker).
      //   sap.m.Select re-renders its entire <button> HTML on every context
      //   swap, causing visible flicker across 100+ rows.
      if (field.type === "select") {
        return new ComboBox({
          width:       "100%",
          selectedKey: { path: "view>" + field.key, mode: "OneWay" },
          items: {
            path:             "view>" + field.optionsPath,
            template:         new Item({ key: "{view>key}", text: "{view>text}" }),
            templateShareable: false
          },
          // selectionChange fires only when user picks a valid item: not on
          // programmatic updates (OneWay binding), so no suppress flag needed.
          selectionChange: this._onValueChange.bind(this, field)
        });
      }

      if (field.type === "boolean") {
        return new CheckBox({
          selected: { path: "view>" + field.key, mode: "OneWay" },
          select:   this._onValueChange.bind(this, field)
        });
      }

      if (field.type === "date") {
        return new DatePicker({
          width:         "100%",
          value:         { path: "view>" + field.key, mode: "OneWay" },
          valueFormat:   "yyyy-MM-dd",
          displayFormat: "dd/MM/yyyy",
          change:        this._onValueChange.bind(this, field)
        });
      }

      // text / number / decimal
      return new Input({
        width:  "100%",
        type:   (field.type === "number" || field.type === "decimal") ? "Number" : "Text",
        value:  { path: "view>" + field.key, mode: "OneWay" },
        change: this._onValueChange.bind(this, field)
      });
    },

    /* ─── Inline cell editing ────────────────────────────────────────────── */

    _onValueChange: function (field, oEvent) {
      const src = oEvent.getSource();
      const ctx = src.getBindingContext("view");
      if (!ctx) { return; }
      this._writeField(ctx.getPath(), field, this._extractValue(field, src));
    },

    _writeField: function (rowPath, field, rawValue) {
      const vm    = this._vm();
      const value = this._normalize(field.type, rawValue);
      vm.setProperty(rowPath + "/" + field.key, value);
      this._markDirty(rowPath);
    },

    _markDirty: function (rowPath) {
      const vm       = this._vm();
      const row      = vm.getProperty(rowPath);
      const baseline = this._baselineRows.find(function (baselineRecord) {
        return String(baselineRecord.ID) === String(row.ID);
      });
      if (!baseline) { return; }

      const dirty = this._config().fields.some(function (editableField) {
        return String(row[editableField.key]      != null ? row[editableField.key]      : "") !==
               String(baseline[editableField.key] != null ? baseline[editableField.key] : "");
      });
      vm.setProperty(rowPath + "/_dirty", dirty);
      this._updateDirtyStats();
    },

    _updateDirtyStats: function () {
      const vm   = this._vm();
      const all  = vm.getProperty("/allItems") || [];
      const dirtyBridgeCount = all.filter(function (bridgeRow) { return bridgeRow._dirty; }).length;
      vm.setProperty("/dirtyCount",   dirtyBridgeCount);
      vm.setProperty("/dirtyMessage", this._t("dirtyRows", [dirtyBridgeCount]));
    },

    _extractValue: function (field, ctrl) {
      switch (field.type) {
        case "select":  return ctrl.getSelectedKey ? ctrl.getSelectedKey() : ctrl.getValue();
        case "boolean": return ctrl.getSelected();
        case "date":    return ctrl.getValue();
        default:        return ctrl.getValue();
      }
    },

    _normalize: function (type, val) {
      if (val === "" || val == null) { return null; }
      if (type === "number")  { const bridgeInteger = parseInt(val, 10);  return isFinite(bridgeInteger) ? bridgeInteger : null; }
      if (type === "decimal") { const bridgeDecimal = parseFloat(val);    return isFinite(bridgeDecimal) ? bridgeDecimal : null; }
      if (type === "boolean") { return Boolean(val); }
      return val;
    },

    /* ─── Filtering ──────────────────────────────────────────────────────── */

    _applyFilters: function () {
      const vm      = this._vm();
      const config  = this._config();
      const filters = vm.getProperty("/filters");
      const search  = (filters.search || "").trim().toLowerCase();

      // Cache key: skip binding.filter() when nothing changed
      const key = [config.key, search, filters.state || "", filters.status || "", String(!!filters.onlyDirty)].join("|");
      const skipFilter = (key === this._lastFilterKey);
      this._lastFilterKey = key;

      if (!skipFilter) {
        const list = [];
        if (filters.onlyDirty) {
          list.push(new Filter("_dirty", FilterOperator.EQ, true));
        }
        if (config.stateField && filters.state) {
          list.push(new Filter(config.stateField, FilterOperator.EQ, filters.state));
        }
        if (config.statusField && filters.status) {
          list.push(new Filter(config.statusField, FilterOperator.EQ, filters.status));
        }
        if (search) {
          list.push(new Filter({
            filters: config.searchFields.map(function (searchField) {
              return new Filter({ path: searchField, test: function (cellValue) { return String(cellValue || "").toLowerCase().includes(search); } });
            }),
            and: false
          }));
        }

        const table   = this.byId("massEditTable");
        const binding = table && table.getBinding("rows");
        if (binding) {
          binding.filter(list.length ? [new Filter({ filters: list, and: true })] : []);
        }
      }

      this._updateDirtyStats();
      this._updateSummary(config, filters, search);
    },

    _updateSummary: function (config, filters, search) {
      const all     = this._vm().getProperty("/allItems") || [];
      const visible = all.filter(function (row) {
        if (filters.onlyDirty && !row._dirty) { return false; }
        if (config.stateField  && filters.state  && row[config.stateField]  !== filters.state)  { return false; }
        if (config.statusField && filters.status && row[config.statusField] !== filters.status) { return false; }
        if (!search) { return true; }
        return config.searchFields.some(function (sf) {
          return String(row[sf] || "").toLowerCase().includes(search);
        });
      }).length;
      this._vm().setProperty("/summaryText", this._t("records", [visible]));
    },

    /* ─── Lookup / label helpers ─────────────────────────────────────────── */

    _applyLookups: function (lookups) {
      const vm = this._vm();
      Object.keys(lookups || {}).forEach(function (lookupName) {
        vm.setProperty("/options/" + lookupName, [{ key: "", text: "-" }].concat(lookups[lookupName] || []));
      });
    },

    _syncLabels: function () {
      const vm     = this._vm();
      const config = this._config();
      vm.setProperty("/tableTitle",        this._t(config.key === "BRIDGE" ? "bridges" : "restrictions"));
      vm.setProperty("/showStateFilter",   !!config.stateField);
      vm.setProperty("/showStatusFilter",  !!config.statusField);
      vm.setProperty("/statusFilterLabel", this._t(config.statusFilterLabelKey));
      vm.setProperty("/statusFilterOptions", vm.getProperty(config.statusOptionsPath) || []);
      vm.setProperty("/bulkButtonText",    this._t("bulkApply"));
      vm.setProperty("/applyButtonText",   this._t("applyToSelected", [0]));
      vm.setProperty("/options/bulkFields", config.fields
        .filter(function (editableField) { return editableField.editable; })
        .map(function (editableField) { return { key: editableField.key, text: this._t(editableField.labelKey) }; }.bind(this)));
    },

    /* ─── Bulk input helpers ─────────────────────────────────────────────── */

    _readBulkValue: function (field) {
      if (field.type === "select")  { return this.byId("bulkValueSelect").getSelectedKey(); }
      if (field.type === "boolean") { return this.byId("bulkValueBool").getSelected(); }
      if (field.type === "date")    { return this.byId("bulkValueDate").getValue(); }
      return this.byId("bulkValueInput").getValue();
    },

    _clearBulkInput: function () {
      var inp = this.byId("bulkValueInput");
      var sel = this.byId("bulkValueSelect");
      var dt  = this.byId("bulkValueDate");
      var chk = this.byId("bulkValueBool");
      if (inp) { inp.setValue(""); }
      if (sel) { sel.setSelectedKey(""); }
      if (dt)  { dt.setValue(""); }
      if (chk) { chk.setSelected(false); }
    },

    /* ─── Payload / network ──────────────────────────────────────────────── */

    _toPayload: function (row) {
      const bridgePatch = { ID: row.ID };
      // Sanitize values before sending to the backend:
      //   • date fields: only pass valid YYYY-MM-DD strings; send null for anything else
      //     (CAP can store Julian-epoch sentinels like "-4713-11-25" for NULLs)
      //   • empty strings → null
      this._config().fields.forEach(function (bridgeField) {
        if (!bridgeField.editable) { return; }
        var bridgeCellValue = row[bridgeField.key];
        if (bridgeField.type === "date") {
          bridgePatch[bridgeField.key] = (typeof bridgeCellValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bridgeCellValue)) ? bridgeCellValue : null;
        } else {
          bridgePatch[bridgeField.key] = (bridgeCellValue === "") ? null : bridgeCellValue;
        }
      });
      return bridgePatch;
    },

    _fetchJson: async function (path, options) {
      const url = "/mass-edit/" + String(path || "").replace(/^\/+/, "");
      let res, data;
      try {
        res  = await fetch(url, options || {});
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await res.text();
          throw new Error(text.trim().startsWith("<") ? this._t("loadError") : (text.slice(0, 120) || this._t("loadError")));
        }
        data = await res.json();
      } catch (err) {
        throw err instanceof TypeError ? new Error(this._t("loadError")) : err;
      }
      if (!res.ok) {
        throw new Error((data && data.error && data.error.message) || this._t("loadError"));
      }
      return data;
    },

    /* ─── Micro helpers ──────────────────────────────────────────────────── */

    _clone:  function (rows)      { return JSON.parse(JSON.stringify(rows || [])); },

    /* ─── Column selection ───────────────────────────────────────────────── */

    onColumnSelect: function () {
      const config    = this._config();
      const entityKey = this._vm().getProperty("/entityKey") || "BRIDGE";
      const stored    = (this._colVisibility || {})[entityKey] || {};

      const oList = new List({ mode: "MultiSelect", includeItemInSelection: true });
      config.fields.forEach(function (field) {
        const oItem = new StandardListItem({ title: this._t(field.labelKey) });
        oItem.data("fieldKey", field.key);
        if (stored[field.key] !== false) oItem.setSelected(true);
        oList.addItem(oItem);
      }.bind(this));

      const oDialog = new Dialog({
        title: "Select Columns",
        contentWidth: "320px",
        content: [oList],
        beginButton: new Button({
          text: "OK",
          type: "Emphasized",
          press: function () {
            const selectedKeys = new Set(oList.getSelectedItems().map(function (item) { return item.data("fieldKey"); }));
            this._colVisibility = this._colVisibility || {};
            this._colVisibility[entityKey] = {};
            config.fields.forEach(function (field) {
              this._colVisibility[entityKey][field.key] = selectedKeys.has(field.key);
            }.bind(this));
            this._applyColumnVisibility();
            oDialog.close();
          }.bind(this)
        }),
        endButton: new Button({ text: "Cancel", press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.addStyleClass("sapUiContentPadding");
      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    _applyColumnVisibility: function () {
      const config    = this._config();
      const entityKey = this._vm().getProperty("/entityKey") || "BRIDGE";
      const stored    = (this._colVisibility || {})[entityKey] || {};
      this.byId("massEditTable").getColumns().forEach(function (col, i) {
        const field = config.fields[i];
        if (field) col.setVisible(stored[field.key] !== false);
      });
    },

    onShowHelp: function () {
      var sHtml = [
        "<h4>Purpose</h4>",
        "<p>Mass Edit lets you update multiple bridge or restriction records in a single session, then save all changes in one batch.</p>",
        "<h4>Selecting Entity Type</h4>",
        "<p>Use the <strong>Bridges / Restrictions</strong> toggle to switch between entity types. Unsaved changes will be discarded when switching.</p>",
        "<h4>Filtering Records</h4>",
        "<ul>",
        "<li><strong>Search:</strong> filter by name or ID in real time.</li>",
        "<li><strong>State:</strong> filter by state/territory (Bridges only).</li>",
        "<li><strong>Status:</strong> filter by posting status.</li>",
        "<li><strong>Show Changed Only:</strong> toggle to see only rows edited in this session.</li>",
        "</ul>",
        "<h4>Editing Records</h4>",
        "<p>Click any editable cell in the table to change its value. Edited rows are highlighted in amber.</p>",
        "<h4>Bulk Apply</h4>",
        "<p>Select rows using the row checkboxes, choose a field and value in the <strong>Bulk Apply</strong> panel, then click Apply to set that value on all selected rows at once.</p>",
        "<h4>Saving</h4>",
        "<p>Click <strong>Save Changes</strong> to persist all edits. Use <strong>Discard</strong> to revert all unsaved edits.</p>"
      ].join("");
      var oDialog = new Dialog({
        title: "Mass Edit: Help",
        contentWidth: "480px",
        content: [new FormattedText({ htmlText: sHtml })],
        endButton: new Button({ text: "Close", press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.addStyleClass("sapUiContentPadding");
      oDialog.open();
    },

    _config: function ()          { return ENTITY_CONFIG[this._vm().getProperty("/entityKey") || "BRIDGE"]; },
    _t:      function (key, args) { return this.getView().getModel("i18n").getResourceBundle().getText(key, args); },
    _vm:     function ()          { return this.getView().getModel("view"); }
  });
});
