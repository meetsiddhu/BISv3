/*
 * FkMessageGuard
 * -----------------------------------------------------------------------------
 * Single source of truth for suppressing the stale Integer foreign-key parse
 * error on the Defects / Inspections forms.
 *
 * Background
 *   `bridge_ID` and `inspection_ID` are Integer (Edm.Int32) foreign keys. When a
 *   user types into the bridge/inspection ComboBox, Fiori Elements V4 validates
 *   the *display text* against the Integer type and registers a "Enter a number
 *   without decimals" parse error in the MessageManager. Once a value is picked
 *   the bound key is a valid integer, but the stale message lingers and blocks
 *   Create/Save.
 *
 * Why this implementation
 *   The previous workaround polled the MessageManager every 500 ms forever (and
 *   was duplicated across Component.js and NumericInputGuard.js). This version is
 *   EVENT-DRIVEN: it hooks the UI5 core parse/validation error events and only
 *   acts when an error is raised against one of the FK fields — no polling, no
 *   duplication, and it cannot mask unrelated validation messages.
 *
 * Scope
 *   Only messages whose target references `bridge_ID` or `inspection_ID` are
 *   removed. All other validation messages are left untouched.
 */
(function () {
  "use strict";

  var FK_TOKENS = ["bridge_ID", "inspection_ID"];

  function isFkTarget(value) {
    if (!value) return false;
    var s = String(value);
    return FK_TOKENS.some(function (token) { return s.indexOf(token) !== -1; });
  }

  function getMessageManager() {
    var core = window.sap && sap.ui && sap.ui.getCore && sap.ui.getCore();
    return core && core.getMessageManager ? core.getMessageManager() : null;
  }

  // Remove only the FK parse/validation messages currently held by the manager.
  function removeFkMessages() {
    var mgr = getMessageManager();
    if (!mgr) return;
    var msgs = (mgr.getMessageModel().getData() || []);
    var stale = msgs.filter(function (m) { return m && isFkTarget(m.target); });
    if (stale.length) { mgr.removeMessages(stale); }
  }

  function bindingPathOf(control) {
    if (!control || !control.getBinding) return "";
    var binding = control.getBinding("value") || control.getBinding("selectedKey");
    return binding && binding.getPath ? binding.getPath() : "";
  }

  // Fired by the UI5 core exactly when a parse/validation error is raised.
  function onValidationIssue(evt) {
    var element = evt.getParameter("element");
    var property = evt.getParameter("property");
    if (isFkTarget(bindingPathOf(element)) || isFkTarget(property)) {
      // Defer one tick so UI5 finishes registering the message before we strip it.
      setTimeout(removeFkMessages, 0);
    }
  }

  function init() {
    var core = window.sap && sap.ui && sap.ui.getCore && sap.ui.getCore();
    if (!core || !core.attachParseError) {
      // Core not ready yet — retry shortly (bounded, one-shot until ready).
      setTimeout(init, 200);
      return;
    }
    core.attachParseError(onValidationIssue);
    core.attachValidationError(onValidationIssue);
    // Exposed for tests / manual invocation; not used in the steady state.
    window._bmsFkMessageGuardClear = removeFkMessages;
  }

  init();
}());
