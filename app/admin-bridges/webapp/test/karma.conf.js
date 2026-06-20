// Karma + karma-ui5 runner for the admin-bridges OPA5 smoke journey (ConfigScreensJourney).
// Council P1-4 / SAP-cert (UI test automation D4/D17): runs the Fiori Elements OPA tests
// headlessly in CI. Requires devDeps: karma, karma-ui5, karma-chrome-launcher (added to the
// root package.json). Invoked via `npm run test:opa`, which starts `ui5 serve` then karma.
//
// NOTE: green headless execution is validated in the CI runner (ubuntu + Chrome). The
// canonical karma-ui5 "application" config below is the SAP-standard pattern; see
// https://github.com/SAP/karma-ui5 and the FE JourneyRunner docs.
module.exports = function (config) {
  config.set({
    // This config lives in webapp/test/, but the UI5 app root is app/admin-bridges/, so
    // basePath must point back two levels — otherwise karma-ui5 resolves `webapp` relative
    // to webapp/test/ and reports "webapp <-- Not found".
    basePath: "../..",
    frameworks: ["ui5"],
    ui5: {
      type: "application",
      paths: { webapp: "webapp" },
      // admin-bridges/ui5.yaml has no `framework:` block, so karma-ui5 cannot resolve a UI5
      // runtime on its own → point it at the public CDN (reachable in CI). Keeps the OPA
      // smoke runnable headless without bundling the SDK. Overridable via UI5_CDN_URL.
      url: process.env.UI5_CDN_URL || "https://ui5.sap.com",
      // Run only the OPA suite (not unit), against the served app.
      testpage: "webapp/test/opaTests.qunit.html"
    },
    // No-sandbox launcher by default — required on CI runners, harmless locally.
    browsers: ["ChromeHeadlessCI"],
    customLaunchers: {
      ChromeHeadlessCI: { base: "ChromeHeadless", flags: ["--no-sandbox", "--disable-gpu"] }
    },
    reporters: ["progress"],
    singleRun: true,
    browserConsoleLogOptions: { level: "error" }
  });
};
