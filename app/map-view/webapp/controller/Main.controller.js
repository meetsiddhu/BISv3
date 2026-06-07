sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/Switch",
  "sap/m/Text",
  "sap/m/Button",
  "sap/m/Popover",
  "sap/m/ScrollContainer",
  "sap/ui/core/Icon",
  "sap/m/Title",
  "sap/m/Label"
], function (
  Controller,
  JSONModel,
  MessageBox,
  MessageToast,
  Dialog,
  VBox,
  HBox,
  Switch,
  Text,
  Button,
  Popover,
  ScrollContainer,
  Icon,
  Title,
  Label
) {
  "use strict";

  const AUSTRALIA_BOUNDS = [[-44.5, 112], [-9, 154.5]];
  const STATE_OPTIONS = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT"];
  const POSTING_STATUS_OPTIONS = ["Unrestricted", "Restricted", "Closed", "Under Review"];
  const ROUTE_FLAGS = [
    { key: "freightRoute", label: "Freight Route" },
    { key: "overMassRoute", label: "Over Mass Route" },
    { key: "hmlApproved", label: "HML Approved" },
    { key: "bDoubleApproved", label: "B-Double Approved" }
  ];
  const TILE_LAYERS = {
    osm: {
      label: "OpenStreetMap",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: { maxZoom: 19, attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors" }
    },
    esriStreet: {
      label: "Esri Street",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      options: { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" }
    },
    esriSatellite: {
      label: "Esri Satellite",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      options: { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS" }
    },
    esriTopo: {
      label: "Esri Topo",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      options: { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ" }
    },
    google: {
      label: "Google Maps",
      url: "https://mt{s}.google.com/vt/lyrs=r&x={x}&y={y}&z={z}",
      options: { maxZoom: 20, attribution: "&copy; Google", subdomains: "0123" }
    },
    googleSat: {
      label: "Google Satellite",
      url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      options: { maxZoom: 20, attribution: "&copy; Google", subdomains: "0123" }
    },
    here: {
      label: "HERE Maps",
      url: "https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png?apiKey={hereApiKey}",
      options: { maxZoom: 20, attribution: "&copy; HERE", hereApiKey: "" }
    }
  };

  // Legacy alias so any saved basemap preference "street"/"satellite" still resolves
  TILE_LAYERS.street = TILE_LAYERS.osm;
  TILE_LAYERS.satellite = TILE_LAYERS.esriSatellite;

  const REFERENCE_LAYERS = {
    stateBoundaries: {
      label: "State & Territory Boundaries",
      type: "wms",
      url: "https://geo.abs.gov.au/arcgis/services/ASGS2021/STE_2021_AUST/MapServer/WMSServer",
      options: {
        layers: "STE_2021_AUST",
        format: "image/png",
        transparent: true,
        opacity: 0.75,
        attribution: "State Boundaries &copy; ABS ASGS 2021"
      }
    },
    lgaBoundaries: {
      label: "LGA Boundaries",
      type: "wms",
      url: "https://geo.abs.gov.au/arcgis/services/ASGS2021/LGA_2021_AUST/MapServer/WMSServer",
      options: {
        layers: "LGA_2021_AUST",
        format: "image/png",
        transparent: true,
        opacity: 0.55,
        attribution: "LGA Boundaries &copy; ABS ASGS 2021"
      }
    }
  };
  const HILLSHADE_LAYER = {
    url: "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 18,
      opacity: 0.35,
      attribution: "Hillshade &copy; Esri"
    }
  };

  return Controller.extend("BridgeManagement.mapview.controller.Main", {
    onInit: function () {
      document.body.classList.add("bridgeMapFullBleed");

      this._selectionShape = null;
      this._drawMode = null;
      this._markerIndex = new Map();
      this._plainMarkerLayer = null;
      this._clusterLayer = null;
      this._restrictionMarkerGroup = null;
      this._selectionLayer = null;
      this._hillshadeLayer = null;
      this._refLayerInstances = {};
      this._layerDialog = null;
      this._mapInitAttempts = 0;
      this._mapInitScheduled = false;
      this._viewportDebounce = null;

      this.getView().setModel(new JSONModel({
        busy: true,
        fclLayout: "TwoColumnsMidExpanded",
        panelOpen: true,
        panelToggleTooltip: "Close Filters & Layers panel",
        drawToolbarVisible: false,
        showList: false,
        bridgeCountText: "0 bridges",
        listTitleText: "0 visible bridges",
        coordinateText: "",
        showFilters: true,
        layoutMode: "map",
        colorBy: "condition",
        basemap: "street",
        allBridges: [],
        filteredBridges: [],
        bridges: [],
        totalBridges: 0,
        summaryText: "0 of 0 bridges",
        selectedBridge: null,
        selectedRestrictions: [],
        detailOpen: false,
        selectionActive: false,
        selectionCount: 0,
        selectionLabel: "",
        selectedFeature: null,
        featurePanelOpen: false,
        viewportMode: false,
        filters: {
          minCondition: 1,
          maxCondition: 10,
          minYear: 1900,
          maxYear: new Date().getFullYear()
        },
        limits: {
          minCondition: 1,
          maxCondition: 10,
          minYear: 1900,
          maxYear: new Date().getFullYear()
        },
        filterOptions: {
          states: [],
          postingStatuses: [],
          structureTypes: [],
          routeFlags: [],
          vehicleClasses: []
        },
        layers: {
          bridges: {
            visible: true,
            cluster: true,
            showLabels: false,
            colorBy: "condition",
            count: 0
          },
          restrictions: {
            visible: false,
            activeOnly: true,
            count: 0
          },
          showLegend: true,
          showHillshade: false,
          refLayers: {
            stateBoundaries: false,
            lgaBoundaries: false
          }
        },
        restrictionsData: [],
        gisConfig: null,
        demoModeActive: false,
        dynRefLayers: [],
        dynRefGroups: [],
        features: {
          scaleBar: true, gps: true, minimap: true,
          heatmap: false, timeSlider: false, statsPanel: true,
          proximity: true, mgaCoords: true, streetView: true,
          conditionAlerts: true, customWms: false, serverClustering: false,
          showStateBoundaries: true, showLgaBoundaries: true
        },
        heatmapActive: false,
        conditionAlertsActive: false,
        minimapActive: false,
        stats: { total: 0, avgCondition: "-", poor: 0, restricted: 0, closed: 0 },
        mgaCoords: { zone: 0, easting: 0, northing: 0, text: "" },
        proximity: {
          active: false, loading: false, lat: "", lng: "", radius: 10,
          results: [], count: 0
        },
        timeSlider: {
          active: false,
          fromYear: 1900,
          toYear: new Date().getFullYear()
        }
      }), "view");

      this._leafletReady = this._ensureLeaflet();
      this._loadGisConfig();
      this._loadDynamicRefLayers();
      this._loadData();
    },

    onExit: function () {
      document.body.classList.remove("bridgeMapFullBleed");
    },

    onAfterRendering: function () {
      // FE-002 (WCAG 4.1.3): mark the live coordinate bar as a polite status region so
      // screen readers announce Lat/Lng updates without moving focus. Re-applied on every
      // render of the bar (it re-renders when coordinateText changes).
      var oCoordBar = this.byId("coordinateBar");
      if (oCoordBar && !oCoordBar._a11yBound) {
        oCoordBar._a11yBound = true;
        oCoordBar.addEventDelegate({
          onAfterRendering: function () {
            var dom = oCoordBar.getDomRef();
            if (dom) {
              dom.setAttribute("role", "status");
              dom.setAttribute("aria-live", "polite");
              dom.setAttribute("aria-atomic", "true");
              dom.setAttribute("aria-label", "Current map coordinates");
            }
          }
        });
      }
      this._leafletReady
        .then(function () {
          this._scheduleMapInit();
        }.bind(this))
        .catch(function (error) {
          const detail = error && error.message ? "\n\n" + error.message : "";
          MessageBox.error(this._text("leafletError") + detail);
        }.bind(this));
    },

    onToggleFilters: function () {
      const model = this._vm();
      model.setProperty("/showFilters", !model.getProperty("/showFilters"));
      setTimeout(this._invalidateMap.bind(this), 80);
    },

    onNavHome: function () {
      this._navTo("#Dashboard-display");
    },

    onCenterMap: function () {
      if (this._leafletMap) {
        this._leafletMap.fitBounds(AUSTRALIA_BOUNDS);
      }
    },

    onTogglePanel: function () {
      const model = this._vm();
      const open = !model.getProperty("/panelOpen");
      const featureOpen = model.getProperty("/featurePanelOpen");
      model.setProperty("/panelOpen", open);
      let layout;
      if (featureOpen) {
        layout = open ? "ThreeColumnsMidExpanded" : "TwoColumnsEndExpanded";
      } else {
        layout = open ? "TwoColumnsMidExpanded" : "MidColumnFullScreen";
      }
      model.setProperty("/fclLayout", layout);
      model.setProperty("/panelToggleTooltip", open ? "Close Filters & Layers panel" : "Open Filters & Layers panel");
      setTimeout(this._invalidateMap.bind(this), 120);
    },

    onToggleDrawToolbar: function () {
      const model = this._vm();
      model.setProperty("/drawToolbarVisible", !model.getProperty("/drawToolbarVisible"));
    },

    onCloseDrawToolbar: function () {
      this._vm().setProperty("/drawToolbarVisible", false);
    },

    onClearSelection: function () {
      this.onClearDrawing();
    },

    onToggleSplitView: function (oEvent) {
      const showList = Boolean(oEvent.getParameter("pressed"));
      const model = this._vm();
      model.setProperty("/showList", showList);
      model.setProperty("/layoutMode", showList ? "split" : "map");
      setTimeout(this._invalidateMap.bind(this), 120);
    },

    onZoomAll: function () {
      this._renderMarkers(true);
    },

    onZoomSelected: function () {
      const bridges = this._vm().getProperty("/bridges") || [];
      if (!this._leafletMap || !bridges.length) {
        return;
      }

      const bounds = window.L.latLngBounds(bridges.map(function (bridge) {
        return [bridge.latitude, bridge.longitude];
      }));
      this._leafletMap.fitBounds(bounds.pad(0.18));
    },

    onRefresh: function () {
      MessageToast.show(this._text("refresh"));
      this._loadData();
    },

    onLayoutSelect: function (oEvent) {
      this._vm().setProperty("/layoutMode", oEvent.getParameter("item").getKey());
      this._applyLayoutMode();
    },

    onColorByChange: function (oEvent) {
      this._vm().setProperty("/colorBy", oEvent.getSource().getSelectedKey());
      this._renderMarkers(false);
    },

    onSymbologyChange: function (oEvent) {
      const item = oEvent.getParameter("item");
      const key = item ? item.getKey() : oEvent.getSource().getSelectedKey();
      this._vm().setProperty("/colorBy", key === "status" ? "status" : "condition");
      this._renderMarkers(false);
    },

    onBasemapChange: function (oEvent) {
      const source = oEvent.getSource();
      const customData = source.getCustomData && source.getCustomData()[0];
      const key = source.getSelectedKey ? source.getSelectedKey() : customData && customData.getValue();
      this._vm().setProperty("/basemap", key || "osm");
      this._applyBaseLayer();
    },

    onToggleClusterLayer: function (oEvent) {
      this._onLayerSwitchChange("clusterMarkers", oEvent);
    },

    onToggleLabelLayer: function (oEvent) {
      this._onLayerSwitchChange("showLabels", oEvent);
    },

    onToggleHillshadeLayer: function (oEvent) {
      this._onLayerSwitchChange("showHillshade", oEvent);
    },

    onToggleRefLayer: function (oEvent) {
      const source = oEvent.getSource();
      const layerKey = source.getCustomData && source.getCustomData()[0] && source.getCustomData()[0].getValue();
      if (!layerKey) return;
      // Switch fires "state"; CheckBox fires "selected"
      const visible = oEvent.getParameter("state") !== undefined
        ? oEvent.getParameter("state")
        : oEvent.getParameter("selected");
      this._vm().setProperty("/layers/refLayers/" + layerKey, visible);
      this._applyRefLayer(layerKey, visible);
    },

    _applyRefLayer: function (layerKey, visible) {
      if (!this._leafletMap || !window.L) return;
      const config = REFERENCE_LAYERS[layerKey];
      if (!config) return;

      if (visible) {
        if (!this._refLayerInstances[layerKey]) {
          this._refLayerInstances[layerKey] = window.L.tileLayer.wms(config.url, config.options);
        }
        this._refLayerInstances[layerKey].addTo(this._leafletMap);
      } else if (this._refLayerInstances[layerKey]) {
        this._leafletMap.removeLayer(this._refLayerInstances[layerKey]);
      }
    },

    onDrawPolygon: function () {
      this._activateDraw("polygon");
    },

    onDrawRectangle: function () {
      this._activateDraw("rectangle");
    },

    onDrawCircle: function () {
      this._activateDraw("circle");
    },

    onClearDrawing: function () {
      if (this._selectionLayer) {
        this._selectionLayer.clearLayers();
      }
      this._selectionShape = null;
      this._drawMode = null;
      this._vm().setProperty("/selectionActive", false);
      this._vm().setProperty("/selectionCount", 0);
      this._applyFilters();
    },

    onOpenLayerManager: function () {
      if (!this._layerDialog) {
        const content = new VBox({
          items: [
            this._layerRow("clusterMarkers", this._text("clusterMarkers")),
            this._layerRow("showLabels", this._text("showLabels")),
            this._layerRow("showLegend", this._text("showLegend")),
            this._layerRow("showHillshade", this._text("showHillshade"))
          ]
        });

        this._layerDialog = new Dialog({
          title: this._text("layerManager"),
          contentWidth: "24rem",
          content: [content],
          endButton: new Button({
            text: this._text("close"),
            press: function () {
              this._layerDialog.close();
            }.bind(this)
          })
        });

        this.getView().addDependent(this._layerDialog);
      }

      this._layerDialog.open();
    },

    onApplyFilters: function () {
      this._applyFilters();
      MessageToast.show(this._vm().getProperty("/summaryText"));
    },

    onClearFilters: function () {
      const model = this._vm();
      const limits = model.getProperty("/limits");
      const filterOptions = model.getProperty("/filterOptions");

      Object.keys(filterOptions).forEach(function (group) {
        (filterOptions[group] || []).forEach(function (item) {
          item.selected = false;
        });
      });

      model.setProperty("/filterOptions", filterOptions);
      model.setProperty("/filters", {
        minCondition: limits.minCondition,
        maxCondition: limits.maxCondition,
        minYear: limits.minYear,
        maxYear: limits.maxYear
      });

      this.onClearDrawing();
    },

    onBridgePress: function (oEvent) {
      this._focusBridge(oEvent.getSource().getBindingContext("view").getObject());
    },

    onBridgeSelectionChange: function (oEvent) {
      const item = oEvent.getParameter("listItem");
      if (item) {
        this._focusBridge(item.getBindingContext("view").getObject());
      }
    },

    onListSearch: function (oEvent) {
      const term = String(oEvent.getSource().getValue() || "").trim().toLowerCase();
      const bridges = this._activeBridges();
      const searched = !term ? bridges : bridges.filter(function (bridge) {
        return [bridge.bridgeId, bridge.bridgeName, bridge.state, bridge.region, bridge.route]
          .filter(Boolean)
          .some(function (value) {
            return String(value).toLowerCase().includes(term);
          });
      });

      this._vm().setProperty("/bridges", searched);
      this._vm().setProperty("/summaryText", searched.length + " of " + this._vm().getProperty("/totalBridges") + " bridges");
      this._renderMarkers(false);
    },

    onSearchBridge: function (oEvent) {
      this.onListSearch(oEvent);
    },

    onSearchLiveChange: function (oEvent) {
      this.onListSearch(oEvent);
    },

    onListSearchLive: function (oEvent) {
      this.onListSearch(oEvent);
    },

    onLocateBridgeOnMap: function (oEvent) {
      const bridge = oEvent.getSource().getBindingContext("view").getObject();
      this._focusBridge(bridge);
    },

    onCloseDetail: function () {
      this._vm().setProperty("/detailOpen", false);
    },

    onZoomToSelected: function () {
      this._focusBridge(this._vm().getProperty("/selectedBridge"));
    },

    onOpenBridgeDetail: function () {
      this._navTo("#Bridges-manage");
    },

    onListItemPress: function (oEvent) {
      const item = oEvent.getSource();
      this._focusBridge(item.getBindingContext("view").getObject());
    },

    onListItemDetail: function (oEvent) {
      const item = oEvent.getSource().getParent();
      this._focusBridge(item.getBindingContext("view").getObject());
    },

    onNavToDashboard: function () {
      this.onNavHome();
    },

    onNavToBridgesFE: function () {
      this._navTo("#Bridges-manage");
    },

    onNavToReports: function () {
      this._navTo("#Reports-display");
    },

    onNavToUpload: function () {
      this._navTo("#MassUpload-manage");
    },

    onNavToMassEdit: function () {
      this._navTo("#MassEdit-manage");
    },

    _navTo: function (hash) {
      try {
        const nav = sap && sap.ushell && sap.ushell.Container &&
          sap.ushell.Container.getService("CrossApplicationNavigation");
        if (nav) { nav.toExternal({ target: { shellHash: hash } }); return; }
      } catch (navigationError) { /* fall through */ }
      window.location.href = hash;
    },

    _layerRow: function (path, label) {
      return new HBox({
        justifyContent: "SpaceBetween",
        alignItems: "Center",
        items: [
          new Text({ text: label }),
          new Switch({
            state: "{view>/layers/" + path + "}",
            change: this._onLayerSwitchChange.bind(this, path)
          })
        ]
      });
    },

    _onLayerSwitchChange: function (path, oEvent) {
      const value = oEvent.getParameter("state");
      this._vm().setProperty("/layers/" + path, value == null ? oEvent.getParameter("selected") : value);
      this._applyLayerSettings();
    },

    _loadData: async function () {
      const model = this._vm();
      model.setProperty("/busy", true);

      try {
        const bbox = this._getViewportBbox();
        const bboxParam = bbox ? "?bbox=" + bbox : "";

        const [bridgeResp, restrictionResp] = await Promise.all([
          fetch("/map/api/bridges" + bboxParam),
          fetch("/map/api/restrictions" + bboxParam)
        ]);
        if (!bridgeResp.ok) {
          throw new Error("HTTP " + bridgeResp.status);
        }

        const bridgePayload = await bridgeResp.json();
        const restrictionPayload = restrictionResp.ok ? await restrictionResp.json() : { restrictions: [] };

        const bridges = (bridgePayload.bridges || []).map(this._normalizeBridge.bind(this));
        const restrictions = (restrictionPayload.restrictions || []).map(this._normalizeRestriction.bind(this));

        const yearValues = bridges.map(function (bridge) { return bridge.yearBuilt; }).filter(Number.isFinite);
        const limits = {
          minCondition: 1,
          maxCondition: 10,
          minYear: yearValues.length ? Math.min.apply(null, yearValues) : 1900,
          maxYear: yearValues.length ? Math.max.apply(null, yearValues) : new Date().getFullYear()
        };

        model.setProperty("/allBridges", bridges);
        model.setProperty("/totalBridges", bridges.length);
        model.setProperty("/limits", limits);
        model.setProperty("/filters", {
          minCondition: limits.minCondition,
          maxCondition: limits.maxCondition,
          minYear: limits.minYear,
          maxYear: limits.maxYear
        });
        model.setProperty("/filterOptions", this._buildFilterOptions(bridges));
        model.setProperty("/selectedBridge", bridges[0] || null);
        model.setProperty("/selectedRestrictions", bridges[0] ? bridges[0].restrictions : []);
        model.setProperty("/detailOpen", Boolean(bridges[0]));
        model.setProperty("/restrictionsData", restrictions);
        model.setProperty("/layers/restrictions/count", restrictions.length);
        model.setProperty("/layers/bridges/count", bridges.length);

        this._applyFilters();
        this._checkUrlParams();
      } catch (error) {
        console.error("[MapView] _loadData failed:", error);
        MessageBox.error(this._text("mapError") + "\n" + (error && error.message ? error.message : ""));
      } finally {
        model.setProperty("/busy", false);
      }
    },

    _normalizeBridge: function (bridge) {
      const conditionRating = Number.isFinite(Number(bridge.conditionRating)) ? Number(bridge.conditionRating) : null;
      const yearBuilt = Number.isFinite(Number(bridge.yearBuilt)) ? Number(bridge.yearBuilt) : null;
      const clearanceHeight = Number.isFinite(Number(bridge.clearanceHeight)) ? Number(bridge.clearanceHeight) : null;
      const spanLength = Number.isFinite(Number(bridge.spanLength)) ? Number(bridge.spanLength) : null;
      const postingStatus = bridge.postingStatus || "Unrestricted";

      return {
        ID: bridge.ID,
        bridgeId: bridge.bridgeId || "-",
        bridgeName: bridge.bridgeName || bridge.bridgeId || "Bridge",
        state: bridge.state || null,
        latitude: Number(bridge.latitude),
        longitude: Number(bridge.longitude),
        postingStatus: postingStatus,
        postingStatusLabel: this._postingStatusLabel(postingStatus),
        postingStatusState: postingStatus === "Closed" ? "Error" : (postingStatus === "Restricted" || postingStatus === "Under Review") ? "Warning" : "Success",
        conditionRating: conditionRating,
        yearBuilt: yearBuilt,
        structureType: bridge.structureType || null,
        route: bridge.route || null,
        region: bridge.region || null,
        clearanceHeight: clearanceHeight,
        spanLength: spanLength,
        spanLengthText: spanLength == null ? "-" : spanLength.toFixed(1) + " m",
        lastInspectionDate: bridge.lastInspectionDate || null,
        nhvrAssessed: !!bridge.nhvrAssessed,
        nhvrAssessedLabel: bridge.nhvrAssessed ? this._text("statusAssessed") : this._text("statusNotAssessed"),
        vehicleClass: bridge.vehicleClass || null,
        freightRoute: !!bridge.freightRoute,
        freightRouteLabel: bridge.freightRoute ? this._text("statusFreight") : this._text("freightNone"),
        overMassRoute: Boolean(bridge.overMassRoute),
        hmlApproved: Boolean(bridge.hmlApproved),
        bDoubleApproved: Boolean(bridge.bDoubleApproved),
        restrictions: bridge.restrictions || [],
        conditionBandLabel: this._conditionBandLabel(conditionRating),
        conditionState: this._conditionState(conditionRating),
        conditionColor: this._conditionColor(conditionRating),
        coordinateText: Number(bridge.latitude).toFixed(5) + ", " + Number(bridge.longitude).toFixed(5),
        metricRating: conditionRating == null ? "-" : String(conditionRating),
        metricClearance: clearanceHeight == null ? "-" : clearanceHeight.toFixed(1) + " m",
        metricYear: yearBuilt == null ? "-" : String(yearBuilt)
      };
    },

    _normalizeRestriction: function (restriction) {
      return {
        ID: restriction.ID,
        restrictionRef: restriction.restrictionRef || "-",
        bridgeRef: restriction.bridgeRef || "-",
        bridge_ID: restriction.bridge_ID,
        bridgeId: restriction.bridgeId || "-",
        bridgeName: restriction.bridgeName || "Bridge",
        state: restriction.state || null,
        latitude: Number(restriction.latitude),
        longitude: Number(restriction.longitude),
        restrictionType: restriction.restrictionType || null,
        restrictionCategory: restriction.restrictionCategory || null,
        restrictionValue: restriction.restrictionValue || null,
        restrictionUnit: restriction.restrictionUnit || null,
        restrictionStatus: restriction.restrictionStatus || null,
        restrictionStatusLabel: restriction.restrictionStatus || "Active",
        restrictionStatusState: restriction.restrictionStatus === "Active" ? "Success" : "Warning",
        grossMassLimit: restriction.grossMassLimit,
        axleMassLimit: restriction.axleMassLimit,
        heightLimit: restriction.heightLimit,
        speedLimit: restriction.speedLimit,
        permitRequired: Boolean(restriction.permitRequired),
        escortRequired: Boolean(restriction.escortRequired),
        effectiveFrom: restriction.effectiveFrom || null,
        effectiveTo: restriction.effectiveTo || null,
        approvedBy: restriction.approvedBy || null,
        direction: restriction.direction || null,
        remarks: restriction.remarks || null,
        severityColor: this._restrictionSeverityColor(restriction),
        severityClass: this._restrictionSeverityClass(restriction)
      };
    },

    _restrictionSeverityColor: function (restriction) {
      if (restriction.restrictionStatus === "Active" && (restriction.grossMassLimit || restriction.axleMassLimit)) return "#ef4444";
      if (restriction.heightLimit || restriction.speedLimit) return "#f59e0b";
      return "#6366f1";
    },

    _restrictionSeverityClass: function (restriction) {
      if (restriction.restrictionStatus === "Active" && (restriction.grossMassLimit || restriction.axleMassLimit)) return "critical";
      if (restriction.heightLimit || restriction.speedLimit) return "warning";
      return "info";
    },

    _renderRestrictionMarkers: function () {
      if (!this._leafletMap) return;
      const layers = this._vm().getProperty("/layers");
      if (!this._restrictionMarkerGroup) {
        this._restrictionMarkerGroup = window.L.layerGroup();
      }
      this._restrictionMarkerGroup.clearLayers();
      if (!layers.restrictions.visible) {
        if (this._leafletMap.hasLayer(this._restrictionMarkerGroup)) {
          this._leafletMap.removeLayer(this._restrictionMarkerGroup);
        }
        return;
      }
      if (!this._leafletMap.hasLayer(this._restrictionMarkerGroup)) {
        this._restrictionMarkerGroup.addTo(this._leafletMap);
      }
      const restrictions = this._vm().getProperty("/restrictionsData") || [];
      restrictions.forEach(function (restriction) {
        const icon = window.L.divIcon({
          className: "",
          html: "<div class=\"rstrMarker rstrMarker--" + restriction.severityClass + "\">" +
                "<span class=\"rstrMarkerLabel\">" + this._restrictionAbbr(restriction.restrictionType) + "</span>" +
                "</div>",
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        const marker = window.L.marker([restriction.latitude, restriction.longitude], { icon: icon });
        marker.bindPopup(this._restrictionPopupHtml(restriction), { maxWidth: 280 });
        marker.on("click", function () {
          this._selectFeature("restriction", restriction);
        }.bind(this));
        this._restrictionMarkerGroup.addLayer(marker);
      }.bind(this));
      this._vm().setProperty("/layers/restrictions/count", restrictions.length);
    },

    _restrictionAbbr: function (type) {
      if (!type) return "R";
      const map = { "Mass Limit": "ML", "Height Limit": "HL", "Width Limit": "WL",
        "Length Limit": "LL", "Speed Limit": "SL", "Permit Required": "PR" };
      return map[type] || type.substring(0, 2).toUpperCase();
    },

    _restrictionPopupHtml: function (restriction) {
      const limits = [];
      if (restriction.grossMassLimit) limits.push("GVM: " + restriction.grossMassLimit + " t");
      if (restriction.heightLimit) limits.push("H: " + restriction.heightLimit + " m");
      if (restriction.speedLimit) limits.push("Speed: " + restriction.speedLimit + " km/h");
      return [
        "<div class='leafletPopup'>",
        "<strong>", restriction.restrictionType || "Restriction", "</strong><br>",
        "<em>", restriction.bridgeName, "</em><br>",
        "Ref: ", restriction.restrictionRef, "<br>",
        limits.length ? limits.join(" · ") + "<br>" : "",
        "Status: ", restriction.restrictionStatus || "Active",
        "</div>"
      ].join("");
    },

    _selectFeature: function (type, data) {
      const model = this._vm();
      model.setProperty("/selectedFeature", { type: type, data: data });
      model.setProperty("/featurePanelOpen", true);
      model.setProperty("/fclLayout", "ThreeColumnsMidExpanded");
      if (type === "bridge") {
        model.setProperty("/selectedBridge", data);
        model.setProperty("/selectedRestrictions", data.restrictions || []);
        model.setProperty("/detailOpen", true);
        if (!model.getProperty("/showList")) {
          model.setProperty("/showList", true);
          setTimeout(this._invalidateMap.bind(this), 120);
        }
        const marker = this._markerIndex.get(data.ID);
        if (marker && this._leafletMap) {
          this._leafletMap.setView([data.latitude, data.longitude], Math.max(this._leafletMap.getZoom(), 10));
          marker.openPopup();
        }
        this._renderMarkers(false);
      }
    },

    onOpenInBridgeRegister: function () {
      const feature = this._vm().getProperty("/selectedFeature");
      if (!feature) return;
      const bridge = feature.type === "bridge" ? feature.data : null;
      const bridgeId = bridge ? bridge.ID : (feature.data && feature.data.bridge_ID);
      const hash = bridgeId
        ? "#Bridges-manage&/Bridges(ID=" + bridgeId + ",IsActiveEntity=true)"
        : "#Bridges-manage";
      try {
        const ushell = sap && sap.ushell && sap.ushell.Container;
        const nav = ushell && ushell.getService("CrossApplicationNavigation");
        if (nav) {
          nav.toExternal({ target: { shellHash: hash } });
          return;
        }
      } catch (navigationError) { /* fall through */ }
      window.open(hash, "_blank");
    },

    onViewBridgeFromRestriction: function () {
      const feature = this._vm().getProperty("/selectedFeature");
      if (!feature || feature.type !== "restriction") return;
      const selectedRestriction = feature.data;
      const allBridges = this._vm().getProperty("/allBridges") || [];
      const bridge = allBridges.find(function (candidateBridge) { return candidateBridge.ID === selectedRestriction.bridge_ID; });
      if (bridge) {
        this._selectFeature("bridge", bridge);
      }
    },

    onCloseFeaturePanel: function () {
      const model = this._vm();
      model.setProperty("/featurePanelOpen", false);
      model.setProperty("/selectedFeature", null);
      model.setProperty("/selectedBridge", null);
      model.setProperty("/selectedRestrictions", []);
      model.setProperty("/detailOpen", false);
      model.setProperty("/showList", false);
      const panelOpen = model.getProperty("/panelOpen");
      model.setProperty("/fclLayout", panelOpen ? "TwoColumnsMidExpanded" : "MidColumnFullScreen");
      setTimeout(this._invalidateMap.bind(this), 120);
    },

    onExport: function (oEvent) {
      const source = oEvent.getSource();
      const customData = source.getCustomData && source.getCustomData();
      const keyData = customData && customData.length ? customData[0] : null;
      const key = keyData ? keyData.getValue() : "bridges-geojson";
      const parts = key.split("-");
      const layer = parts[0];
      const format = parts.slice(1).join("-");
      const bounds = this._leafletMap ? this._leafletMap.getBounds() : null;
      const bbox = bounds
        ? bounds.getWest() + "," + bounds.getSouth() + "," + bounds.getEast() + "," + bounds.getNorth()
        : null;
      const url = "/map/api/export?layer=" + layer + "&format=" + format + (bbox ? "&bbox=" + bbox : "");
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = "export." + format;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    },

    onShowExportMenu: function (oEvent) {
      this.onExport(oEvent);
    },

    onToggleBridgeLayer: function (oEvent) {
      const visible = oEvent.getParameter("selected");
      this._vm().setProperty("/layers/bridges/visible", visible);
      this._applyLayerSettings();
    },

    onToggleRestrictionLayer: function (oEvent) {
      const visible = oEvent.getParameter("selected");
      this._vm().setProperty("/layers/restrictions/visible", visible);
      this._renderRestrictionMarkers();
    },

    onToggleBridgeCluster: function (oEvent) {
      this._vm().setProperty("/layers/bridges/cluster", oEvent.getParameter("selected"));
      this._applyLayerSettings();
    },

    onToggleBridgeLabels: function (oEvent) {
      this._vm().setProperty("/layers/bridges/showLabels", oEvent.getParameter("selected"));
      this._renderMarkers(false);
    },

    onBridgeColorByChange: function (oEvent) {
      const key = oEvent.getParameter("item") ? oEvent.getParameter("item").getKey() : oEvent.getSource().getSelectedKey();
      this._vm().setProperty("/layers/bridges/colorBy", key);
      this._vm().setProperty("/colorBy", key);
      this._renderMarkers(false);
    },

    onToggleViewportMode: function (oEvent) {
      this._vm().setProperty("/viewportMode", oEvent.getParameter("state"));
    },

    _getViewportBbox: function () {
      if (!this._leafletMap) return null;
      const bounds = this._leafletMap.getBounds();
      if (!bounds) return null;
      return bounds.getWest() + "," + bounds.getSouth() + "," + bounds.getEast() + "," + bounds.getNorth();
    },

    _checkUrlParams: function () {
      const search = window.location.search || "";
      const params = new URLSearchParams(search);
      const bridgeId = params.get("bridgeId") || params.get("highlightId");
      if (bridgeId) {
        const allBridges = this._vm().getProperty("/allBridges") || [];
        const bridge = allBridges.find(function (candidateBridge) { return String(candidateBridge.ID) === String(bridgeId) || candidateBridge.bridgeId === bridgeId; });
        if (bridge) {
          setTimeout(function () { this._selectFeature("bridge", bridge); }.bind(this), 500);
        }
      }
    },

    _buildFilterOptions: function (bridges) {
      return {
        states: STATE_OPTIONS.map(function (code) {
          return { key: code, label: code, selected: false };
        }),
        postingStatuses: POSTING_STATUS_OPTIONS.map(function (status) {
          return { key: status, label: status, selected: false };
        }),
        structureTypes: this._uniqueOptions(bridges, "structureType"),
        routeFlags: ROUTE_FLAGS.map(function (flag) {
          return { key: flag.key, label: flag.label, selected: false };
        }),
        vehicleClasses: this._uniqueOptions(bridges, "vehicleClass")
      };
    },

    _uniqueOptions: function (bridges, key) {
      return [...new Set(bridges.map(function (bridge) { return bridge[key]; }).filter(Boolean))]
        .sort()
        .map(function (value) {
          return { key: value, label: value, selected: false };
        });
    },

    _applyFilters: function () {
      const model = this._vm();
      const allBridges = model.getProperty("/allBridges") || [];
      const filters = model.getProperty("/filters");
      const limits = model.getProperty("/limits");
      const options = model.getProperty("/filterOptions");

      const selectedStates = this._selectedKeys(options.states);
      const selectedStatuses = this._selectedKeys(options.postingStatuses);
      const selectedTypes = this._selectedKeys(options.structureTypes);
      const selectedVehicleClasses = this._selectedKeys(options.vehicleClasses);
      const selectedRouteFlags = this._selectedKeys(options.routeFlags);

      const filtered = allBridges.filter(function (bridge) {
        if (selectedStates.length && !selectedStates.includes(bridge.state)) return false;
        if (selectedStatuses.length && !selectedStatuses.includes(bridge.postingStatus)) return false;
        if (selectedTypes.length && !selectedTypes.includes(bridge.structureType)) return false;
        if (selectedVehicleClasses.length && !selectedVehicleClasses.includes(bridge.vehicleClass)) return false;
        if (selectedRouteFlags.length && !selectedRouteFlags.every(function (flag) { return bridge[flag]; })) return false;
        if (!this._matchesRange(bridge.conditionRating, filters.minCondition, filters.maxCondition, limits.minCondition, limits.maxCondition)) return false;
        if (!this._matchesRange(bridge.yearBuilt, filters.minYear, filters.maxYear, limits.minYear, limits.maxYear)) return false;
        return true;
      }.bind(this));

      model.setProperty("/filteredBridges", filtered);
      this._applySelectionToDisplay(filtered);
    },

    _applySelectionToDisplay: function (bridges) {
      const model = this._vm();
      const displayed = this._selectionShape ? this._spatialSelect(bridges) : bridges.slice();
      const total = model.getProperty("/totalBridges");

      model.setProperty("/bridges", displayed);
      model.setProperty("/summaryText", displayed.length + " of " + total + " bridges");
      model.setProperty("/bridgeCountText", displayed.length + " of " + total + " bridges");
      model.setProperty("/listTitleText", displayed.length + " visible bridges");
      model.setProperty("/selectionActive", Boolean(this._selectionShape));
      model.setProperty("/selectionCount", this._selectionShape ? displayed.length : 0);
      model.setProperty("/selectionLabel", this._selectionShape ? this._text("selectionActive") : "");

      if (displayed.length) {
        const selected = model.getProperty("/selectedBridge");
        const nextSelected = selected && displayed.some(function (bridge) { return bridge.ID === selected.ID; })
          ? selected
          : displayed[0];
        model.setProperty("/selectedBridge", nextSelected);
        model.setProperty("/selectedRestrictions", nextSelected.restrictions || []);
        model.setProperty("/detailOpen", true);
      } else {
        model.setProperty("/selectedRestrictions", []);
      }

      this._renderMarkers(false);
    },

    _matchesRange: function (value, min, max, defaultMin, defaultMax) {
      if (value == null) {
        return min === defaultMin && max === defaultMax;
      }
      return value >= min && value <= max;
    },

    _selectedKeys: function (items) {
      return (items || []).filter(function (item) { return item.selected; }).map(function (item) { return item.key; });
    },

    _ensureLeaflet: function () {
      if (window.L && window.L.markerClusterGroup && window.L.Draw) {
        return Promise.resolve();
      }

      this._includeStylesheet("vendor/leaflet/leaflet.css");
      this._includeStylesheet("vendor/leaflet.markercluster/MarkerCluster.css");
      this._includeStylesheet("vendor/leaflet.markercluster/MarkerCluster.Default.css");
      this._includeStylesheet("vendor/leaflet.draw/leaflet.draw.css");

      return this._loadScriptCandidates("vendor/leaflet/leaflet.js")
        .then(function () {
          if (!window.L) {
            throw new Error("Leaflet loaded, but window.L is not available.");
          }
          return this._loadScriptCandidates("vendor/leaflet.markercluster/leaflet.markercluster.js");
        }.bind(this))
        .then(function () {
          if (!window.L.markerClusterGroup) {
            throw new Error("Leaflet MarkerCluster loaded, but L.markerClusterGroup is not available.");
          }
          return this._loadScriptCandidates("vendor/leaflet.draw/leaflet.draw.js");
        }.bind(this))
        .then(function () {
          if (!window.L.Draw) {
            throw new Error("Leaflet Draw loaded, but L.Draw is not available.");
          }
          // Load optional GIS plugins (non-blocking)
          this._loadScriptCandidates("vendor/leaflet.heat/leaflet.heat.js").catch(function () {});
          this._loadScriptCandidates("vendor/leaflet.minimap/Control.MiniMap.js").catch(function () {});
        }.bind(this));
    },

    _includeStylesheet: function (path) {
      const candidates = this._resourceUrlCandidates(path);
      const alreadyLoaded = candidates.some(function (href) {
        return Boolean(document.querySelector("link[data-map-href='" + href + "']"));
      });

      if (alreadyLoaded) {
        return;
      }

      this._includeStylesheetCandidate(candidates, 0);
    },

    _includeStylesheetCandidate: function (candidates, index) {
      const href = candidates[index];
      if (!href) {
        return;
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.mapHref = href;
      link.addEventListener("error", function () {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        this._includeStylesheetCandidate(candidates, index + 1);
      }.bind(this), { once: true });
      document.head.appendChild(link);
    },

    _loadScriptCandidates: function (path) {
      const candidates = this._resourceUrlCandidates(path);
      let chain = Promise.reject(new Error("No script URL candidates for " + path));

      candidates.forEach(function (src) {
        chain = chain.catch(function () {
          return this._loadScript(src);
        }.bind(this));
      }.bind(this));

      return chain.catch(function (error) {
        throw new Error("Could not load " + path + ". Tried: " + candidates.join(", ") + ". " + (error && error.message ? error.message : ""));
      });
    },

    _loadScript: function (src) {
      return new Promise(function (resolve, reject) {
        const existing = document.querySelector("script[data-src='" + src + "']");
        if (existing) {
          if (existing.dataset.loaded === "true") {
            resolve();
          } else {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", function () {
              reject(new Error("Failed to load script: " + src));
            }, { once: true });
          }
          return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.src = src;
        script.addEventListener("load", function () {
          script.dataset.loaded = "true";
          resolve();
        }, { once: true });
        script.addEventListener("error", function () {
          reject(new Error("Failed to load script: " + src));
        }, { once: true });
        document.head.appendChild(script);
      });
    },

    _scheduleMapInit: function () {
      if (this._leafletMap || this._mapInitScheduled) {
        return;
      }

      this._mapInitScheduled = true;
      setTimeout(function () {
        this._mapInitScheduled = false;
        this._initMap();
      }.bind(this), 0);
    },

    _initMap: function () {
      if (this._leafletMap) {
        return;
      }

      const host = this._resolveMapHost();
      if (!host) {
        this._mapInitAttempts += 1;
        if (this._mapInitAttempts <= 20) {
          setTimeout(this._initMap.bind(this), 50);
        } else {
          MessageBox.error(this._text("errMapContainer"));
        }
        return;
      }

      this._mapInitAttempts = 0;
      // GIS-R2: coordinates are stored as GDA2020 (EPSG:7844). Leaflet's default Web
      // Mercator (EPSG:3857) is intentional for DISPLAY — GDA2020≈WGS84 (<2 m), well
      // under one screen pixel at any usable zoom. The authoritative datum lives in the
      // data/export path (see GIS-CRS-POLICY.md); the map view is visualisation only.
      this._leafletMap = window.L.map(host, {
        zoomControl: true,
        attributionControl: true
      });

      this._selectionLayer = window.L.featureGroup().addTo(this._leafletMap);
      this._applyBaseLayer();
      this._applyLayerSettings();
      this._leafletMap.fitBounds(AUSTRALIA_BOUNDS);

      this._leafletMap.on("draw:created", function (event) {
        this._selectionLayer.clearLayers();
        this._selectionLayer.addLayer(event.layer);
        this._selectionShape = event.layer;
        this._drawMode = event.layerType;
        this._applySelectionToDisplay(this._vm().getProperty("/filteredBridges") || []);
        const selectedCount = this._vm().getProperty("/selectionCount");
        this._openSelectionPopup(event.layer, event.layerType, selectedCount);
      }.bind(this));

      this._leafletMap.on("mousemove", function (event) {
        var lat = event.latlng.lat, lng = event.latlng.lng;
        this._vm().setProperty("/coordinateText", lat.toFixed(5) + ", " + lng.toFixed(5));
        this._updateMgaCoords(lat, lng);
      }.bind(this));

      this._leafletMap.on("moveend zoomend", function () {
        if (this._viewportDebounce) clearTimeout(this._viewportDebounce);
        this._viewportDebounce = setTimeout(function () {
          if (this._vm().getProperty("/viewportMode")) {
            this._loadData();
          }
        }.bind(this), 400);
      }.bind(this));

      this._renderMarkers(false);
      this._applyLayoutMode();
      this._initAdvancedControls();
      setTimeout(this._invalidateMap.bind(this), 250);
    },

    _resolveMapHost: function () {
      const mapHost = this.byId("mapHost");
      const domRef = mapHost && mapHost.getDomRef();
      if (!domRef) {
        return null;
      }

      domRef.setAttribute("role", "application");
      domRef.setAttribute("aria-label", "Bridge geographic map");
      domRef.setAttribute("tabindex", "0");

      if (domRef.classList && domRef.classList.contains("bridgeMapCanvas")) {
        return domRef;
      }

      const existing = domRef.querySelector(".bridgeMapCanvas");
      if (existing) {
        return existing;
      }

      const created = document.createElement("div");
      created.className = "bridgeMapCanvas";
      domRef.appendChild(created);
      return created;
    },

    _applyBaseLayer: function () {
      if (!this._leafletMap) return;

      const key = this._vm().getProperty("/basemap");
      const config = TILE_LAYERS[key] || TILE_LAYERS.osm;

      if (this._tileLayer) {
        this._leafletMap.removeLayer(this._tileLayer);
      }

      this._tileLayer = window.L.tileLayer(config.url, config.options);
      this._tileLayer.addTo(this._leafletMap);
    },

    _applyLayerSettings: function () {
      if (!this._leafletMap) return;

      const layers = this._vm().getProperty("/layers");
      const shouldCluster = Boolean(layers.bridges ? layers.bridges.cluster : layers.clusterMarkers);
      const activeMarkerLayer = shouldCluster
        ? (this._clusterLayer || (this._clusterLayer = window.L.markerClusterGroup({
            maxClusterRadius: 44,
            showCoverageOnHover: false
          })))
        : (this._plainMarkerLayer || (this._plainMarkerLayer = window.L.layerGroup()));

      [this._clusterLayer, this._plainMarkerLayer].filter(Boolean).forEach(function (layer) {
        if (this._leafletMap.hasLayer(layer)) {
          this._leafletMap.removeLayer(layer);
        }
      }.bind(this));

      activeMarkerLayer.addTo(this._leafletMap);

      if (layers.showHillshade) {
        if (!this._hillshadeLayer) {
          this._hillshadeLayer = window.L.tileLayer(HILLSHADE_LAYER.url, HILLSHADE_LAYER.options);
        }
        this._hillshadeLayer.addTo(this._leafletMap);
      } else if (this._hillshadeLayer && this._leafletMap.hasLayer(this._hillshadeLayer)) {
        this._leafletMap.removeLayer(this._hillshadeLayer);
      }

      this._renderMarkers(false);
    },

    _renderMarkers: function (fitToBounds) {
      if (!this._leafletMap) return;

      const layers = this._vm().getProperty("/layers");

      if (layers.bridges && !layers.bridges.visible) {
        const markerLayerInactive = layers.bridges && layers.bridges.cluster ? this._clusterLayer : this._plainMarkerLayer;
        if (markerLayerInactive) markerLayerInactive.clearLayers();
        this._renderRestrictionMarkers();
        return;
      }

      const shouldCluster = Boolean(layers.bridges ? layers.bridges.cluster : layers.clusterMarkers);
      const markerLayer = shouldCluster ? this._clusterLayer : this._plainMarkerLayer;
      const showLabels = layers.bridges ? layers.bridges.showLabels : layers.showLabels;
      const bridges = this._vm().getProperty("/bridges") || [];
      const selected = this._vm().getProperty("/selectedBridge");

      if (!markerLayer) {
        this._renderRestrictionMarkers();
        return;
      }

      markerLayer.clearLayers();
      this._markerIndex.clear();

      bridges.forEach(function (bridge) {
        const marker = window.L.circleMarker([bridge.latitude, bridge.longitude], this._markerStyle(bridge, selected));
        marker.bindPopup(this._popupHtml(bridge), { maxWidth: 260 });
        if (showLabels) {
          marker.bindTooltip(bridge.bridgeName, { permanent: true, direction: "top", offset: [0, -8], className: "bridgeMapLabel" });
        }
        marker.on("click", function () {
          this._focusBridge(bridge);
        }.bind(this));
        this._markerIndex.set(bridge.ID, marker);
        markerLayer.addLayer(marker);
      }.bind(this));

      // Render stored GeoJSON geometry (Point / LineString / Polygon / Polyline / Multi*)
      const geomBounds = this._renderGeometry(bridges);

      const legend = this.byId("legendBox");
      if (legend) {
        legend.setVisible(Boolean(layers.showLegend));
      }

      if (fitToBounds !== false && bridges.length) {
        let bounds = window.L.latLngBounds(bridges.map(function (bridge) {
          return [bridge.latitude, bridge.longitude];
        }));
        if (geomBounds && geomBounds.isValid()) { bounds.extend(geomBounds); }
        this._leafletMap.fitBounds(bounds.pad(0.18));
      } else if (fitToBounds !== false) {
        this._leafletMap.fitBounds(AUSTRALIA_BOUNDS);
      }

      this._renderRestrictionMarkers();
      this._invalidateMap();
      this._updateStats();
      if (this._vm().getProperty("/heatmapActive")) { this._renderHeatmap(); }
      if (this._vm().getProperty("/conditionAlertsActive")) { this._renderConditionAlerts(); }
    },

    // Render any stored GeoJSON geometry per bridge. Supports Point, MultiPoint,
    // LineString (polyline), MultiLineString, Polygon, MultiPolygon and
    // GeometryCollection. Returns the combined LatLngBounds (or null).
    _renderGeometry: function (bridges) {
      if (!this._leafletMap || !window.L) return null;
      if (!this._geometryLayer) {
        this._geometryLayer = window.L.layerGroup().addTo(this._leafletMap);
      }
      this._geometryLayer.clearLayers();

      const layers = this._vm().getProperty("/layers");
      if (layers && layers.bridges && layers.bridges.visible === false) return null;

      let combined = null;
      (bridges || []).forEach(function (bridge) {
        if (!bridge.geoJson) return;
        let geo;
        try {
          geo = typeof bridge.geoJson === "string" ? JSON.parse(bridge.geoJson) : bridge.geoJson;
        } catch (e) {
          return; // skip invalid GeoJSON, never break the map
        }
        if (!geo || (!geo.type)) return;
        try {
          const gj = window.L.geoJSON(geo, {
            style: function (feature) { return this._geometryStyle(bridge, feature); }.bind(this),
            pointToLayer: function (feature, latlng) {
              return window.L.circleMarker(latlng, this._geometryStyle(bridge, feature));
            }.bind(this),
            onEachFeature: function (feature, lyr) {
              const t = (feature && feature.geometry && feature.geometry.type) || geo.type;
              lyr.bindPopup("<div class='leafletPopup'><strong>" + (bridge.bridgeName || bridge.bridgeId || "Bridge") +
                "</strong><br>Geometry: " + t + "</div>", { maxWidth: 260 });
              lyr.on("click", function () { this._focusBridge(bridge); }.bind(this));
            }.bind(this)
          });
          gj.addTo(this._geometryLayer);
          const b = gj.getBounds();
          if (b && b.isValid()) { combined = combined ? combined.extend(b) : window.L.latLngBounds(b.getSouthWest(), b.getNorthEast()); }
        } catch (e) { /* ignore a single bad geometry */ }
      }.bind(this));
      return combined;
    },

    _geometryStyle: function (bridge, feature) {
      const type = (feature && feature.geometry && feature.geometry.type) || "";
      const base = this._borderColor(bridge.postingStatus);
      const fill = this._conditionColor(bridge.conditionRating);
      if (/Polygon/.test(type)) {
        return { color: base, weight: 2, opacity: 0.9, fillColor: fill, fillOpacity: 0.25 };
      }
      if (/LineString/.test(type)) {
        return { color: base, weight: 4, opacity: 0.9, dashArray: bridge.postingStatus === "Closed" ? "6,6" : null };
      }
      // Point / MultiPoint
      return { radius: 6, weight: 2, color: base, fillColor: fill, fillOpacity: 0.9 };
    },

    _markerStyle: function (bridge, selected) {
      const colorBy = this._vm().getProperty("/colorBy");
      const isSelected = selected && selected.ID === bridge.ID;
      return {
        radius: isSelected ? 11 : 8,
        weight: isSelected ? 4 : 3,
        color: this._borderColor(bridge.postingStatus),
        fillColor: colorBy === "status" ? this._statusColor(bridge.postingStatus) : this._conditionColor(bridge.conditionRating),
        fillOpacity: isSelected ? 1 : 0.88
      };
    },

    _popupHtml: function (bridge) {
      var svLink = this._feat("streetView")
        ? "<br><a href='https://maps.google.com/maps?q&layer=c&cbll=" + bridge.latitude + "," + bridge.longitude + "' target='_blank' rel='noopener'>&#128248; Street View</a>"
        : "";
      return [
        "<div class='leafletPopup'>",
        "<strong>", bridge.bridgeName, "</strong><br>",
        bridge.bridgeId, "<br>",
        (bridge.state || "-"), " • ", (bridge.postingStatusLabel || "-"), "<br>",
        "Condition: ", (bridge.conditionRating == null ? "n/a" : bridge.conditionRating), "<br>",
        "Structure: ", (bridge.structureType || "n/a"), "<br>",
        "Year Built: ", (bridge.yearBuilt || "n/a"),
        svLink,
        "</div>"
      ].join("");
    },

    _openSelectionPopup: function (layer, layerType, count) {
      if (!layer || !this._leafletMap) {
        return;
      }

      const html = this._selectionPopupHtml(layer, layerType, count);
      const popupLocation = this._selectionPopupLocation(layer);
      if (!popupLocation) {
        return;
      }

      if (layer.bindPopup) {
        layer.bindPopup(html, { maxWidth: 260 });
        layer.off("click", this._boundSelectionPopupClick);
        this._boundSelectionPopupClick = function () {
          this._showSelectionPopup(html, popupLocation);
        }.bind(this);
        layer.on("click", this._boundSelectionPopupClick);
      }

      setTimeout(function () {
        this._showSelectionPopup(html, popupLocation);
      }.bind(this), 80);
    },

    _showSelectionPopup: function (html, popupLocation) {
      window.L.popup({ maxWidth: 260 })
        .setLatLng(popupLocation)
        .setContent(html)
        .openOn(this._leafletMap);
    },

    _selectionPopupHtml: function (layer, layerType, count) {
      const label = layerType === "circle" ? "Circle selection" :
        layerType === "rectangle" ? "Rectangle selection" :
          "Polygon selection";
      const radius = layerType === "circle" && layer.getRadius
        ? "<br>Radius: " + this._formatRadius(layer.getRadius())
        : "";

      return [
        "<div class='leafletPopup selectionPopup'>",
        "<strong>", label, "</strong><br>",
        count, " bridge", count === 1 ? "" : "s", " selected",
        radius,
        "<br><span class='selectionPopupHint'>Use Clear Selection to reset.</span>",
        "</div>"
      ].join("");
    },

    _selectionPopupLocation: function (layer) {
      if (layer.getLatLng) {
        return layer.getLatLng();
      }
      if (layer.getBounds) {
        return layer.getBounds().getCenter();
      }
      return null;
    },

    _formatRadius: function (meters) {
      return meters >= 1000
        ? (meters / 1000).toFixed(2) + " km"
        : Math.round(meters) + " m";
    },

    _focusBridge: function (bridge) {
      if (!bridge || !this._leafletMap) return;
      this._selectFeature("bridge", bridge);
    },

    _applyLayoutMode: function () {
      // The current FCL-based view does not use a "workspace" control.
      // Layout toggling is driven by the showList / fclLayout view model
      // properties which are bound directly in the XML view.
      setTimeout(this._invalidateMap.bind(this), 90);
    },

    _activateDraw: function (type) {
      if (!this._leafletMap || !window.L || !window.L.Draw) return;

      let handler;
      if (type === "polygon") {
        handler = new window.L.Draw.Polygon(this._leafletMap, {
          shapeOptions: { color: "#2563eb", weight: 2, fillOpacity: 0.08 }
        });
      } else if (type === "rectangle") {
        handler = new window.L.Draw.Rectangle(this._leafletMap, {
          shapeOptions: { color: "#ea580c", weight: 2, fillOpacity: 0.08 }
        });
      } else {
        handler = new window.L.Draw.Circle(this._leafletMap, {
          shapeOptions: { color: "#16a34a", weight: 2, fillOpacity: 0.08 }
        });
      }

      handler.enable();
    },

    _spatialSelect: function (bridges) {
      if (!this._selectionShape) return bridges.slice();

      if (this._drawMode === "rectangle") {
        const bounds = this._selectionShape.getBounds();
        return bridges.filter(function (bridge) {
          return bounds.contains([bridge.latitude, bridge.longitude]);
        });
      }

      if (this._drawMode === "circle") {
        const center = this._selectionShape.getLatLng();
        const radius = this._selectionShape.getRadius();
        return bridges.filter(function (bridge) {
          return center.distanceTo([bridge.latitude, bridge.longitude]) <= radius;
        });
      }

      const polygon = this._normalizePolygonLatLngs(this._selectionShape.getLatLngs());
      return bridges.filter(function (bridge) {
        return this._pointInPolygon([bridge.longitude, bridge.latitude], polygon);
      }.bind(this));
    },

    _normalizePolygonLatLngs: function (latlngs) {
      const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
      return ring.map(function (latlng) {
        return [latlng.lng, latlng.lat];
      });
    },

    _pointInPolygon: function (point, polygon) {
      let inside = false;
      for (let currentVertexIndex = 0, previousVertexIndex = polygon.length - 1; currentVertexIndex < polygon.length; previousVertexIndex = currentVertexIndex++) {
        const currentLongitude = polygon[currentVertexIndex][0];
        const currentLatitude = polygon[currentVertexIndex][1];
        const previousLongitude = polygon[previousVertexIndex][0];
        const previousLatitude = polygon[previousVertexIndex][1];
        const intersect = ((currentLatitude > point[1]) !== (previousLatitude > point[1])) &&
          (point[0] < (previousLongitude - currentLongitude) * (point[1] - currentLatitude) / ((previousLatitude - currentLatitude) || Number.EPSILON) + currentLongitude);
        if (intersect) inside = !inside;
      }
      return inside;
    },

    _activeBridges: function () {
      return this._vm().getProperty("/selectionActive")
        ? this._spatialSelect(this._vm().getProperty("/filteredBridges") || [])
        : (this._vm().getProperty("/filteredBridges") || []);
    },

    _invalidateMap: function () {
      if (this._leafletMap) {
        this._leafletMap.invalidateSize();
      }
    },

    _conditionBandLabel: function (rating) {
      if (rating == null) return this._text("statusUnrated");
      if (rating >= 7) return this._text("conditionGood");
      if (rating >= 5) return this._text("conditionFair");
      return this._text("conditionPoor");
    },

    _conditionState: function (rating) {
      if (rating == null) return "None";
      if (rating >= 7) return "Success";
      if (rating >= 5) return "Warning";
      return "Error";
    },

    _conditionColor: function (rating) {
      if (rating == null) return "#64748b";
      if (rating >= 7) return "#16a34a";
      if (rating >= 5) return "#f59e0b";
      return "#ef4444";
    },

    _postingStatusLabel: function (status) {
      if (status === "Closed") return this._text("statusClosed");
      if (status === "Restricted") return this._text("statusRestricted");
      if (status === "Under Review") return this._text("statusUnderReview");
      return this._text("statusUnrestricted");
    },

    _statusColor: function (status) {
      if (status === "Closed") return "#ef4444";
      if (status === "Restricted" || status === "Under Review") return "#f59e0b";
      return "#2563eb";
    },

    _borderColor: function (status) {
      if (status === "Closed") return "#991b1b";
      if (status === "Restricted" || status === "Under Review") return "#b45309";
      return "#1d4ed8";
    },

    _resourceUrl: function (path) {
      return this._resourceUrlCandidates(path)[0];
    },

    _resourceUrlCandidates: function (path) {
      const cleanPath = String(path || "").replace(/^\/+/, "");
      const candidates = [];
      const add = function (value) {
        if (value && candidates.indexOf(value) === -1) {
          candidates.push(value);
        }
      };

      try {
        add(sap.ui.require.toUrl("BridgeManagement/mapview/" + cleanPath));
      } catch (error) {}

      try {
        add(this.getOwnerComponent().getManifestObject().resolveUri(cleanPath));
      } catch (error) {}

      add("/map-view/webapp/" + cleanPath);
      add(cleanPath);

      return candidates;
    },

    _text: function (key) {
      try {
        var model = this.getView && this.getView() && this.getView().getModel("i18n");
        if (!model) return key;
        var bundle = model.getResourceBundle();
        if (!bundle || typeof bundle.getText !== "function") return key;
        return bundle.getText(key);
      } catch (textBundleError) {
        return key;
      }
    },

    _vm: function () {
      return this.getView().getModel("view");
    },

    // ─── GIS Config ────────────────────────────────────────────────────────────

    _loadGisConfig: function () {
      fetch("/map/api/config")
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.statusText); })
        .then(function (cfg) {
          this._gisConfig = cfg;
          this._vm().setProperty("/gisConfig", cfg);
          this._vm().setProperty("/features", {
            scaleBar: cfg.enableScaleBar !== false,
            gps: cfg.enableGps !== false,
            minimap: cfg.enableMinimap !== false,
            heatmap: cfg.enableHeatmap === true,
            timeSlider: cfg.enableTimeSlider === true,
            statsPanel: cfg.enableStatsPanel !== false,
            proximity: cfg.enableProximity !== false,
            mgaCoords: cfg.enableMgaCoords !== false,
            streetView: cfg.enableStreetView !== false,
            conditionAlerts: cfg.enableConditionAlerts !== false,
            customWms: cfg.enableCustomWms === true,
            serverClustering: cfg.enableServerClustering === true,
            showStateBoundaries: cfg.showStateBoundaries === true,
            showLgaBoundaries: cfg.showLgaBoundaries === true
          });
          if (cfg.defaultBasemap && cfg.defaultBasemap !== "street") {
            this._vm().setProperty("/basemap", cfg.defaultBasemap);
          }
          if (cfg.showStateBoundaries) {
            this._vm().setProperty("/layers/refLayers/stateBoundaries", true);
          }
          if (cfg.showLgaBoundaries) {
            this._vm().setProperty("/layers/refLayers/lgaBoundaries", true);
          }
        }.bind(this))
        .catch(function () {
          this._gisConfig = null;
        }.bind(this));

      // Check demo mode flag
      fetch("/odata/v4/admin/SystemConfig('demoModeActive')", { headers: { Accept: "application/json" } })
        .then(function (demoModeResponse) { return demoModeResponse.ok ? demoModeResponse.json() : null; })
        .then(function (demoModeConfig) {
          if (demoModeConfig && demoModeConfig.value === "true") {
            this._vm().setProperty("/demoModeActive", true);
          }
        }.bind(this))
        .catch(function () { /* non-fatal */ });
    },

    _loadDynamicRefLayers: function () {
      var self = this;
      fetch("/odata/v4/admin/ReferenceLayerConfig?$filter=active eq true&$orderby=category,sortOrder,name", {
        headers: { "Accept": "application/json" }
      })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
        .then(function (data) {
          var layers = (data.value || []).map(function (referenceLayer) {
            return Object.assign({}, referenceLayer, { sessionActive: referenceLayer.enabledByDefault === true });
          });
          // Group into category objects for the view
          var grouped = [];
          var catOrder = [];
          layers.forEach(function (referenceLayer) {
            if (catOrder.indexOf(referenceLayer.category) === -1) catOrder.push(referenceLayer.category);
          });
          catOrder.forEach(function (referenceLayerCategory) {
            grouped.push({
              category: referenceLayerCategory,
              items: layers.filter(function (referenceLayer) { return referenceLayer.category === referenceLayerCategory; })
            });
          });
          self._vm().setProperty("/dynRefLayers", layers);
          self._vm().setProperty("/dynRefGroups", grouped);
          // Auto-enable layers marked enabledByDefault once Leaflet is ready
          self._leafletReady.then(function () {
            layers.filter(function (referenceLayer) { return referenceLayer.enabledByDefault; }).forEach(function (referenceLayer) {
              self._addDynamicRefLayer(referenceLayer);
            });
          });
        })
        .catch(function () { /* optional: non-fatal */ });
    },

    onToggleDynamicRefLayer: function (oEvent) {
      var state = oEvent.getParameter("state");
      var src   = oEvent.getSource();
      var cd    = src.getCustomData();
      var layerId = cd && cd.length ? cd[0].getValue() : null;
      if (!layerId) return;
      var layers = this._vm().getProperty("/dynRefLayers") || [];
      var layer  = layers.find(function (referenceLayer) { return referenceLayer.ID === layerId; });
      if (!layer) return;
      layer.sessionActive = state;
      this._vm().setProperty("/dynRefLayers", layers.slice());
      if (state) {
        this._addDynamicRefLayer(layer);
      } else {
        this._removeDynamicRefLayer(layer.ID);
      }
    },

    _addDynamicRefLayer: function (cfg) {
      if (!window.L || !this._leafletMap) return;
      if (this._refLayerInstances["dyn_" + cfg.ID]) return;
      var instance;
      var type = (cfg.layerType || "WMS").toUpperCase();
      var opacity = cfg.opacity != null ? parseFloat(cfg.opacity) : 0.7;
      if (type === "WMS") {
        instance = window.L.tileLayer.wms(cfg.url, {
          layers: cfg.subLayers || "0",
          format: cfg.wmsFormat || "image/png",
          transparent: cfg.transparent !== false,
          opacity: opacity,
          attribution: cfg.attribution || "",
          minZoom: cfg.minZoom || 0,
          maxZoom: cfg.maxZoom || 19
        });
      } else if (type === "XYZ") {
        instance = window.L.tileLayer(cfg.url, {
          opacity: opacity,
          attribution: cfg.attribution || "",
          minZoom: cfg.minZoom || 0,
          maxZoom: cfg.maxZoom || 19
        });
      } else if (type === "ARCGISREST") {
        var tileUrl = cfg.url.replace(/\/?$/, "") + "/MapServer/tile/{z}/{y}/{x}";
        instance = window.L.tileLayer(tileUrl, {
          opacity: opacity,
          attribution: cfg.attribution || ""
        });
      }
      if (instance) {
        instance.addTo(this._leafletMap);
        this._refLayerInstances["dyn_" + cfg.ID] = instance;
      }
    },

    _removeDynamicRefLayer: function (id) {
      var key = "dyn_" + id;
      if (this._refLayerInstances[key] && this._leafletMap) {
        this._leafletMap.removeLayer(this._refLayerInstances[key]);
        delete this._refLayerInstances[key];
      }
    },

    _feat: function (key) {
      var features = this._vm().getProperty("/features") || {};
      return features[key] !== false;
    },

    // ─── Advanced Controls ────────────────────────────────────────────────────

    _initAdvancedControls: function () {
      if (!this._leafletMap || !window.L) return;
      var map = this._leafletMap;

      if (this._feat("scaleBar")) {
        window.L.control.scale({ imperial: false, maxWidth: 150 }).addTo(map);
      }

      if (this._feat("gps")) {
        this._addGpsControl(map);
      }

      // Minimap: may not be loaded yet; retry briefly
      if (this._feat("minimap")) {
        var self = this;
        var tries = 0;
        var tryMinimap = function () {
          if (window.L && window.L.Control && window.L.Control.MiniMap) {
            var miniTile = window.L.tileLayer(TILE_LAYERS.osm.url, { maxZoom: 19, attribution: "" });
            self._minimapControl = new window.L.Control.MiniMap(miniTile, {
              toggleDisplay: true, minimized: false, position: "bottomright"
            }).addTo(map);
            self._vm().setProperty("/minimapActive", true);
          } else if (tries++ < 20) {
            setTimeout(tryMinimap, 300);
          }
        };
        tryMinimap();
      }

      // Apply reference layers from config defaults
      var refLayers = this._vm().getProperty("/layers/refLayers") || {};
      Object.keys(refLayers).forEach(function (key) {
        if (refLayers[key]) this._applyRefLayer(key, true);
      }.bind(this));

      // Apply custom WMS layers
      var cfg = this._gisConfig;
      if (cfg && cfg.enableCustomWms && Array.isArray(cfg.customWmsLayers) && cfg.customWmsLayers.length) {
        cfg.customWmsLayers.forEach(function (wmsLayer) {
          if (!wmsLayer.url || !wmsLayer.layers) return;
          var instance = window.L.tileLayer.wms(wmsLayer.url, {
            layers: wmsLayer.layers,
            format: "image/png",
            transparent: true,
            opacity: wmsLayer.opacity != null ? wmsLayer.opacity : 0.7,
            attribution: wmsLayer.label || "Custom WMS"
          });
          instance.addTo(map);
          this._refLayerInstances["customWms_" + (wmsLayer.label || wmsLayer.layers)] = instance;
        }.bind(this));
      }
    },

    _addGpsControl: function (map) {
      var self = this;
      var GpsControl = window.L.Control.extend({
        options: { position: "topleft" },
        onAdd: function () {
          var btn = window.L.DomUtil.create("button", "leaflet-gps-btn");
          btn.title = "My Location";
          btn.innerHTML = "&#9762;";
          btn.style.cssText = "width:34px;height:34px;background:#fff;border:2px solid rgba(0,0,0,.2);border-radius:4px;font-size:18px;cursor:pointer;display:block;line-height:1;";
          window.L.DomEvent.on(btn, "click", function () { self.onGpsLocate(); });
          return btn;
        }
      });
      new GpsControl().addTo(map);
      map.on("locationfound", function (locationEvent) {
        window.L.popup().setLatLng(locationEvent.latlng)
          .setContent("<strong>Your location</strong><br>" + locationEvent.latlng.lat.toFixed(5) + ", " + locationEvent.latlng.lng.toFixed(5))
          .openOn(map);
        map.setView(locationEvent.latlng, 13);
      });
      map.on("locationerror", function () {
        sap.m.MessageToast.show(this._text("errGeolocation"));
      });
    },

    // ─── GPS ──────────────────────────────────────────────────────────────────

    onGpsLocate: function () {
      if (!this._leafletMap) return;
      this._leafletMap.locate({ setView: false, maxZoom: 14 });
    },

    // ─── Help Popovers ────────────────────────────────────────────────────────

    _buildHelpPopover: function (sTitle, sPlacement, sWidth, aItems, sPropName) {
      var self = this;
      var oBody = new VBox({ class: "nhvrHelpPopoverBody" });

      aItems.forEach(function (helpTopic) {
        var oDetailRows = new VBox({ class: "nhvrHelpItemDetails" });

        [
          { label: "Purpose:",    text: helpTopic.purpose },
          { label: "How to use:", text: helpTopic.howToUse }
        ].forEach(function (row) {
          oDetailRows.addItem(
            new HBox({
              class: "nhvrHelpDetailRow",
              alignItems: "Start",
              items: [
                new Label({ text: row.label, class: "nhvrHelpDetailLabel" }),
                new Text({ text: row.text,   class: "nhvrHelpDetailText" })
              ]
            })
          );
        });

        oBody.addItem(new VBox({
          class: "nhvrHelpItem",
          items: [
            new HBox({
              alignItems: "Center",
              class: "nhvrHelpItemHeader",
              items: [
                new Icon({ src: helpTopic.icon, size: "1rem", color: helpTopic.color || "#0a6ed1", class: "nhvrHelpItemIcon" }),
                new Title({ text: helpTopic.title, level: "H6", class: "nhvrHelpItemTitle" })
              ]
            }),
            oDetailRows
          ]
        }));
      });

      var oPopover = new Popover({
        title: sTitle,
        placement: sPlacement,
        contentWidth: sWidth,
        showHeader: true,
        content: [new ScrollContainer({ height: "30rem", vertical: true, content: [oBody] })],
        footer: new HBox({
          justifyContent: "End",
          items: [new Button({ text: "Close", press: function () { self[sPropName].close(); } })]
        })
      });
      this.getView().addDependent(oPopover);
      return oPopover;
    },

    onGisToolsHelp: function (oEvent) {
      if (!this._oGisHelpPopover) {
        this._oGisHelpPopover = this._buildHelpPopover(
          "GIS Tools Guide", "Right", "28rem",
          [
            {
              icon: "sap-icon://layer-standard", color: "#0a6ed1",
              title: "Reference Layers: Additional Layers",
              purpose: "Overlay curated spatial datasets (weather, flood zones, geology, infrastructure, etc.) sourced from government and open-data providers on top of the bridge map.",
              howToUse: "Expand the Reference Layers panel in the left sidebar. Only layers that your BMS Administrator has activated in GIS Configuration → Reference Layer Library are listed here. Toggle any layer switch on to add the overlay to the map; toggle off to remove it. Layers marked 'Default On' by the administrator are switched on automatically when you open the map."
            },
            {
              icon: "sap-icon://temperature", color: "#e35500",
              title: "Heat Map",
              purpose: "Reveal geographic clusters of poorly-rated bridges across the network at a single glance.",
              howToUse: "Toggle Heat Map on → a colour-gradient overlay appears (red = high-density low-rated clusters, green/blue = good). Zoom into red/orange zones to identify individual bridges. Works best at state or regional zoom levels (zoom 6–11)."
            },
            {
              icon: "sap-icon://alert", color: "#f59e0b",
              title: "Condition Alerts",
              purpose: "Instantly flag bridges that fall below an acceptable condition threshold so they can be prioritised for inspection or maintenance.",
              howToUse: "Toggle Condition Alerts on → bridges with a condition rating at or below the configured threshold (default: 3) are highlighted with a red alert ring on the map. Click any flagged marker to open its bridge detail panel. The threshold value is set in BMS Admin → GIS Configuration → Condition Alert Threshold."
            },
            {
              icon: "sap-icon://map-3", color: "#0a6ed1",
              title: "Mini Map",
              purpose: "Maintain geographic context while zoomed deep into a specific region.",
              howToUse: "Toggle Mini Map on → a small overview inset appears in the bottom-right corner of the map, showing your current viewport rectangle on the full Australian extent. It updates live as you pan and zoom. Toggle off to reclaim screen space on smaller monitors."
            },
            {
              icon: "sap-icon://show", color: "#0a6ed1",
              title: "Viewport Loading",
              purpose: "Improve map performance when working with very large national datasets by loading only bridges currently visible on screen.",
              howToUse: "Toggle Viewport Loading on → only bridges within the current map extent are fetched from the server. Pan or zoom to load bridges in a new area. Toggle off to load the full dataset at once (may be slower on datasets with thousands of bridges)."
            },
            {
              icon: "sap-icon://locate-me", color: "#7c3aed",
              title: "Proximity Analysis",
              purpose: "Find every bridge within a defined radius of any geographic point: ideal for corridor planning, flood impact assessments, and site investigations.",
              howToUse: "Open the Proximity Analysis panel in the left sidebar → enter a decimal Latitude and Longitude (or click a point on the map) → set a Search Radius in kilometres → click Find Bridges. Matching bridges are highlighted and listed. Click Clear to reset."
            },
            {
              icon: "sap-icon://timeline", color: "#0a6ed1",
              title: "Time Slider",
              purpose: "Analyse infrastructure age distribution or focus on bridges built within a specific construction era.",
              howToUse: "Open the Time Slider panel → drag the left handle to set the earliest year and the right handle to the latest year. The map updates automatically to show only bridges whose year built falls within that range. Click Reset to restore all bridges."
            },
            {
              icon: "sap-icon://bar-chart", color: "#0a6ed1",
              title: "Statistics Panel",
              purpose: "Get a live summary of the condition and restriction status of bridges currently visible on the map.",
              howToUse: "The Statistics panel sits at the bottom of the left sidebar and requires no action to activate. It shows the count of visible bridges, average condition rating, number in poor/critical condition, number with active restrictions, and number closed. All figures update automatically as you pan, zoom, or apply filters."
            }
          ],
          "_oGisHelpPopover"
        );
      }
      this._oGisHelpPopover.openBy(oEvent.getSource());
    },

    onMapControlsHelp: function (oEvent) {
      if (!this._oMapHelpPopover) {
        this._oMapHelpPopover = this._buildHelpPopover(
          "Map Controls Guide", "Bottom", "28rem",
          [
            {
              icon: "sap-icon://search", color: "#0a6ed1",
              title: "Bridge Search",
              purpose: "Quickly locate a specific bridge by name or ID without manually scanning the map.",
              howToUse: "Type any part of the bridge name into the search bar at the top of the left panel. Matching bridges are highlighted on the map and listed in the results panel below. Clear the field to return to the full bridge set."
            },
            {
              icon: "sap-icon://map-2", color: "#0a6ed1",
              title: "Spatial Select",
              purpose: "Select a custom subset of bridges by drawing a boundary directly on the map: useful for corridor or catchment analysis.",
              howToUse: "Click Spatial Select in the toolbar → click and drag on the map to draw a freehand selection polygon → release to close the shape. All bridges inside the polygon are selected and shown in the results list. Click Spatial Select again or press Escape to cancel."
            },
            {
              icon: "sap-icon://full-screen", color: "#0a6ed1",
              title: "Fit to Australia",
              purpose: "Instantly reset the map viewport to show the full national extent with all loaded bridges in view.",
              howToUse: "Click the Fit Australia button in the map toolbar. The map pans and zooms to the full Australian bounding box. Useful after navigating deep into a region and wanting a quick reset."
            },
            {
              icon: "sap-icon://resize", color: "#52616f",
              title: "Zoom to Selection",
              purpose: "Focus the map tightly on only the bridges you currently have selected.",
              howToUse: "Select one or more bridges (via search, spatial select, or by clicking markers) → click Zoom to Selection. The map fits to the bounding box of the selected bridges. The button is disabled when no selection is active."
            },
            {
              icon: "sap-icon://refresh", color: "#0a6ed1",
              title: "Refresh Data",
              purpose: "Reload the latest bridge and restriction data from the server without navigating away from the map.",
              howToUse: "Click Refresh in the toolbar. All bridge markers, restriction overlays, and statistics are re-fetched from the server using your current filter settings. Use this after saving changes in the Bridge Register or after receiving notification that data has been updated."
            },
            {
              icon: "sap-icon://download", color: "#0a6ed1",
              title: "Export",
              purpose: "Download the bridges currently shown on the map for use in GIS tools, reports, or spreadsheets.",
              howToUse: "Click Export → select a format: GeoJSON (includes coordinates and all attributes: compatible with QGIS, ArcGIS, and MapInfo) or CSV (flat table, spreadsheet-compatible). Only bridges matching your active search and filter settings are exported."
            },
            {
              icon: "sap-icon://list", color: "#0a6ed1",
              title: "Split / List View",
              purpose: "View the bridge results table alongside the map without leaving the map context.",
              howToUse: "Click List in the toolbar → the results table slides in next to the map (split view). Click a table row to fly to and highlight that bridge on the map. Click List again to hide the table and return to full-screen map mode."
            },
            {
              icon: "sap-icon://locate-me", color: "#7c3aed",
              title: "GPS / Locate Me",
              purpose: "Centre the map on your current physical location: useful for field inspections.",
              howToUse: "Click the GPS button in the map controls (bottom-right). Your browser will request location permission the first time. Once granted, the map flies to your current position and places a blue location marker. The marker updates as you move."
            }
          ],
          "_oMapHelpPopover"
        );
      }
      this._oMapHelpPopover.openBy(oEvent.getSource());
    },

    // ─── Heat Map ─────────────────────────────────────────────────────────────

    onToggleHeatmap: function (oEvent) {
      var active = oEvent.getParameter("state");
      this._vm().setProperty("/heatmapActive", active);
      if (active) {
        this._renderHeatmap();
      } else if (this._heatLayer && this._leafletMap) {
        this._leafletMap.removeLayer(this._heatLayer);
        this._heatLayer = null;
      }
    },

    _renderHeatmap: function () {
      if (!this._leafletMap || !window.L || !window.L.heatLayer) return;
      var bridges = this._vm().getProperty("/bridges") || [];
      var cfg = this._gisConfig || {};
      var points = bridges.filter(function (bridge) {
        return Number.isFinite(bridge.latitude) && Number.isFinite(bridge.longitude);
      }).map(function (bridge) {
        var intensity = bridge.conditionRating != null ? (10 - bridge.conditionRating) / 10 : 0.5;
        return [bridge.latitude, bridge.longitude, intensity];
      });

      if (this._heatLayer) {
        this._leafletMap.removeLayer(this._heatLayer);
      }
      this._heatLayer = window.L.heatLayer(points, {
        radius: cfg.heatmapRadius || 20,
        blur: cfg.heatmapBlur || 15,
        maxZoom: 17
      }).addTo(this._leafletMap);
    },

    // ─── Condition Alerts ─────────────────────────────────────────────────────

    onToggleConditionAlerts: function (oEvent) {
      var active = oEvent.getParameter("state");
      this._vm().setProperty("/conditionAlertsActive", active);
      this._renderConditionAlerts();
    },

    _renderConditionAlerts: function () {
      if (!this._leafletMap || !window.L) return;
      var active = this._vm().getProperty("/conditionAlertsActive");
      if (this._conditionAlertLayer) {
        this._leafletMap.removeLayer(this._conditionAlertLayer);
        this._conditionAlertLayer = null;
      }
      if (!active) return;

      var threshold = (this._gisConfig && this._gisConfig.conditionAlertThreshold) || 3;
      var bridges = this._vm().getProperty("/bridges") || [];
      var alerts = bridges.filter(function (bridge) {
        return bridge.conditionRating != null && bridge.conditionRating <= threshold;
      });

      this._conditionAlertLayer = window.L.layerGroup();
      alerts.forEach(function (bridge) {
        var icon = window.L.divIcon({
          className: "",
          html: "<div class='condAlert'>\u26A0</div>",
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        window.L.marker([bridge.latitude, bridge.longitude], { icon: icon })
          .bindPopup("<strong>Condition Alert</strong><br>" + bridge.bridgeName + "<br>Rating: " + bridge.conditionRating)
          .addTo(this._conditionAlertLayer);
      }.bind(this));

      this._conditionAlertLayer.addTo(this._leafletMap);
    },

    // ─── Statistics Panel ─────────────────────────────────────────────────────

    _updateStats: function () {
      var bridges = this._vm().getProperty("/bridges") || [];
      if (!bridges.length) {
        this._vm().setProperty("/stats", { total: 0, avgCondition: "-", poor: 0, restricted: 0, closed: 0 });
        return;
      }
      var rated = bridges.filter(function (bridge) { return bridge.conditionRating != null; });
      var avgCondition = rated.length
        ? (rated.reduce(function (ratingTotal, bridge) { return ratingTotal + bridge.conditionRating; }, 0) / rated.length).toFixed(1)
        : "-";
      var threshold = (this._gisConfig && this._gisConfig.conditionAlertThreshold) || 3;
      this._vm().setProperty("/stats", {
        total: bridges.length,
        avgCondition: avgCondition,
        poor: bridges.filter(function (bridge) { return bridge.conditionRating != null && bridge.conditionRating <= threshold; }).length,
        restricted: bridges.filter(function (bridge) { return bridge.postingStatus === "Restricted" || bridge.postingStatus === "Under Review"; }).length,
        closed: bridges.filter(function (bridge) { return bridge.postingStatus === "Closed"; }).length
      });
    },

    // ─── Time Slider ──────────────────────────────────────────────────────────

    onTimeSliderChange: function (oEvent) {
      var from = oEvent.getParameter("value");
      var to = oEvent.getParameter("value2") !== undefined ? oEvent.getParameter("value2") : oEvent.getParameter("value");
      this._vm().setProperty("/timeSlider/fromYear", from);
      this._vm().setProperty("/timeSlider/toYear", to);
      this._vm().setProperty("/timeSlider/active", true);
      var filters = this._vm().getProperty("/filters") || {};
      filters.minYear = from;
      filters.maxYear = to;
      this._vm().setProperty("/filters", filters);
      this._applyFilters();
    },

    onResetTimeSlider: function () {
      var limits = this._vm().getProperty("/limits");
      this._vm().setProperty("/timeSlider/active", false);
      var filters = this._vm().getProperty("/filters") || {};
      filters.minYear = limits.minYear;
      filters.maxYear = limits.maxYear;
      this._vm().setProperty("/filters", filters);
      this._applyFilters();
    },

    // ─── Proximity Analysis ───────────────────────────────────────────────────

    onRunProximity: function () {
      var model = this._vm();
      var lat = model.getProperty("/proximity/lat");
      var lng = model.getProperty("/proximity/lng");
      var radius = model.getProperty("/proximity/radius") || 10;
      if (!lat || !lng) {
        if (this._leafletMap) {
          var center = this._leafletMap.getCenter();
          lat = center.lat.toFixed(5);
          lng = center.lng.toFixed(5);
          model.setProperty("/proximity/lat", lat);
          model.setProperty("/proximity/lng", lng);
        } else {
          sap.m.MessageToast.show(this._text("errProximityCoords"));
          return;
        }
      }
      model.setProperty("/proximity/loading", true);
      fetch("/map/api/proximity?lat=" + lat + "&lng=" + lng + "&radius=" + radius)
        .then(function (res) { return res.ok ? res.json() : Promise.reject(res.statusText); })
        .then(function (data) {
          var results = data.bridges || [];
          model.setProperty("/proximity/results", results);
          model.setProperty("/proximity/count", results.length);
          model.setProperty("/proximity/active", true);
          model.setProperty("/proximity/loading", false);
          this._renderProximityResults(lat, lng, radius, results);
        }.bind(this))
        .catch(function () {
          model.setProperty("/proximity/loading", false);
          sap.m.MessageToast.show(this._text("errProximityFailed"));
        });
    },

    onClearProximity: function () {
      var model = this._vm();
      model.setProperty("/proximity/active", false);
      model.setProperty("/proximity/results", []);
      model.setProperty("/proximity/count", 0);
      if (this._proximityCircle && this._leafletMap) {
        this._leafletMap.removeLayer(this._proximityCircle);
        this._proximityCircle = null;
      }
      if (this._proximityLayer && this._leafletMap) {
        this._leafletMap.removeLayer(this._proximityLayer);
        this._proximityLayer = null;
      }
    },

    _renderProximityResults: function (lat, lng, radiusKm, results) {
      if (!this._leafletMap || !window.L) return;
      this.onClearProximity();
      var center = [parseFloat(lat), parseFloat(lng)];
      this._proximityCircle = window.L.circle(center, {
        radius: radiusKm * 1000,
        color: "#7c3aed",
        weight: 2,
        fillOpacity: 0.08,
        dashArray: "6 4"
      }).addTo(this._leafletMap);

      this._proximityLayer = window.L.layerGroup();
      results.forEach(function (nearbyBridge) {
        window.L.circleMarker([nearbyBridge.latitude, nearbyBridge.longitude], {
          radius: 8, color: "#7c3aed", fillColor: "#a78bfa", fillOpacity: 0.9, weight: 2
        }).bindPopup("<strong>" + (nearbyBridge.bridgeName || "Bridge") + "</strong><br>" + (nearbyBridge.bridgeId || ""))
          .addTo(this._proximityLayer);
      }.bind(this));
      this._proximityLayer.addTo(this._leafletMap);

      if (results.length) {
        var nearbyBridgePoints = results.map(function (nearbyBridge) { return [nearbyBridge.latitude, nearbyBridge.longitude]; });
        nearbyBridgePoints.push(center);
        this._leafletMap.fitBounds(window.L.latLngBounds(nearbyBridgePoints).pad(0.15));
      }
    },

    // ─── MGA Coordinates ──────────────────────────────────────────────────────

    _wgs84ToMga: function (lat, lng) {
      var zone = Math.floor((lng + 180) / 6) + 1;
      var cm = (zone - 1) * 6 - 180 + 3;
      var semiMajorAxis = 6378137.0, flattening = 1 / 298.257222101;
      var semiMinorAxis = semiMajorAxis * (1 - flattening);
      var eccentricitySquared = (semiMajorAxis * semiMajorAxis - semiMinorAxis * semiMinorAxis) / (semiMajorAxis * semiMajorAxis);
      var scaleFactor = 0.9996, falseEasting = 500000, falseNorthing = 10000000;
      var latRad = lat * Math.PI / 180;
      var dLng = (lng - cm) * Math.PI / 180;
      var radiusOfCurvature = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * Math.sin(latRad) * Math.sin(latRad));
      var tangentSquared = Math.tan(latRad) * Math.tan(latRad);
      var secondEccentricityTerm = eccentricitySquared / (1 - eccentricitySquared) * Math.cos(latRad) * Math.cos(latRad);
      var A2 = Math.cos(latRad) * dLng;
      var meridionalArc = semiMajorAxis * ((1 - eccentricitySquared / 4 - 3 * eccentricitySquared * eccentricitySquared / 64) * latRad
        - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared * eccentricitySquared / 32) * Math.sin(2 * latRad)
        + (15 * eccentricitySquared * eccentricitySquared / 256) * Math.sin(4 * latRad));
      var easting = scaleFactor * radiusOfCurvature * (A2 + (1 - tangentSquared + secondEccentricityTerm) * A2 * A2 * A2 / 6) + falseEasting;
      var northing = scaleFactor * (meridionalArc + radiusOfCurvature * Math.tan(latRad) * (A2 * A2 / 2 + (5 - tangentSquared + 9 * secondEccentricityTerm) * Math.pow(A2, 4) / 24)) + falseNorthing;
      return { zone: zone, easting: Math.round(easting), northing: Math.round(northing) };
    },

    _updateMgaCoords: function (lat, lng) {
      if (!this._feat("mgaCoords")) return;
      var mga = this._wgs84ToMga(lat, lng);
      this._vm().setProperty("/mgaCoords", {
        zone: mga.zone,
        easting: mga.easting,
        northing: mga.northing,
        text: "MGA Z" + mga.zone + " " + mga.easting + "E " + mga.northing + "N"
      });
    },

    // ─── Minimap toggle ───────────────────────────────────────────────────────

    onToggleMinimap: function (oEvent) {
      var active = oEvent.getParameter("state");
      this._vm().setProperty("/minimapActive", active);
      if (this._minimapControl) {
        if (active) {
          this._minimapControl._restore && this._minimapControl._restore();
        } else {
          this._minimapControl._minimize && this._minimapControl._minimize();
        }
      }
    }
  });
});
