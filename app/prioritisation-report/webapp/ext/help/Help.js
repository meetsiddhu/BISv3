sap.ui.define(["sap/m/Dialog", "sap/m/Button", "sap/m/FormattedText"], function (Dialog, Button, FormattedText) {
  "use strict";

  // In-app help for the Prioritisation Run Archive. Keyed by the intent's semantic object.
  // sap.m FormattedText only honours <strong>/<em>.
  var HELP = {
    PrioritisationReport: {
      title: "Prioritisation Run Archive",
      purpose: "The history of every prioritisation run — active and superseded. Each run is an immutable, reproducible record of how a bridge was scored (inputs + the exact methodology snapshot), for governance and audit.",
      steps: [
        "Filter/sort to find a run by bridge, band, score or date.",
        "<strong>Click a row</strong> to open the frozen run detail — the inputs, the per-criterion evaluation and the methodology version it used.",
        "Compare active vs superseded runs to see how a ranking changed over time."
      ],
      tips: [
        "Runs are <strong>immutable</strong> — they reproduce byte-identically for audit; new assessments supersede rather than overwrite.",
        "The live ranked worklist, assessment and capital optimiser are in the <strong>Bridge Prioritisation</strong> tile.",
        "<strong>Export</strong> the list to Excel from the toolbar."
      ]
    },
    _default: {
      title: "Help",
      purpose: "This screen is a report. Use the filter bar to narrow the list, the toolbar gear to personalise columns, and Export to download to Excel. Click a row to open its details.",
      steps: [],
      tips: []
    }
  };

  function keyFromHash() {
    var m = (window.location.hash || "").replace(/^#/, "").match(/^([^-&/?(]+)/);
    return m ? m[1] : "";
  }

  function render(c) {
    var li = function (s) { return "<li>" + s + "</li>"; };
    var html = "<p>" + c.purpose + "</p>";
    if (c.steps && c.steps.length) { html += "<h4>How to use it</h4><ol>" + c.steps.map(li).join("") + "</ol>"; }
    if (c.tips && c.tips.length) { html += "<h4>Useful to know</h4><ul>" + c.tips.map(li).join("") + "</ul>"; }
    return html;
  }

  var dlg;
  return {
    onShowHelp: function () {
      var c = HELP[keyFromHash()] || HELP._default;
      if (dlg) { try { dlg.destroy(); } catch (e) { /* ignore */ } dlg = null; }
      dlg = new Dialog({
        title: c.title, contentWidth: "36rem", contentHeight: "30rem",
        resizable: true, draggable: true, verticalScrolling: true,
        content: [new FormattedText({ htmlText: render(c) }).addStyleClass("sapUiSmallMargin")],
        endButton: new Button({ text: "Close", press: function () { dlg.close(); } }),
        afterClose: function () { try { dlg.destroy(); } catch (e) { /* ignore */ } dlg = null; }
      });
      dlg.open();
    }
  };
});
