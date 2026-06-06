sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Input",
  "sap/m/Select",
  "sap/m/Button",
  "sap/m/VBox",
  "sap/m/Label",
  "sap/m/Text",
  "sap/m/FormattedText",
  "sap/m/SegmentedButtonItem",
  "sap/ui/core/Item",
  "../service/AttributeService",
  "../model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast, Dialog,
             Input, Select, Button, VBox, Label, Text, FormattedText, SegmentedButtonItem, Item,
             AttributeService, formatter) {
  "use strict";

  return Controller.extend("BridgeManagement.bmsadmin.controller.AttributeConfig", {

    // Exposed so the view's formatter bindings (.fmt.xxx) resolve.
    fmt: formatter,

    onInit: function () {
      var oComp = this.getOwnerComponent();
      var adminBase = oComp.getManifestEntry("/sap.app/dataSources/AdminService/uri");
      var attrBase  = oComp.getManifestEntry("/sap.app/dataSources/AttributesService/uri");
      this._svc = AttributeService(adminBase, attrBase);

      // The appConfig JSONModel wraps its payload under a "data" key (manifest
      // settings.data), so values live at /data/<key>. Fall back to the unwrapped
      // path and then to sensible defaults to be robust to either structure.
      var oAppCfg = oComp.getModel("appConfig");
      var cfg = function (key, fallback) {
        var v = oAppCfg && (oAppCfg.getProperty("/data/" + key) || oAppCfg.getProperty("/" + key));
        return (Array.isArray(v) && v.length) ? v : fallback;
      };
      this._dataTypes   = cfg("attributeDataTypes",   ["Text", "Integer", "Decimal", "Date", "Boolean", "SingleSelect", "MultiSelect"]);
      this._objectTypes = cfg("attributeObjectTypes", ["bridge", "restriction"]);
      this._statusOpts  = cfg("attributeStatuses",    ["Active", "Inactive"]);

      // Data-driven object-type selector (extensible: add a type in appConfig → appears here).
      var oSel = this.byId("objectTypeSelector");
      this._objectTypes.forEach(function (ot) {
        oSel.addItem(new SegmentedButtonItem({ key: ot, text: formatter.objectTypeLabel(ot) }));
      });
      oSel.setSelectedKey(this._objectTypes[0]);
      this._objectType = this._objectTypes[0];

      this._selectedGroup = null;
      this._selectedAttr = null;
      this._loadGroups();
    },

    _busy: function (b) { this.byId("mainPage").setBusy(b); },

    // ── Groups ───────────────────────────────────────────────────────────
    _loadGroups: function () {
      var self = this;
      self._busy(true);
      self._svc.listGroups(self._objectType).then(function (groups) {
        self.byId("groupList").setModel(new JSONModel(groups));
        self.byId("groupEmpty").setVisible(groups.length === 0);
        self.byId("groupList").setVisible(groups.length > 0);
        self.byId("groupSearch").setValue("");
        self._selectedGroup = null;
        self.byId("defsPanel").setVisible(false);
        self.byId("attrDetailPanel").setVisible(false);
      }).catch(function (e) {
        MessageBox.error("Failed to load groups: " + e.message);
      }).finally(function () { self._busy(false); });
    },

    onGroupSearch: function (oEvent) {
      var q = oEvent.getParameter("newValue");
      var oBinding = this.byId("groupList").getBinding("items");
      oBinding.filter(q ? [new Filter([
        new Filter("name", FilterOperator.Contains, q),
        new Filter("internalKey", FilterOperator.Contains, q)
      ], false)] : []);
    },

    onGroupSelect: function (oEvent) {
      this._selectedGroup = oEvent.getParameter("listItem").getBindingContext().getObject();
      this.byId("defsTitle").setText(this._selectedGroup.name);
      this.byId("defsPanel").setVisible(true);
      this.byId("attrDetailPanel").setVisible(false);
      this._loadAttributes(this._selectedGroup.ID);
    },

    // ── Attributes ───────────────────────────────────────────────────────
    _loadAttributes: function (groupId) {
      var self = this;
      self._busy(true);
      self._svc.listAttributes(groupId).then(function (attrs) {
        self.byId("attrList").setModel(new JSONModel(attrs));
        self.byId("attrSearch").setValue("");
        self._selectedAttr = null;
        self.byId("attrDetailPanel").setVisible(false);
      }).catch(function (e) {
        MessageBox.error("Failed to load attributes: " + e.message);
      }).finally(function () { self._busy(false); });
    },

    onAttrSearch: function (oEvent) {
      var q = oEvent.getParameter("newValue");
      this.byId("attrList").getBinding("items").filter(q ? [new Filter("name", FilterOperator.Contains, q)] : []);
    },

    onAttrSelect: function (oEvent) {
      this._selectedAttr = oEvent.getParameter("listItem").getBindingContext().getObject();
      this._loadAttrDetail(this._selectedAttr.ID);
    },

    _loadAttrDetail: function (attrId) {
      var self = this;
      self._busy(true);
      Promise.all([
        self._svc.getAttribute(attrId),
        self._svc.listAllowedValues(attrId),
        self._svc.listConfigs(attrId)
      ]).then(function (res) {
        var attr = res[0], allowed = res[1], configs = res[2];

        self.byId("detailHeading").setText(attr.name || "Attribute Detail");
        self.byId("detailStatus").setText(attr.status === "Active" ? "Active" : "Inactive");
        self.byId("detailStatus").setState(formatter.statusState(attr.status));
        self.byId("detailStatus").setIcon(formatter.dataTypeIcon(attr.dataType));
        self.byId("detailName").setText(attr.name || "–");
        self.byId("detailKey").setText(attr.internalKey || "–");
        self.byId("detailType").setText(attr.dataType || "–");
        self.byId("detailUnit").setText(attr.unit || "–");
        self.byId("detailHelp").setText(attr.helpText || "–");
        self.byId("detailRange").setText(
          (attr.minValue != null ? attr.minValue : "–") + "  /  " + (attr.maxValue != null ? attr.maxValue : "–")
        );

        // Object-type config: existing rows merged with synthetic rows for unconfigured types.
        var byType = {};
        configs.forEach(function (c) { byType[c.objectType] = c; });
        var rows = self._objectTypes.map(function (ot) {
          return byType[ot] || { objectType: ot, enabled: false, required: false, displayOrder: null, ID: null, attribute_ID: attrId };
        });
        self.byId("configTable").setModel(new JSONModel(rows));

        // Allowed values — only meaningful for select types.
        var isSelect = formatter.isSelectType(attr.dataType);
        self.byId("allowedValuesTable").setModel(new JSONModel(allowed));
        self.byId("allowedValuesHint").setVisible(!isSelect);
        self.byId("allowedValuesToolbar").setVisible(isSelect);
        self.byId("allowedValuesTable").setVisible(isSelect);

        self.byId("attrDetailPanel").setVisible(true);
      }).catch(function (e) {
        MessageBox.error("Failed to load attribute detail: " + e.message);
      }).finally(function () { self._busy(false); });
    },

    // ── Object type & toolbar ──────────────────────────────────────────────
    onObjectTypeChange: function (oEvent) {
      this._objectType = oEvent.getParameter("item").getKey();
      this._loadGroups();
    },

    onExportTemplate: function () {
      window.open(this._svc.templateUrl(this._objectType), "_blank");
    },

    // Mass create / maintain attribute values: upload a filled template.
    onImportValues: function () {
      var self = this;
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.csv";
      input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file) { return; }
        var reader = new FileReader();
        reader.onload = function () {
          var base64 = String(reader.result).split(",")[1] || "";
          self._busy(true);
          self._svc.importValues(self._objectType, file.name, base64, "skip")
            .then(function (result) { self._busy(false); self._showImportResult(result); })
            .catch(function (e) { self._busy(false); MessageBox.error("Import failed: " + e.message); });
        };
        reader.onerror = function () { MessageBox.error("Could not read the selected file."); };
        reader.readAsDataURL(file);
      };
      input.click();
    },

    _showImportResult: function (r) {
      r = r || {};
      // Response shape: { summary:{created,updated,skipped,errors}, rows:[{row,ref,status,message}] }
      var s = r.summary || r;
      var created = s.created || 0, updated = s.updated || 0, skipped = s.skipped || 0;
      var issues = (r.rows || []).filter(function (row) { return row && row.status && row.status !== "OK"; });
      var msg = "Created: " + created + "\nUpdated: " + updated + "\nSkipped: " + skipped;
      if (issues.length) {
        msg += "\n\nIssues (" + issues.length + "):\n" + issues.slice(0, 10).map(function (e) {
          return "• Row " + e.row + (e.ref ? " (" + e.ref + ")" : "") + ": " + (e.message || e.status);
        }).join("\n");
        if (issues.length > 10) { msg += "\n… and " + (issues.length - 10) + " more."; }
        MessageBox.warning(msg, { title: "Import completed with issues" });
      } else {
        MessageBox.success(msg, { title: "Import complete" });
      }
    },

    // ── Group CRUD ─────────────────────────────────────────────────────────
    onAddGroup: function () {
      var self = this;
      self._showFormDialog("Add Attribute Group", [
        { label: "Group Name", id: "name", required: true },
        { label: "Internal Key", id: "key", required: true, help: "Lowercase, underscores. Cannot change once values exist." },
        { label: "Display Order", id: "order", type: "number" }
      ], function (v) {
        self._busy(true);
        self._svc.createGroup({ name: v.name, internalKey: v.key, objectType: self._objectType, displayOrder: parseInt(v.order || "0", 10), status: "Active" })
          .then(function () { MessageToast.show("Group created."); self._loadGroups(); })
          .catch(function (e) { self._busy(false); MessageBox.error("Failed to create group: " + e.message); });
      });
    },

    onEditGroup: function () {
      if (!this._selectedGroup) { return; }
      var self = this, g = this._selectedGroup;
      self._showFormDialog("Edit Group: " + g.name, [
        { label: "Group Name", id: "name", value: g.name, required: true },
        { label: "Display Order", id: "order", value: String(g.displayOrder || 0), type: "number" },
        { label: "Status", id: "status", type: "select", options: self._statusOpts, value: g.status }
      ], function (v) {
        self._busy(true);
        self._svc.updateGroup(g.ID, { name: v.name, displayOrder: parseInt(v.order || "0", 10), status: v.status })
          .then(function () { MessageToast.show("Group updated."); self._loadGroups(); })
          .catch(function (e) { self._busy(false); MessageBox.error("Failed to update group: " + e.message); });
      });
    },

    onDeleteGroup: function () {
      if (!this._selectedGroup) { return; }
      var self = this, g = this._selectedGroup;
      MessageBox.confirm("Delete group \"" + g.name + "\"? Its attribute definitions will also be removed.", {
        title: "Delete Group",
        onClose: function (a) {
          if (a !== "OK") { return; }
          self._busy(true);
          self._svc.deleteGroup(g.ID)
            .then(function () { MessageToast.show("Group deleted."); self._loadGroups(); })
            .catch(function (e) { self._busy(false); MessageBox.error("Failed to delete group: " + e.message); });
        }
      });
    },

    // ── Attribute CRUD ───────────────────────────────────────────────────
    onAddAttribute: function () {
      if (!this._selectedGroup) { return; }
      var self = this;
      self._showFormDialog("Add Attribute", [
        { label: "Attribute Name", id: "name", required: true },
        { label: "Internal Key", id: "key", required: true, help: "Lowercase, underscores. Cannot change once values exist." },
        { label: "Data Type", id: "type", type: "select", options: self._dataTypes, required: true },
        { label: "Unit", id: "unit", help: "e.g. mm, t, year" },
        { label: "Help Text", id: "help" },
        { label: "Display Order", id: "order", type: "number" },
        { label: "Min Value (numeric)", id: "min", type: "number" },
        { label: "Max Value (numeric)", id: "max", type: "number" }
      ], function (v) {
        self._busy(true);
        self._svc.createAttribute({
          group_ID: self._selectedGroup.ID, objectType: self._objectType,
          name: v.name, internalKey: v.key, dataType: v.type,
          unit: v.unit || null, helpText: v.help || null,
          displayOrder: parseInt(v.order || "0", 10),
          minValue: v.min ? parseFloat(v.min) : null,
          maxValue: v.max ? parseFloat(v.max) : null,
          status: "Active"
        }).then(function () { MessageToast.show("Attribute created."); self._loadAttributes(self._selectedGroup.ID); })
          .catch(function (e) { self._busy(false); MessageBox.error("Failed: " + e.message); });
      });
    },

    onEditAttribute: function () {
      if (!this._selectedAttr) { return; }
      var self = this, a = this._selectedAttr;
      self._showFormDialog("Edit Attribute: " + a.name, [
        { label: "Attribute Name", id: "name", value: a.name, required: true },
        { label: "Unit", id: "unit", value: a.unit || "" },
        { label: "Help Text", id: "help", value: a.helpText || "" },
        { label: "Display Order", id: "order", value: String(a.displayOrder || 0), type: "number" },
        { label: "Min Value", id: "min", value: a.minValue != null ? String(a.minValue) : "", type: "number" },
        { label: "Max Value", id: "max", value: a.maxValue != null ? String(a.maxValue) : "", type: "number" },
        { label: "Status", id: "status", type: "select", options: self._statusOpts, value: a.status }
      ], function (v) {
        self._busy(true);
        self._svc.updateAttribute(a.ID, {
          name: v.name, unit: v.unit || null, helpText: v.help || null,
          displayOrder: parseInt(v.order || "0", 10),
          minValue: v.min ? parseFloat(v.min) : null,
          maxValue: v.max ? parseFloat(v.max) : null,
          status: v.status
        }).then(function () { MessageToast.show("Attribute updated."); self._loadAttributes(self._selectedGroup.ID); self._loadAttrDetail(a.ID); })
          .catch(function (e) { self._busy(false); MessageBox.error("Failed: " + e.message); });
      });
    },

    onDeleteAttribute: function () {
      if (!this._selectedAttr) { return; }
      var self = this, a = this._selectedAttr;
      MessageBox.confirm("Delete attribute \"" + a.name + "\"?", {
        title: "Delete Attribute",
        onClose: function (act) {
          if (act !== "OK") { return; }
          self._busy(true);
          self._svc.deleteAttribute(a.ID)
            .then(function () { MessageToast.show("Attribute deleted."); self.byId("attrDetailPanel").setVisible(false); self._loadAttributes(self._selectedGroup.ID); })
            .catch(function (e) { self._busy(false); MessageBox.error(e.message); });
        }
      });
    },

    // ── Object-type config (create-or-update the changed row only) ──────────
    onConfigRowChange: function (oEvent) {
      var self = this;
      var row = oEvent.getSource().getBindingContext().getObject();
      var payload = { enabled: row.enabled, required: row.required, displayOrder: (row.displayOrder === "" || row.displayOrder == null) ? null : parseInt(row.displayOrder, 10) };
      var p = row.ID
        ? self._svc.updateConfig(row.ID, payload)
        : self._svc.createConfig({ attribute_ID: row.attribute_ID, objectType: row.objectType, enabled: row.enabled, required: row.required, displayOrder: payload.displayOrder });
      p.then(function () {
        MessageToast.show("Assignment for " + formatter.objectTypeLabel(row.objectType) + " saved.");
        if (!row.ID) { self._loadAttrDetail(self._selectedAttr.ID); } // refresh so the new row picks up its ID
      }).catch(function (e) { MessageBox.error("Failed to save assignment: " + e.message); });
    },

    // ── Allowed values CRUD + reorder ──────────────────────────────────────
    onAddAllowedValue: function () {
      if (!this._selectedAttr) { return; }
      var self = this;
      var existing = self.byId("allowedValuesTable").getModel().getData() || [];
      var nextOrder = existing.reduce(function (m, r) { return Math.max(m, r.displayOrder || 0); }, 0) + 1;
      self._showFormDialog("Add Allowed Value", [
        { label: "Value (stored)", id: "val", required: true, help: "Code persisted in the database." },
        { label: "Display Label", id: "label", help: "Shown to users (defaults to the value)." },
        { label: "Display Order", id: "order", type: "number", value: String(nextOrder) }
      ], function (v) {
        self._busy(true);
        self._svc.createAllowedValue({ attribute_ID: self._selectedAttr.ID, value: v.val, label: v.label || v.val, displayOrder: parseInt(v.order || "0", 10), status: "Active" })
          .then(function () { MessageToast.show("Value added."); self._loadAttrDetail(self._selectedAttr.ID); })
          .catch(function (e) { self._busy(false); MessageBox.error("Failed: " + e.message); });
      });
    },

    onEditAllowedValue: function (oEvent) {
      var self = this;
      var av = oEvent.getSource().getBindingContext().getObject();
      self._showFormDialog("Edit Value: " + av.value, [
        { label: "Display Label", id: "label", value: av.label || "" },
        { label: "Display Order", id: "order", value: String(av.displayOrder || 0), type: "number" },
        { label: "Status", id: "status", type: "select", options: self._statusOpts, value: av.status }
      ], function (v) {
        self._busy(true);
        self._svc.updateAllowedValue(av.ID, { label: v.label || av.value, displayOrder: parseInt(v.order || "0", 10), status: v.status })
          .then(function () { MessageToast.show("Value updated."); self._loadAttrDetail(self._selectedAttr.ID); })
          .catch(function (e) { self._busy(false); MessageBox.error("Failed: " + e.message); });
      });
    },

    onDeleteAllowedValue: function (oEvent) {
      var self = this;
      var av = oEvent.getSource().getBindingContext().getObject();
      MessageBox.confirm("Delete allowed value \"" + av.value + "\"?", {
        title: "Delete Value",
        onClose: function (a) {
          if (a !== "OK") { return; }
          self._busy(true);
          self._svc.deleteAllowedValue(av.ID)
            .then(function () { MessageToast.show("Value deleted."); self._loadAttrDetail(self._selectedAttr.ID); })
            .catch(function (e) { self._busy(false); MessageBox.error(e.message); });
        }
      });
    },

    onMoveAllowedValueUp: function (oEvent)   { this._moveAllowedValue(oEvent, -1); },
    onMoveAllowedValueDown: function (oEvent) { this._moveAllowedValue(oEvent, +1); },

    _moveAllowedValue: function (oEvent, dir) {
      var self = this;
      var table = self.byId("allowedValuesTable");
      var rows = table.getModel().getData();
      var current = oEvent.getSource().getBindingContext().getObject();
      var idx = rows.findIndex(function (r) { return r.ID === current.ID; });
      var swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= rows.length) { return; } // already at the edge
      var a = rows[idx], b = rows[swapIdx];
      var aOrder = a.displayOrder || 0, bOrder = b.displayOrder || 0;
      if (aOrder === bOrder) { bOrder = aOrder + dir; } // ensure distinct ordering
      self._busy(true);
      Promise.all([
        self._svc.updateAllowedValue(a.ID, { displayOrder: bOrder }),
        self._svc.updateAllowedValue(b.ID, { displayOrder: aOrder })
      ]).then(function () { self._loadAttrDetail(self._selectedAttr.ID); })
        .catch(function (e) { self._busy(false); MessageBox.error("Failed to reorder: " + e.message); });
    },

    // ── Help ───────────────────────────────────────────────────────────────
    onShowHelp: function () {
      var types = this._objectTypes.map(formatter.objectTypeLabel).join(" / ");
      var html = [
        "<h4>What this does</h4>",
        "<p>Define custom data fields (\"characteristics\") for " + types + " objects, grouped into reusable classes — similar to SAP EAM Classes &amp; Characteristics.</p>",
        "<h4>1 · Create a group (class)</h4>",
        "<p>Pick the object type, then <strong>New</strong> in the Groups column. Give it a name and a unique internal key.</p>",
        "<h4>2 · Add attributes (characteristics)</h4>",
        "<p>Select a group, then <strong>New</strong> in the Attributes column. Choose a data type; for numeric types set Min/Max; for Single/Multi-Select add allowed values in the detail panel.</p>",
        "<h4>3 · Assign to object types</h4>",
        "<p>In the detail panel, toggle <strong>Enabled</strong> (and optionally <strong>Required</strong>) per object type. The attribute then appears on every record of that type.</p>",
        "<h4>Notes</h4>",
        "<ul><li>Set <em>Status = Inactive</em> to hide an attribute while preserving stored values.</li>",
        "<li>Internal key &amp; data type are locked once values exist.</li>",
        "<li>Use <strong>Template</strong> to export an Excel upload sheet for bulk value entry.</li></ul>"
      ].join("");
      var dlg = new Dialog({
        title: "Attribute Configuration — Help",
        contentWidth: "520px",
        content: [new FormattedText({ htmlText: html })],
        endButton: new Button({ text: "Close", press: function () { dlg.close(); } }),
        afterClose: function () { dlg.destroy(); }
      });
      dlg.addStyleClass("sapUiContentPadding");
      dlg.open();
    },

    // ── Reusable form dialog with inline validation ─────────────────────────
    _showFormDialog: function (title, fields, onConfirm) {
      var content = new VBox({ width: "100%" });
      var inputs = {};
      fields.forEach(function (f) {
        var lbl = new Label({ text: f.label, required: !!f.required });
        var ctrl;
        if (f.type === "select") {
          ctrl = new Select({ width: "100%", forceSelection: false });
          (f.options || []).forEach(function (o) { ctrl.addItem(new Item({ key: o, text: o })); });
          if (f.value) { ctrl.setSelectedKey(f.value); }
        } else {
          ctrl = new Input({ value: f.value || "", type: f.type === "number" ? "Number" : "Text" });
        }
        ctrl.setWidth("100%");
        inputs[f.id] = ctrl;
        var items = [lbl, ctrl];
        if (f.help) { items.push(new Text({ text: f.help }).addStyleClass("sapUiTinyMarginBottom")); }
        content.addItem(new VBox({ items: items }).addStyleClass("sapUiTinyMarginBottom"));
      });
      var dlg = new Dialog({
        title: title,
        contentWidth: "26rem",
        content: [content],
        beginButton: new Button({
          text: "Confirm", type: "Emphasized",
          press: function () {
            var vals = {}, missing = [];
            fields.forEach(function (f) {
              var c = inputs[f.id];
              var val = c.getSelectedKey ? c.getSelectedKey() : c.getValue();
              vals[f.id] = val;
              if (f.required && !val) {
                missing.push(f.label);
                if (c.setValueState) { c.setValueState("Error"); c.setValueStateText(f.label + " is required"); }
              } else if (c.setValueState) {
                c.setValueState("None");
              }
            });
            if (missing.length) { MessageToast.show("Please fill: " + missing.join(", ")); return; }
            dlg.close();
            onConfirm(vals);
          }
        }),
        endButton: new Button({ text: "Cancel", press: function () { dlg.close(); } }),
        afterClose: function () { dlg.destroy(); }
      });
      dlg.addStyleClass("sapUiContentPadding");
      dlg.open();
    }
  });
});
