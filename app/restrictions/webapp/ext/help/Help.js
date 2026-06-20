sap.ui.define(["sap/m/Dialog", "sap/m/Button", "sap/m/FormattedText"], function (Dialog, Button, FormattedText) {
  "use strict";

  // In-app help for the Restrictions register. Keyed by the intent's semantic object (first token
  // of the launchpad hash). sap.m FormattedText only honours <strong>/<em>.
  var HELP = {
    Restrictions: {
      title: "Restrictions register",
      purpose: "Every restriction on a structure — load/mass, dimension, access, closure and multi-modal limits (road, rail, marine, pedestrian, dangerous goods). It tells you what is limited, where, how severely, and feeds downstream route planning.",
      steps: [
        "Use the <strong>filter bar</strong> (restriction ref, bridge, type, status, category, permit, temporary, active) to narrow the list.",
        "The list is a <strong>hierarchy</strong> — expand a parent to see related sub-restrictions.",
        "<strong>Click a row</strong> to open the restriction (read, edit, deactivate). Use <strong>Create</strong> to add one; it links to a bridge via the searchable bridge value-help."
      ],
      tips: [
        "The toolbar gear personalises sort / filter / group / columns; <strong>Export</strong> downloads the view to Excel.",
        "Removal is a <strong>soft-delete</strong> (Deactivate) — the audit trail is kept.",
        "Multi-mode analytics are in the <strong>Restrictions Dashboard</strong> tile; routing engines can read GET /restrictions/api/route-feed.",
        "Closing a restriction recomputes the bridge's posting status (e.g. to CLOSED)."
      ]
    },
    _default: {
      title: "Help",
      purpose: "This screen is a register. Use the filter bar to narrow the list, the toolbar gear to personalise sort / filter / group / columns, and Export to download to Excel.",
      steps: ["<strong>Click a row</strong> to open its details.", "Removal is a soft-delete (Deactivate)."],
      tips: ["Every change is captured in the Change Documents audit trail."]
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
