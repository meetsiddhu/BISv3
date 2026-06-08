sap.ui.define([], function () {
  "use strict";

  // Tiny OData V4 CRUD helper for the BMS-admin config screens. Mirrors the existing
  // fetch()-based pattern (GisConfig), but surfaces the server's structured error message
  // (e.g. a @restrict 403 or a soft-delete/referential reject) instead of a bare statusText.
  function strip(base) { return (base || "").replace(/\/$/, ""); }

  function handle(res) {
    if (res.ok) { return res.status === 204 ? null : res.json(); }
    return res.json().catch(function () { return {}; }).then(function (body) {
      var msg = (body && body.error && body.error.message) || res.statusText || ("HTTP " + res.status);
      var err = new Error(msg); err.status = res.status; throw err;
    });
  }

  return function (adminBase) {
    var A = strip(adminBase);
    var H = { "Content-Type": "application/json", "Accept": "application/json" };
    return {
      base: A,
      list: function (set, query) {
        return fetch(A + "/" + set + (query || ""), { headers: { Accept: "application/json" }, credentials: "same-origin" })
          .then(handle).then(function (d) { return (d && d.value) || []; });
      },
      // key must be the full predicate contents, already quoted for string keys, e.g. "'VeryHigh'".
      create: function (set, body) {
        return fetch(A + "/" + set, { method: "POST", headers: H, credentials: "same-origin", body: JSON.stringify(body) }).then(handle);
      },
      update: function (set, key, body) {
        return fetch(A + "/" + set + "(" + key + ")", { method: "PATCH", headers: H, credentials: "same-origin", body: JSON.stringify(body) }).then(handle);
      }
    };
  };
});
