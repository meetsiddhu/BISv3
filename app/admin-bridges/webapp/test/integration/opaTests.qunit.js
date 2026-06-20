sap.ui.define([
	"sap/fe/test/JourneyRunner",
	"./ConfigScreensJourney"
], function (JourneyRunner, ConfigScreensJourney) {
	"use strict";

	// OPA5 smoke tests for the admin-bridges Fiori Elements app (certification: D4/D17).
	// Validates the annotation-based List Report screens load and render their tables —
	// the Phase-1 config screens (RiskBand, RiskConfig, AssetClassStrategy, SystemConfig)
	// plus the bridge register. Run headlessly with: `ui5 test` / karma against a started
	// app, or open opaTests.qunit.html in a browser. Extend per journey as screens migrate.
	var runner = new JourneyRunner({
		launchUrl: sap.ui.require.toUrl("BridgeManagement/adminbridges") + "/index.html"
	});

	runner.run({ journey: ConfigScreensJourney });
});
