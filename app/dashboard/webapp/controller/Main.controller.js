sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/FormattedText"
], function (Controller, JSONModel, MessageBox, MessageToast, Dialog, Button, FormattedText) {
  "use strict";

  const CONDITION_CONFIG = [
    { key: "good",     label: "Good",     state: "Success", color: "#107E3E", icon: "sap-icon://sys-enter-2" },
    { key: "fair",     label: "Fair",     state: "Warning", color: "#E76500", icon: "sap-icon://warning"     },
    { key: "poor",     label: "Poor",     state: "Error",   color: "#BB0000", icon: "sap-icon://error"       },
    { key: "critical", label: "Critical", state: "Error",   color: "#6E0000", icon: "sap-icon://alert"       }
  ];

  return Controller.extend("BridgeManagement.dashboard.controller.Main", {

    onInit: function () {
      this._dashboardBase = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources/DashboardService/uri").replace(/\/$/, "");

      const model = new JSONModel({
        busy: true,
        totalBridges: 0,
        activeRestrictions: 0,
        closedBridges: 0,
        postedRestrictions: 0,
        deficient: 0,
        sufficiencyPct: 0,
        conditionRows: [],
        conditionSummaryLabel: "",
        lastRefreshedLabel: ""
      });
      this.getView().setModel(model, "view");
      this._loadAnalytics();
    },

    onExit: function () {
    },

    onRefresh: function () {
      MessageToast.show("Refreshing…");
      this._loadAnalytics();
    },

    onNavigateBridges: function () {
      window.location.href = "#Bridges-manage";
    },

    onNavigateClosedBridges: function () {
      window.location.href = "#Bridges-manage?postingStatus=Closed";
    },

    onNavigateRestrictions: function () {
      window.location.href = "#Restrictions-manage";
    },

    onNavigateMap: function () {
      window.location.href = "#Map-display";
    },

    onNavigateMassEdit: function () {
      window.location.href = "#MassEdit-manage";
    },

    _loadAnalytics: async function () {
      const model = this._vm();
      model.setProperty("/busy", true);

      try {
        const response = await fetch(this._dashboardBase + "/analytics");
        if (!response.ok) {
          const ct = response.headers.get("content-type") || "";
          const msg = ct.includes("application/json")
            ? (await response.json()).error?.message
            : `HTTP ${response.status}`;
          throw new Error(msg || "Failed to load analytics");
        }

        const data = await response.json();
        this._applyData(model, data);
      } catch (error) {
        MessageBox.error(error.message || "Could not load dashboard analytics.");
      } finally {
        model.setProperty("/busy", false);
      }
    },

    _applyData: function (model, data) {
      const dist  = data.conditionDistribution || {};
      const total = dist.total || 0;

      // Build condition rows with computed percentages
      const conditionRows = CONDITION_CONFIG.map(function (cfg) {
        const count = dist[cfg.key] || 0;
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        return {
          key:     cfg.key,
          label:   cfg.label,
          count:   count,
          pct:     pct,
          pctText: pct + "%",
          state:   cfg.state,
          color:   cfg.color,
          icon:    cfg.icon
        };
      });

      // Dominant condition label for header
      const dominant = conditionRows.reduce(function (best, row) {
        return row.count > best.count ? row : best;
      }, conditionRows[0] || { label: "-", pct: 0 });
      const summaryLabel = total > 0
        ? dominant.pct + "% " + dominant.label.toLowerCase()
        : "No condition data";

      // Timestamp
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      model.setProperty("/totalBridges",       data.totalBridges       || 0);
      model.setProperty("/activeRestrictions", data.activeRestrictions || 0);
      model.setProperty("/closedBridges",      data.closedBridges      || 0);
      model.setProperty("/postedRestrictions", data.postedRestrictions || 0);
      model.setProperty("/deficient",          data.deficient          || 0);
      model.setProperty("/sufficiencyPct",     data.sufficiencyPct     || 0);
      model.setProperty("/conditionRows",      conditionRows);
      model.setProperty("/conditionSummaryLabel", summaryLabel);
      model.setProperty("/lastRefreshedLabel", "Last refreshed: " + timeStr);
    },

    onShowHelp: function () {
      var sHtml = [
        "<p>Real-time overview of the bridge network: asset counts, condition health, key risk indicators, and active restrictions.</p>",
        "<h4>Network Summary KPIs</h4>",
        "<ul>",
        "<li><strong>Total Assets:</strong> Total bridges in the register. Click to open the Bridge Register.</li>",
        "<li><strong>Active Restrictions:</strong> Bridges with a current posting restriction. Shown in orange/red when &gt; 0.</li>",
        "<li><strong>Bridges Closed:</strong> Bridges with a Closed posting status.</li>",
        "</ul>",
        "<h4>Condition State Distribution</h4>",
        "<p>Percentage of the network in each condition band (Good / Fair / Poor / Critical) shown as a progress bar.</p>",
        "<h4>Key Indicators</h4>",
        "<ul>",
        "<li><strong>Sufficiency Rating:</strong> Average structural sufficiency score across all bridges.</li>",
        "<li><strong>Structurally Deficient:</strong> Bridges rated structurally deficient requiring attention.</li>",
        "</ul>",
        "<p>Use the refresh icon to reload analytics from the latest data.</p>"
      ].join("");
      this._openHelpDialog("How to Use", sHtml);
    },

    onTileInfo: function (oEvent) {
      var sKey = oEvent.getSource().data("tileKey");
      var oInfo = {
        totalAssets: {
          title: "Total Assets",
          html: "<p><strong>Total Assets</strong> shows the count of all bridge structures registered in BMS.</p>" +
                "<p>Click the tile to open the Bridge Register where you can filter, search, and edit records.</p>"
        },
        activeRestrictions: {
          title: "Active Restrictions",
          html: "<p><strong>Active Restrictions</strong> counts bridges with a current posting restriction (e.g. mass, height, or speed limit).</p>" +
                "<p>Shown in orange/red when greater than 0. Click the tile to open the Restrictions list.</p>"
        },
        bridgesClosed: {
          title: "Bridges Closed",
          html: "<p><strong>Bridges Closed</strong> shows the number of bridges with a <em>Closed</em> posting status.</p>" +
                "<p>A red indicator means one or more bridges are currently closed to traffic.</p>"
        },
        sufficiency: {
          title: "Sufficiency Rating",
          html: "<p><strong>Sufficiency Rating</strong> is the average structural sufficiency score (0–100%) across all bridges.</p>" +
                "<p>Scores below 50% typically indicate bridges requiring priority intervention or replacement.</p>"
        },
        deficient: {
          title: "Structurally Deficient",
          html: "<p><strong>Structurally Deficient</strong> counts bridges rated as structurally deficient based on condition assessment.</p>" +
                "<p>These bridges may still be open but require prioritised maintenance or load restriction.</p>"
        }
      };
      var oEntry = oInfo[sKey] || { title: "Info", html: "<p>No additional information available.</p>" };
      this._openHelpDialog(oEntry.title, oEntry.html);
    },

    _openHelpDialog: function (sTitle, sHtml) {
      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "400px",
        content: [new FormattedText({ htmlText: sHtml })],
        endButton: new Button({ text: "Close", press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.addStyleClass("sapUiContentPadding");
      oDialog.open();
    },

    _vm: function () {
      return this.getView().getModel("view");
    }

  });
});
