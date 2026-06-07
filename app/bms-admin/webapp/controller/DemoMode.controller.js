sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
  "use strict";

  return Controller.extend("BridgeManagement.bmsadmin.controller.DemoMode", {

    onInit: function () {
      var sAdminBase      = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/AdminService/uri").replace(/\/$/, "");
      this._systemCfgUrl = sAdminBase + "/SystemConfig('demoModeActive')";
      this._bridgesUrl   = sAdminBase + "/Bridges?$count=true&$top=0";
      this._loadAction   = sAdminBase + "/loadDemoData";
      this._clearAction  = sAdminBase + "/clearDemoData";
      this.getView().setModel(new JSONModel({
        demoActive:   false,
        bridgeCount:  "Loading…",
        statusText:   "Checking demo status…",
        statusType:   "Information",
        statusLabel:  "Unknown",
        statusState:  "None",
        dataSource:   "Unknown"
      }), "demo");

      this._refresh();
    },

    onRefresh: function () {
      this._refresh();
    },

    _refresh: function () {
      var self = this;
      var demoModel = this.getView().getModel("demo");

      // Fetch demoModeActive config key
      fetch(self._systemCfgUrl, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (demoModeResponse) { return demoModeResponse.ok ? demoModeResponse.json() : Promise.reject(demoModeResponse.statusText); })
        .then(function (demoModeConfig) {
          var active = demoModeConfig.value === "true";
          demoModel.setProperty("/demoActive", active);
          demoModel.setProperty("/statusLabel", active ? "Demo Mode ACTIVE" : "Not Active");
          demoModel.setProperty("/statusState", active ? "Warning" : "Success");
          demoModel.setProperty("/statusText",  active
            ? "⚠  Demo Mode is ACTIVE: the system is running NSW demonstration data. Users see demo bridges in Map View and Bridge Register."
            : "Demo Mode is not active. The system is in its normal state.");
          demoModel.setProperty("/statusType", active ? "Warning" : "Success");
          demoModel.setProperty("/dataSource", active ? "Transport for NSW: Public Demo Dataset (30 NSW bridges)" : "Production / empty");
        })
        .catch(function () {
          // Config key may not exist yet: treat as inactive
          demoModel.setProperty("/demoActive", false);
          demoModel.setProperty("/statusLabel", "Not Active");
          demoModel.setProperty("/statusState", "Success");
          demoModel.setProperty("/statusText",  "Demo Mode is not active.");
          demoModel.setProperty("/statusType",  "Success");
        });

      // Fetch bridge count
      fetch(self._bridgesUrl, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (bridgeCountResponse) { return bridgeCountResponse.ok ? bridgeCountResponse.json() : Promise.reject(bridgeCountResponse.statusText); })
        .then(function (bridgeCountData) {
          demoModel.setProperty("/bridgeCount", String(bridgeCountData["@odata.count"] || 0) + " bridges");
        })
        .catch(function () {
          demoModel.setProperty("/bridgeCount", "Unknown");
        });
    },

    onLoadDemoData: function () {
      var self = this;
      MessageBox.confirm(
        "This will delete all current bridge data and load 30 real NSW demonstration bridges.\n\nAre you sure?",
        {
          title: "Load NSW Demo Data",
          actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
          emphasizedAction: MessageBox.Action.OK,
          onClose: function (action) {
            if (action !== MessageBox.Action.OK) return;
            self._callAction(self._loadAction, "Loading demo data…", "Demo data loaded successfully!", true);
          }
        }
      );
    },

    onClearDemoData: function () {
      var self = this;
      MessageBox.confirm(
        "This will remove all demo bridge records and return the system to an empty state.\n\nAre you sure?",
        {
          title: "Clear Demo Data",
          actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
          onClose: function (action) {
            if (action !== MessageBox.Action.OK) return;
            self._callAction(self._clearAction, "Clearing demo data…", "Demo data cleared successfully.", false);
          }
        }
      );
    },

    _callAction: function (url, loadingMsg, successMsg, _expectActive) {
      var self = this;
      var btnLoad  = this.byId("btnLoadDemo");
      var btnClear = this.byId("btnClearDemo");
      if (btnLoad)  btnLoad.setEnabled(false);
      if (btnClear) btnClear.setEnabled(false);

      MessageToast.show(loadingMsg);

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({})
      })
        .then(function (actionResponse) { return actionResponse.ok ? actionResponse.json() : Promise.reject(actionResponse.statusText); })
        .then(function () {
          MessageToast.show(successMsg);
          self._refresh();
        })
        .catch(function (err) {
          MessageBox.error("Operation failed: " + (err || "Unknown error"));
          self._refresh();
        });
    }
  });
});
