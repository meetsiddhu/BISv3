sap.ui.define([], function () {
  "use strict";

  // Centralised data-access for the configurable-attributes admin page.
  // Keeps all OData calls in one module so the controller stays UI-only and the
  // backing service can be swapped/extended without touching the view logic.
  // URL/key/filter formats match the proven AdminService OData V4 conventions.

  function strip(base) { return (base || "").replace(/\/$/, ""); }

  function handle(response) {
    if (!response.ok && response.status !== 204) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        throw new Error((body.error && body.error.message) || response.statusText || ("HTTP " + response.status));
      });
    }
    return response.status === 204 ? null : response.json();
  }

  function get(url)        { return fetch(url).then(handle); }
  function post(url, body) { return fetch(url, { method: "POST",   headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(handle); }
  function patch(url, body){ return fetch(url, { method: "PATCH",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(handle); }
  function del(url)        { return fetch(url, { method: "DELETE" }).then(handle); }

  return function AttributeService(adminBase, attrBase) {
    var A = strip(adminBase);
    var X = strip(attrBase);

    return {
      adminBase: A,
      attrBase: X,

      // ── Groups ───────────────────────────────────────────────────────────
      listGroups: function (objectType) {
        return get(A + "/AttributeGroups?$filter=objectType eq '" + objectType + "'&$orderby=displayOrder")
          .then(function (d) { return d.value || []; });
      },
      createGroup: function (data) { return post(A + "/AttributeGroups", data); },
      updateGroup: function (id, data) { return patch(A + "/AttributeGroups('" + id + "')", data); },
      deleteGroup: function (id) { return del(A + "/AttributeGroups('" + id + "')"); },

      // ── Attribute definitions ────────────────────────────────────────────
      listAttributes: function (groupId) {
        return get(A + "/AttributeDefinitions?$filter=group_ID eq '" + groupId + "'&$orderby=displayOrder")
          .then(function (d) { return d.value || []; });
      },
      getAttribute: function (id) { return get(A + "/AttributeDefinitions('" + id + "')"); },
      createAttribute: function (data) { return post(A + "/AttributeDefinitions", data); },
      updateAttribute: function (id, data) { return patch(A + "/AttributeDefinitions('" + id + "')", data); },
      deleteAttribute: function (id) { return del(A + "/AttributeDefinitions('" + id + "')"); },

      // ── Allowed values ───────────────────────────────────────────────────
      listAllowedValues: function (attrId) {
        return get(A + "/AttributeAllowedValues?$filter=attribute_ID eq '" + attrId + "'&$orderby=displayOrder")
          .then(function (d) { return d.value || []; });
      },
      createAllowedValue: function (data) { return post(A + "/AttributeAllowedValues", data); },
      updateAllowedValue: function (id, data) { return patch(A + "/AttributeAllowedValues('" + id + "')", data); },
      deleteAllowedValue: function (id) { return del(A + "/AttributeAllowedValues('" + id + "')"); },

      // ── Per-object-type configuration ────────────────────────────────────
      listConfigs: function (attrId) {
        return get(A + "/AttributeObjectTypeConfig?$filter=attribute_ID eq '" + attrId + "'")
          .then(function (d) { return d.value || []; });
      },
      createConfig: function (data) { return post(A + "/AttributeObjectTypeConfig", data); },
      updateConfig: function (id, data) { return patch(A + "/AttributeObjectTypeConfig('" + id + "')", data); },

      // ── Bulk template + import (mass create / maintain values) ─────────────
      templateUrl: function (objectType) {
        return X + "/template?objectType=" + encodeURIComponent(objectType) + "&format=xlsx";
      },
      // Upload a filled template to bulk create/update attribute values.
      // mode: 'all' (abort on any error) | 'skip' (import valid rows, skip errors).
      importValues: function (objectType, fileName, contentBase64, mode) {
        return fetch(X + "/import?objectType=" + encodeURIComponent(objectType), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": "bms-import" },
          body: JSON.stringify({ fileName: fileName, contentBase64: contentBase64, mode: mode || "skip" })
        }).then(handle);
      }
    };
  };
});
