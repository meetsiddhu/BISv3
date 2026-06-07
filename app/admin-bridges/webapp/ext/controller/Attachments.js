sap.ui.define([
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (JSONModel, MessageBox, MessageToast) {
  "use strict";

  function getAdminBridgesBase(control) {
    var oComp = sap.ui.core.Component.getOwnerComponentFor(control);
    if (!oComp) { return "/admin-bridges/api"; }
    var uri = oComp.getManifestEntry("/sap.app/dataSources/AdminBridgesService/uri") || "/admin-bridges/api/";
    return uri.replace(/\/$/, "");
  }

  function getHost(control) {
    var current = control;
    while (current && !(current.isA && current.isA("sap.m.VBox"))) {
      current = current.getParent && current.getParent();
    }
    return current || control;
  }

  function getModel(host) {
    var model = host.getModel("attachments");
    if (!model) {
      model = new JSONModel({
        busy: false,
        bridgeId: null,
        items: []
      });
      host.setModel(model, "attachments");
    }
    return model;
  }

  function getBridgeIdFromPath(path) {
    var match = String(path || "").match(/ID=([0-9]+)/) || String(path || "").match(/Bridges\(([0-9]+)\)/);
    return match ? match[1] : null;
  }

  function getBridgeIdFromHash() {
    var hash = decodeURIComponent(window.location.hash || "");
    return getBridgeIdFromPath(hash);
  }

  function getBridgeId(host) {
    var context = host.getBindingContext();
    if (!context) return null;
    var id = context.getProperty && context.getProperty("ID");
    if (id != null) return String(id);
    return getBridgeIdFromPath(context.getPath && context.getPath()) || getBridgeIdFromHash();
  }

  async function resolveBridgeId(host) {
    var bridgeId = getBridgeId(host);
    if (bridgeId) return bridgeId;

    var context = host.getBindingContext();
    if (!context) return getBridgeIdFromHash();

    if (context.requestProperty) {
      var id = await context.requestProperty("ID");
      if (id != null) return String(id);
    }

    if (context.requestObject) {
      var object = await context.requestObject();
      if (object && object.ID != null) return String(object.ID);
    }

    return getBridgeIdFromPath(context.getPath && context.getPath()) || getBridgeIdFromHash();
  }

  async function readJsonResponse(response) {
    var text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_error) {
      return {
        error: {
          message: text
        }
      };
    }
  }

  function formatSize(size) {
    var bytes = Number(size || 0);
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (event) {
        var result = String(event.target.result || "");
        resolve(result.split(",").pop() || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getSelectedFile(event) {
    var files = event.getParameter("files") || [];
    if (files[0]) return files[0];

    var uploader = event.getSource();
    var input = uploader && uploader.getFocusDomRef && uploader.getFocusDomRef();
    if (input && input.files && input.files[0]) return input.files[0];

    var dom = uploader && uploader.getDomRef && uploader.getDomRef();
    var fileInput = dom && dom.querySelector && dom.querySelector("input[type='file']");
    return fileInput && fileInput.files && fileInput.files[0] || null;
  }

  async function load(host) {
    var model = getModel(host);
    var bridgeId = await resolveBridgeId(host);
    if (!bridgeId) return;

    model.setProperty("/bridgeId", bridgeId);
    model.setProperty("/busy", true);
    try {
      var sBase = getAdminBridgesBase(host);
      var response = await fetch(sBase + "/bridges/" + encodeURIComponent(bridgeId) + "/attachments");
      var payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.error && payload.error.message || "Failed to load attachments");
      }
      var items = (payload.attachments || []).map(function (item) {
        return Object.assign({}, item, {
          fileSizeText: formatSize(item.fileSize),
          createdAtText: formatDate(item.createdAt)
        });
      });
      model.setProperty("/items", items);
    } catch (error) {
      MessageBox.error(error.message || "Failed to load attachments");
    } finally {
      model.setProperty("/busy", false);
    }
  }

  function getItem(event) {
    return event.getSource().getBindingContext("attachments").getObject();
  }

  return {
    onContextChange: async function (event) {
      var host = event.getSource();
      var model = getModel(host);
      var bridgeId = await resolveBridgeId(host);
      if (bridgeId && bridgeId !== model.getProperty("/bridgeId")) {
        load(host);
      }
    },

    onRefresh: function (event) {
      load(getHost(event.getSource()));
    },

    onFileChange: async function (event) {
      var uploader = event.getSource();
      var host = getHost(uploader);
      var model = getModel(host);
      var file = getSelectedFile(event);

      if (!file) {
        MessageBox.error("No file was selected.");
        return;
      }

      model.setProperty("/busy", true);
      try {
        var bridgeId = model.getProperty("/bridgeId") || await resolveBridgeId(host);
        if (!bridgeId) {
          throw new Error("Save the bridge before uploading attachments.");
        }
        if (file.size > 75 * 1024 * 1024) {
          throw new Error("This file is too large for browser upload. Use a file smaller than 75 MB.");
        }
        var contentBase64 = await readFileAsBase64(file);
        var sBase = getAdminBridgesBase(host);
        var response = await fetch(sBase + "/bridges/" + encodeURIComponent(bridgeId) + "/attachments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fileName: file.name,
            mediaType: file.type || "application/octet-stream",
            fileSize: file.size,
            contentBase64: contentBase64
          })
        });
        var payload = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(payload.error && payload.error.message || "Upload failed");
        }
        uploader.clear();
        MessageToast.show("Attachment uploaded");
        await load(host);
      } catch (error) {
        MessageBox.error(error.message || "Upload failed");
      } finally {
        model.setProperty("/busy", false);
      }
    },

    onOpen: function (event) {
      var item = getItem(event);
      window.open(item.openUrl, "_blank", "noopener");
    },

    onDownload: function (event) {
      var item = getItem(event);
      window.open(item.downloadUrl, "_blank", "noopener");
    },

    onDelete: function (event) {
      var source = event.getSource();
      var host = getHost(source);
      var item = getItem(event);
      MessageBox.confirm("Delete this attachment?", {
        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.DELETE,
        onClose: async function (action) {
          if (action !== MessageBox.Action.DELETE) return;
          var model = getModel(host);
          model.setProperty("/busy", true);
          try {
            var response = await fetch(item.deleteUrl, { method: "DELETE" });
            if (!response.ok) {
              var payload = await response.json().catch(function () { return {}; });
              throw new Error(payload.error && payload.error.message || "Delete failed");
            }
            MessageToast.show("Attachment deleted");
            await load(host);
          } catch (error) {
            MessageBox.error(error.message || "Delete failed");
          } finally {
            model.setProperty("/busy", false);
          }
        }
      });
    }
  };
});
