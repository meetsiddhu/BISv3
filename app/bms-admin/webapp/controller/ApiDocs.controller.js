sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
  "use strict";

  function ep(method, path, desc) {
    return { method, path, desc, methodState: method === "GET" ? "Success" : method === "POST" ? "Warning" : method === "PATCH" ? "Information" : "Error" };
  }

  return Controller.extend("BridgeManagement.bmsadmin.controller.ApiDocs", {

    onInit: function () {
      this.getView().setModel(new JSONModel({
        qualityEndpoints: [
          ep("GET",  "/quality/api/summary",   "Quality scorecard: totalBridges, criticalCount, warningCount, completenessPercent, byCategory[]"),
          ep("GET",  "/quality/api/issues",     "Bridges with issues. Query: ?severity=critical|warning|info &state=NSW &name=partialName")
        ],
        uploadEndpoints: [
          ep("GET",  "/mass-upload/api/datasets",       "List available upload datasets (bridges, lookups…)"),
          ep("GET",  "/mass-upload/api/template.xlsx",  "Download Excel template for the bridges dataset"),
          ep("GET",  "/mass-upload/api/template.csv",   "Download CSV template. Query: ?dataset=:name"),
          ep("POST", "/mass-upload/api/validate",       "Validate file without persisting. Body: { fileName, contentBase64, dataset }"),
          ep("POST", "/mass-upload/api/upload",         "Upsert rows: bridges matched by bridgeId. Body: { fileName, contentBase64, dataset }. Returns { total, inserted, updated, skipped, errors[] }")
        ],
        mapEndpoints: [
          ep("GET",  "/map/api/bridges",     "Bridges in bounding box with restriction summary. Query: ?bbox=minLon,minLat,maxLon,maxLat"),
          ep("GET",  "/map/api/restrictions","Active restrictions in bounding box. Query: ?bbox=…"),
          ep("GET",  "/map/api/clusters",    "Grid-clustered bridge counts for map zoom levels. Query: ?bbox=… &zoom=:n"),
          ep("GET",  "/map/api/proximity",   "Bridges within radius. Query: ?lat=… &lng=… &radius=:km"),
          ep("GET",  "/map/api/export",      "Export as GeoJSON or CSV. Query: ?format=geojson|csv &layer=bridges|restrictions &bbox=…"),
          ep("GET",  "/map/api/config",      "GIS config (basemap, feature toggles, reference layers)")
        ],
        massEditEndpoints: [
          ep("GET",  "/mass-edit/api/lookups",          "All reference lists for the mass-edit grid"),
          ep("GET",  "/mass-edit/api/bridges",          "All bridges for mass-edit"),
          ep("GET",  "/mass-edit/api/restrictions",     "All restrictions for mass-edit"),
          ep("POST", "/mass-edit/api/bridges/save",     "Batch update bridges. Body: { changes: [{ID, field, newValue}] }"),
          ep("POST", "/mass-edit/api/restrictions/save","Batch update restrictions. Body: { changes: [{ID, field, newValue}] }")
        ],
        auditEndpoints: [
          ep("GET",  "/audit/api/changes",  "Field-level change log. Query: ?objectType=Bridge|Restriction|BridgeRestriction|BridgeCapacity &objectId=:uuid &user=:email &source=OData|MassEdit|MassUpload &from=:date &to=:date &batchId=:uuid"),
          ep("GET",  "/audit/api/summary",  "Audit summary: totalChanges, byObjectType[], bySource[], topUsers[]")
        ],
        accessEndpoints: [
          ep("GET",  "/access/api/activity", "Last 200 users by most-recent action (userId, lastSeenAt, lastPath, totalActions)"),
          ep("GET",  "/access/api/summary",  "Engagement KPIs: totalUsers, activeToday, activeThisWeek")
        ],
        attachmentEndpoints: [
          ep("GET",    "/admin-bridges/api/bridges/:bridgeId/attachments",                         "List all attachments for a bridge"),
          ep("POST",   "/admin-bridges/api/bridges/:bridgeId/attachments",                         "Upload attachment. Body: { fileName, mediaType, fileSize, contentBase64 }. Max 75 MB."),
          ep("GET",    "/admin-bridges/api/bridges/:bridgeId/attachments/:attachmentId/content",   "Stream attachment content (view in browser)"),
          ep("DELETE", "/admin-bridges/api/bridges/:bridgeId/attachments/:attachmentId",           "Delete attachment permanently"),
          ep("GET",    "/admin-bridges/api/bridges/export",                                        "Download all bridges as CSV. Returns dated file: bridges-export-YYYY-MM-DD.csv (22 fields)")
        ],
        systemEndpoints: [
          ep("GET",   "/health",                 "BTP health probe (no auth). Returns { status: 'UP', ts, version, env }. Used by load balancers and CF health checks."),
          ep("GET",   "/system/api/config",      "All SystemConfig key/value pairs"),
          ep("PATCH", "/system/api/config/:key", "Update a config value. Body: { value: '...' }"),
          ep("GET",   "/system/api/banner",      "Maintenance banner status: { active: bool, message: string }")
        ],
        attributeEndpoints: [
          ep("GET",  "/attributes/api/config",                        "Attribute groups and definitions for an object type. Query: ?objectType=bridge|restriction"),
          ep("GET",  "/attributes/api/values/:objectType/:objectId",  "Current attribute values for an object"),
          ep("POST", "/attributes/api/values/:objectType/:objectId",  "Save attribute values. Body: { values: { key: value } }"),
          ep("GET",  "/attributes/api/history/:objectType/:objectId/:key", "Change history for one attribute field")
        ]
      }));
    }
  });
});
