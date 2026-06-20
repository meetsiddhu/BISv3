sap.ui.define(["sap/m/Dialog", "sap/m/Button", "sap/m/FormattedText"], function (Dialog, Button, FormattedText) {
  "use strict";

  // In-app help for every tile served by this Fiori Elements app. The content is keyed by the
  // intent's semantic object (the first token of the launchpad hash, e.g. "Bridges-manage" ->
  // "Bridges"), so ONE manifest action + this one handler covers every List Report. sap.m
  // FormattedText only honours <strong>/<em> (it strips <b>/<i>).
  var HELP = {
    Bridges: {
      title: "Bridges — asset register",
      purpose: "The master register of every bridge/structure: identity, location, condition, capacity, importance and status. It is the single source the map, restrictions, prioritisation and reports all read from.",
      steps: [
        "Use the <strong>filter bar</strong> (bridge id, name, mode, network, state, condition, posting, asset class, data quality) to narrow the list.",
        "<strong>Click a row</strong> to open the bridge's details page (read, edit, deactivate/reactivate).",
        "Use <strong>Create</strong> to add a structure, or <strong>Mass Upload</strong> for bulk loads."
      ],
      tips: [
        "The toolbar gear personalises sort / filter / group / columns; <strong>Export</strong> downloads the current view to Excel.",
        "Removal is a <strong>soft-delete</strong> (Deactivate) — the audit trail is preserved; nothing is hard-deleted.",
        "The <strong>Data Quality</strong> and <strong>Load Rating Basis</strong> badges show whether figures are surveyed/certified or screening estimates."
      ]
    },
    BridgeInspections: {
      title: "Inspections",
      purpose: "The inspection history for the fleet — when each structure was inspected, by whom, and the resulting condition. Feeds the bridge health index and the overdue-inspection signal.",
      steps: [
        "Filter by bridge or date to find inspections; <strong>click a row</strong> to open the full inspection.",
        "<strong>Create</strong> records a new inspection against a bridge.",
        "Element condition-state quantities (CS1–CS4) captured here drive the BHI and prioritisation."
      ],
      tips: [
        "Inspection scheduling/execution lives in EAM — this register holds the engineering condition record.",
        "Export the list to Excel from the toolbar for offline review."
      ]
    },
    BridgeDefects: {
      title: "Defects",
      purpose: "Defects observed on structures — type, severity/condition state, location and extent. The extent of defects (how much of an element is affected) feeds the bridge health index.",
      steps: [
        "Filter to a bridge or severity; <strong>click a row</strong> to open the defect.",
        "<strong>Create</strong> logs a new defect against a bridge/element.",
        "Record the condition-state extent so a mostly-poor element scores worse than a slightly-affected one."
      ],
      tips: ["Use grouping (toolbar gear) to roll defects up by bridge or severity."]
    },
    BridgeCapacities: {
      title: "Bridge Capacity",
      purpose: "The load and geometric capacity records per structure — load rating, rating standard, clearances and posting basis. Read by the heavy-vehicle assessment and restrictions.",
      steps: [
        "Filter to a bridge; <strong>click a row</strong> to open the capacity record.",
        "<strong>Create</strong> adds a capacity/rating record.",
        "Set the rating standard and basis so screening estimates are never mistaken for certified ratings."
      ],
      tips: ["The heavy-vehicle assessment (Prioritisation → HV) uses these stored capacities."]
    },
    AttributeClasses: {
      title: "Attribute Classes — classification (EAM CL01/CT04)",
      purpose: "The no-code way to extend the data model: define classes and their characteristics (data type, allowed values, render style, mandatory), then attach class(es) to bridges or restrictions to collect that data — like SAP EAM classification.",
      steps: [
        "<strong>Create a class</strong>, set its Object Type (Bridge / Restriction) and Status (only Active classes with at least one enabled characteristic apply).",
        "Open the class and add <strong>Characteristics</strong>: data type, allowed-value list, display type (dropdown / radio / checkbox / multi), and whether it's required.",
        "On a bridge/restriction, <strong>Custom Attributes → Select Classes…</strong> to assign class(es) and collect the values."
      ],
      tips: [
        "Required characteristics become mandatory on the asset (server-enforced, and on mass-import).",
        "Values are audited (Change Documents), exportable and mass-uploadable — all from one config."
      ]
    },
    EAMMapping: {
      title: "EAM Code Mapping",
      purpose: "Maintains the value mappings between this app's codes and SAP EAM (S/4HANA) codes/fields, so the app stays standalone yet S/4-compatible — no hardcoded mappings.",
      steps: [
        "Filter to a domain; <strong>click a row</strong> to view or edit a mapping.",
        "<strong>Create</strong> adds a source→target code or field mapping.",
        "Mappings are read by the integration layer when EAM sync is enabled."
      ],
      tips: ["This complements EAM — it does not replicate work orders or maintenance plans."]
    },
    ClassTypes: {
      title: "Class Types",
      purpose: "The catalogue of class types (e.g. Bridge, Restriction) that scope which classes apply to which object — the equivalent of an EAM class type.",
      steps: [
        "<strong>Create</strong> or edit a class type and set its status.",
        "Class types are referenced when you create an Attribute Class to scope it to an object."
      ],
      tips: ["This is draft-enabled — create/edit inline and Save."]
    },
    AMObjectives: {
      title: "Asset-Management Objectives (ISO 55001)",
      purpose: "The line-of-sight from organisational goals → asset-management objectives → measurable service-level targets, so investment decisions trace back to strategy (ISO 55001).",
      steps: [
        "<strong>Create</strong> an objective, linking it to a goal and one or more measurable targets.",
        "Reference these objectives when justifying prioritisation and capital decisions."
      ],
      tips: ["This is the strategic layer that the prioritisation and reports roll up to."]
    },
    NetworkPortfolio: {
      title: "Network Portfolio report",
      purpose: "Pre-aggregated portfolio analytics by network × transport mode — counts, condition and risk rolled up correctly (avoids averaging averages). For capital planning.",
      steps: [
        "Use the filters to scope by network/mode; the table shows the aggregated figures.",
        "<strong>Export</strong> to Excel for the funding submission."
      ],
      tips: ["This is read-only analytics — the underlying records are in the Bridges register."]
    },
    RestrictionsDashboard: {
      title: "Restrictions Dashboard",
      purpose: "Multi-mode analytics over all active and scheduled restrictions (road / rail / marine / pedestrian) — what is restricted, where, and how severely. For network access and route planning.",
      steps: [
        "Use the analytical filters (mode, type, severity, status) to slice the restriction base.",
        "Drill into the chart/table to see the contributing restrictions."
      ],
      tips: ["The machine-readable feed for routing engines is GET /restrictions/api/route-feed."]
    },
    ChangeDocuments: {
      title: "Change Documents — audit trail",
      purpose: "The immutable audit log of every create/change/deactivate — field and custom-attribute changes with old value, new value, who and when. For compliance and governance.",
      steps: [
        "Filter by object, field, user or date; <strong>click a row</strong> for the full before/after.",
        "<strong>Export</strong> the trail to Excel for an audit."
      ],
      tips: ["Every business write across the app is captured here automatically."]
    },
    BridgeRisk: {
      title: "Bridge Risk report",
      purpose: "A per-bridge risk and inspection worklist with the return-on-investment view — the engineering ops list of what to act on.",
      steps: ["Filter/sort to the worklist you need; <strong>click a row</strong> to open the bridge."],
      tips: ["The full ranked program is in the Bridge Prioritisation app."]
    },
    _default: {
      title: "Help",
      purpose: "This screen is a register/report. Use the filter bar to narrow the list, the toolbar gear to personalise sort / filter / group / columns, and Export to download to Excel.",
      steps: [
        "<strong>Click a row</strong> to open its details.",
        "Use <strong>Create</strong> (where shown) to add a record; removal is a soft-delete (Deactivate)."
      ],
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
