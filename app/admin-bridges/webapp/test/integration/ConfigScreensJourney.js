/* global QUnit */
sap.ui.define([
	"sap/ui/test/opaQunit"
], function (opaTest) {
	"use strict";

	// Smoke journey — the Phase-1 annotation-based Fiori Elements config screens must
	// load and show their List Report tables. These are the screens migrated off the
	// freestyle bms-admin shell. Each step uses generic FE List Report assertions so the
	// journey stays valid as columns evolve. Extend with field-level checks during UAT.
	return {
		run: function () {
			QUnit.module("admin-bridges — config screens (Phase 1 FE)");

			opaTest("Risk Bands list loads and renders a table", function (Given, When, Then) {
				Given.iStartMyApp({ hash: "RiskBand" });
				Then.onTheListReportPage.iSeeTheTable();
				Then.iTeardownMyApp();
			});

			opaTest("Risk Factors list loads", function (Given, When, Then) {
				Given.iStartMyApp({ hash: "RiskConfig" });
				Then.onTheListReportPage.iSeeTheTable();
				Then.iTeardownMyApp();
			});

			opaTest("Asset Class Strategy list loads", function (Given, When, Then) {
				Given.iStartMyApp({ hash: "AssetClassStrategy" });
				Then.onTheListReportPage.iSeeTheTable();
				Then.iTeardownMyApp();
			});

			opaTest("System Settings list loads", function (Given, When, Then) {
				Given.iStartMyApp({ hash: "SystemConfig" });
				Then.onTheListReportPage.iSeeTheTable();
				Then.iTeardownMyApp();
			});
		}
	};
});
