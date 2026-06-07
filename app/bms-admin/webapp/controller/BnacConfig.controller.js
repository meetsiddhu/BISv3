sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Input",
  "sap/m/CheckBox",
  "sap/m/Label",
  "sap/ui/layout/form/SimpleForm",
  "sap/m/FormattedText"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Input, CheckBox, Label, SimpleForm,  FormattedText) {
  "use strict";

  return Controller.extend("BridgeManagement.bmsadmin.controller.BnacConfig", {

    onInit: function () {
      this._bnacBase  = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/BnacService/uri").replace(/\/$/, "");
      this._envModel  = new JSONModel({ environments: [] });
      this._histModel = new JSONModel({ history: [] });
      this.getView().setModel(this._envModel,  "envModel");
      this.getView().setModel(this._histModel, "histModel");
      this._selectedFile = null;
      this._loadEnvs();
      this._loadHistory();

      // Native file input (cannot declare in XML view)
      const fi = document.createElement("input");
      fi.type = "file"; fi.id = "bnacFileInput"; fi.accept = ".csv"; fi.style.display = "none";
      document.body.appendChild(fi);
    },

    _loadEnvs: function () {
      fetch(this._bnacBase + "/environments", { credentials: "same-origin" })
        .then(r => r.json())
        .then(d => this._envModel.setData({ environments: d.environments || [] }))
        .catch(e => MessageBox.error("Failed to load environments: " + e.message));
    },

    onRefreshEnvs: function () { this._loadEnvs(); this._loadHistory(); },
    onAddEnv:      function () { this._openEnvDialog(null); },

    onEditEnv: function (oEvent) {
      this._openEnvDialog(oEvent.getSource().getBindingContext("envModel").getObject());
    },

    onDeleteEnv: function (oEvent) {
      const env = oEvent.getSource().getBindingContext("envModel").getObject().environment;
      MessageBox.confirm("Delete environment \"" + env + "\"?", {
        onClose: action => {
          if (action !== MessageBox.Action.OK) return;
          fetch(this._bnacBase + "/environments/" + encodeURIComponent(env), { method: "DELETE", credentials: "same-origin" })
            .then(() => { MessageToast.show("Deleted."); this._loadEnvs(); })
            .catch(e => MessageBox.error(e.message));
        }
      });
    },

    _openEnvDialog: function (existing) {
      const isEdit = !!existing;
      if (this._envDialog) this._envDialog.destroy();

      const dlgEnv    = new Input({ value: existing?.environment || "", editable: !isEdit, placeholder: "e.g. STAGING" });
      const dlgUrl    = new Input({ value: existing?.baseUrl     || "", placeholder: "https://bnac-xxx.austroads.com.au/assets/" });
      const dlgDescr  = new Input({ value: existing?.description || "", placeholder: "Optional description" });
      const dlgActive = new CheckBox({ selected: existing?.active !== false });

      this._envDialog = new Dialog({
        title: isEdit ? "Edit Environment" : "Add Environment",
        content: [new SimpleForm({ layout: "ColumnLayout", columnsM: 1, editable: true, content: [
          new Label({ text: "Environment Key", required: true }), dlgEnv,
          new Label({ text: "Base URL",         required: true }), dlgUrl,
          new Label({ text: "Description" }),                       dlgDescr,
          new Label({ text: "Active" }),                            dlgActive
        ]})],
        beginButton: new Button({
          text: "Save", type: "Emphasized",
          press: () => {
            const env = dlgEnv.getValue().trim().toUpperCase();
            const url = dlgUrl.getValue().trim();
            if (!env || !url) { MessageToast.show("Environment and Base URL are required."); return; }
            const body = { environment: env, baseUrl: url, description: dlgDescr.getValue().trim(), active: dlgActive.getSelected() };
            const req  = isEdit
              ? fetch(this._bnacBase + "/environments/" + encodeURIComponent(env), { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
              : fetch(this._bnacBase + "/environments",                             { method: "POST",  headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
            req.then(r => r.json()).then(d => {
              if (d.error) { MessageBox.error(d.error.message); return; }
              MessageToast.show("Saved.");
              this._envDialog.close();
              this._loadEnvs();
            }).catch(e => MessageBox.error(e.message));
          }
        }),
        endButton:   new Button({ text: "Cancel", press: () => this._envDialog.close() }),
        afterClose:  () => this._envDialog.destroy()
      });
      this.getView().addDependent(this._envDialog);
      this._envDialog.open();
    },

    onBrowse: function () {
      const fi = document.getElementById("bnacFileInput");
      fi.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        this._selectedFile = file;
        this.byId("fileNameDisplay").setValue(file.name);
        this.byId("uploadBtn").setEnabled(true);
      };
      fi.click();
    },

    onUpload: function () {
      if (!this._selectedFile) { MessageToast.show("Please select a CSV file first."); return; }
      const env  = this.byId("envSelect").getSelectedKey();
      const file = this._selectedFile;
      const reader = new FileReader();
      reader.onload = e => {
        const base64 = btoa(e.target.result);
        this.getView().setBusy(true);
        fetch(this._bnacBase + "/upload", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
          body: JSON.stringify({ fileName: file.name, contentBase64: base64, environment: env })
        })
        .then(r => r.json())
        .then(d => {
          this.getView().setBusy(false);
          if (d.error) { MessageBox.error(d.error.message); return; }
          const strip = this.byId("uploadResult");
          strip.setType(d.failed > 0 ? "Warning" : "Success");
          strip.setText("Upload complete: " + d.success + " succeeded, " + d.failed + " failed out of " + d.total + " rows.");
          strip.setVisible(true);
          this.byId("uploadBtn").setEnabled(false);
          this.byId("fileNameDisplay").setValue("");
          this._selectedFile = null;
          document.getElementById("bnacFileInput").value = "";
          this._loadHistory();
        })
        .catch(e => { this.getView().setBusy(false); MessageBox.error(e.message); });
      };
      reader.readAsBinaryString(file);
    },

    _loadHistory: function () {
      fetch(this._bnacBase + "/history", { credentials: "same-origin" })
        .then(r => r.json())
        .then(d => {
          const rows = (d.history || []).map(h => ({
            ...h,
            loadedAtDisplay: h.loadedAt ? new Date(h.loadedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "",
            failedState: (h.failed || 0) > 0 ? "Error" : "None"
          }));
          this._histModel.setData({ history: rows });
        })
        .catch(function () { /* load history is non-critical; leave panel empty on failure */ });
    },

    onShowHelp: function () {
      var sHtml = [
        "<h4>Purpose</h4>",
        "<p>This page manages the connection between BMS and BNAC (Bridge Network Asset Condition) systems: configure environment URLs and upload the mapping between BMS Bridge IDs and BNAC Object IDs.</p>",
        "<h4>Step 1: Configure Environments</h4>",
        "<ol>",
        "<li>Click <strong>Add Environment</strong> to add a BNAC environment (e.g. DEV, UAT, PROD).</li>",
        "<li>Enter the environment name, base URL, and a description.</li>",
        "<li>Toggle <strong>Active</strong> to mark which environment is used for generating deep-links.</li>",
        "</ol>",
        "<h4>Step 2: Upload ID Mappings</h4>",
        "<ol>",
        "<li>Prepare a CSV file with two columns: <em>bridgeId</em> and <em>bnacObjectId</em>. Include a header row.</li>",
        "<li>Select the target environment from the dropdown and drop the CSV onto the upload area.</li>",
        "<li>Review the upload result summary (total, success, failed rows).</li>",
        "</ol>",
        "<h4>Upload History</h4>",
        "<p>The <strong>Load History</strong> table records every CSV upload with timestamp, user, environment, and row counts.</p>",
        "<h4>How Deep-Links Work</h4>",
        "<p>Once a mapping is uploaded, the Bridge detail page shows an <strong>Open in BNAC</strong> button. The link is built as: <em>baseUrl + bnacObjectId</em>.</p>"
      ].join("");
      var oDialog = new Dialog({
        title: "BNAC Integration: Help",
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
