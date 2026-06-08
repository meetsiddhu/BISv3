(function () {
    var SERVICE  = "/odata/v4/admin";
    // Resolve the app base URL relative to the component so Leaflet assets load both
    // in local dev (/admin-bridges/webapp) and in the deployed HTML5 repo
    // (/BridgeManagementadminbridges). A hardcoded path 404s in the other environment.
    var APP_PATH = (window.sap && sap.ui && sap.ui.require && sap.ui.require.toUrl)
        ? sap.ui.require.toUrl("BridgeManagement/adminbridges")
        : "/admin-bridges/webapp";
    var MAP_APP  = "";  // set to "/map-view/webapp/index.html" when deployed

    var LEAFLET = APP_PATH + "/lib/leaflet";
    var STATUS_COLOR = {
        Unrestricted: "#107e3e",
        Restricted:   "#e9730c",
        "Under Review": "#c35500",
        Closed:        "#bb0000"
    };
    var _map = null;

    // ── i18n (FREE_UX-R1) ─────────────────────────────────────────────────────
    // This injected script has no controller, so it loads the app resource bundle
    // itself and reads texts with an English fallback (so the map still renders if
    // the bundle is unavailable). T(key, fallback) is the accessor.
    var _bundle = null;
    function T(sKey, sFallback) {
        try { return (_bundle && _bundle.getText) ? _bundle.getText(sKey) : sFallback; }
        catch (_e) { return sFallback; }
    }
    function loadBundle(cb) {
        if (_bundle || !(window.sap && sap.ui && sap.ui.require)) { cb(); return; }
        try {
            sap.ui.require(["sap/base/i18n/ResourceBundle"], function (ResourceBundle) {
                try {
                    ResourceBundle.create({ url: APP_PATH + "/i18n/i18n.properties", async: true })
                        .then(function (b) { _bundle = b; cb(); })
                        .catch(function () { cb(); });
                } catch (_e) { cb(); }
            });
        } catch (_e) { cb(); }
    }

    // ── Structure builder ───────────────────────────────────────────────────
    // Injects the full map UI into #gisMapHostEl the first time _gisInit runs.
    // Bypasses sap.ui.core.HTML content parsing (and jQuery DOMEval) entirely.
    function ensureStructure() {
        if (document.getElementById("gisMapCanvas")) return; // already built
        var host = document.getElementById("gisMapHostEl");
        if (!host) return; // host element not yet in DOM

        var wrapper = document.createElement("div");
        wrapper.style.cssText = "border-radius:8px;border:1px solid #e5e5e5;overflow:hidden;font-family:72,Arial,sans-serif;margin:0.5rem";

        // Header bar
        var header = document.createElement("div");
        header.style.cssText = "display:flex;align-items:center;padding:10px 14px;background:#fff;border-bottom:1px solid #e5e5e5";

        var title = document.createElement("span");
        title.style.cssText = "font-size:15px;font-weight:600;color:#32363a";
        title.textContent = T("gisLocation", "Location");

        var spacer = document.createElement("div");
        spacer.style.cssText = "flex:1";

        var openBtn = document.createElement("button");
        openBtn.id = "gisOpenBtn";
        openBtn.type = "button";
        openBtn.setAttribute("aria-label", T("gisOpenMapAria", "Open map in full view"));
        openBtn.style.cssText = "padding:6px 14px;background:#0a6ed1;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;margin-right:6px";
        openBtn.textContent = "🗺 " + T("gisOpenMap", "Open Map");

        var copyBtn = document.createElement("button");
        copyBtn.id = "gisCopyBtn";
        copyBtn.type = "button";
        copyBtn.setAttribute("aria-label", T("gisCopyAria", "Copy coordinates to clipboard"));
        copyBtn.style.cssText = "padding:6px 10px;background:transparent;color:#0a6ed1;border:1px solid #0a6ed1;border-radius:4px;font-size:13px;cursor:pointer";
        copyBtn.textContent = "📋 " + T("gisCopy", "Copy");

        header.appendChild(title);
        header.appendChild(spacer);
        header.appendChild(openBtn);
        header.appendChild(copyBtn);

        // Coordinate bar
        var coordBar = document.createElement("div");
        coordBar.id = "gisCoordBar";
        coordBar.setAttribute("role", "status");
        coordBar.setAttribute("aria-live", "polite");
        coordBar.style.cssText = "padding:8px 14px;font-size:13px;color:#32363a;background:#fafafa;border-bottom:1px solid #e5e5e5";
        coordBar.textContent = "📍 " + T("gisLoading", "Loading…");

        // Map canvas (Leaflet target)
        var canvas = document.createElement("div");
        canvas.id = "gisMapCanvas";
        canvas.setAttribute("role", "application");
        canvas.setAttribute("aria-label", T("gisMapAria", "Interactive bridge location map"));
        canvas.style.cssText = "width:100%;height:360px";

        // No-coordinates placeholder
        var noCoords = document.createElement("div");
        noCoords.id = "gisNoCoords";
        noCoords.style.cssText = "display:none;align-items:center;justify-content:center;flex-direction:column;height:220px;color:#8696a9;text-align:center";

        var noIcon = document.createElement("div");
        noIcon.style.cssText = "font-size:40px;margin-bottom:8px";
        noIcon.textContent = "🗺";

        var noLabel = document.createElement("div");
        noLabel.style.cssText = "font-weight:600";
        noLabel.textContent = T("gisNoLocation", "No Location Data");

        var noHint = document.createElement("div");
        noHint.style.cssText = "font-size:12px;color:#aaa;margin-top:4px";
        noHint.textContent = T("gisNoLocationHint", "Add latitude and longitude to see the map.");

        noCoords.appendChild(noIcon);
        noCoords.appendChild(noLabel);
        noCoords.appendChild(noHint);

        wrapper.appendChild(header);
        wrapper.appendChild(coordBar);
        wrapper.appendChild(canvas);
        wrapper.appendChild(noCoords);
        host.appendChild(wrapper);
    }

    // ── Key/ID helpers ──────────────────────────────────────────────────────
    function getBridgeKeyPredicate() {
        var bridgeKeyMatch = (window.location.hash || "").match(/Bridges\(ID=(\d+),IsActiveEntity=(true|false)\)/);
        if (!bridgeKeyMatch) return null;
        return "ID=" + bridgeKeyMatch[1] + ",IsActiveEntity=" + bridgeKeyMatch[2];
    }

    function getId() {
        var bridgeKeyMatch = (window.location.hash || "").match(/Bridges\(ID=(\d+)/);
        return bridgeKeyMatch ? bridgeKeyMatch[1] : null;
    }

    function readBridge(select) {
        var keyPredicate = getBridgeKeyPredicate();
        if (!keyPredicate) return Promise.reject(new Error("No bridge ID in URL"));
        return fetch(SERVICE + "/Bridges(" + keyPredicate + ")?$select=" + select)
            .then(function (bridgeResponse) {
                if (!bridgeResponse.ok) throw new Error("Bridge location is not available for this draft.");
                return bridgeResponse.json();
            });
    }

    // ── Public init ─────────────────────────────────────────────────────────
    window._gisInit = function () {
        loadBundle(function () {
            ensureStructure();
            var el = document.getElementById("gisMapCanvas");
            if (!el) return;
            var openBtn = document.getElementById("gisOpenBtn");
            if (openBtn && !openBtn._bmsWired) { openBtn._bmsWired = true; openBtn.addEventListener("click", window._gisOpen); }
            var copyBtn = document.getElementById("gisCopyBtn");
            if (copyBtn && !copyBtn._bmsWired) { copyBtn._bmsWired = true; copyBtn.addEventListener("click", window._gisCopy); }
            if (!getBridgeKeyPredicate()) { setCoord(T("gisNoBridgeId", "No bridge ID in URL")); return; }
            readBridge("latitude,longitude,bridgeName,bridgeId,state,postingStatus,geoJson")
                .then(draw)
                .catch(function (error) { setCoord(T("gisErrorPrefix", "Error:") + " " + error.message); });
        });
    };

    // Parse a stored GeoJSON string safely; return null on any problem.
    function parseGeo(raw) {
        if (!raw) return null;
        try { var g = typeof raw === "string" ? JSON.parse(raw) : raw; return (g && g.type) ? g : null; }
        catch (_e) { return null; }
    }

    // ── Map drawing ─────────────────────────────────────────────────────────
    function draw(bridgeLocation) {
        var lat = parseFloat(bridgeLocation.latitude), lng = parseFloat(bridgeLocation.longitude);
        var geo = parseGeo(bridgeLocation.geoJson);
        var hasPoint = !isNaN(lat) && !isNaN(lng);
        var noEl = document.getElementById("gisNoCoords");
        var canv = document.getElementById("gisMapCanvas");
        if (!hasPoint && !geo) {
            setCoord(T("gisNoCoords", "No coordinates for this record"));
            if (noEl) noEl.style.display = "flex";
            if (canv) canv.style.display = "none";
            return;
        }
        if (hasPoint) {
            setCoord("<strong>" + T("gisLat", "Lat:") + "</strong> " + lat.toFixed(6) + " &nbsp; <strong>" + T("gisLng", "Lng:") + "</strong> " + lng.toFixed(6) +
                     (geo ? " &nbsp; <strong>" + T("gisGeometry", "Geometry:") + "</strong> " + geo.type : ""));
        } else {
            setCoord("<strong>" + T("gisGeometry", "Geometry:") + "</strong> " + geo.type);
        }
        if (noEl) noEl.style.display = "none";
        if (canv) canv.style.display = "block";
        loadLeaflet(function () {
            if (_map) { try { _map.remove(); } catch (_error) {} _map = null; }
            var map = window.L.map(canv, { zoomControl: true, scrollWheelZoom: false });
            window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
            var colour = STATUS_COLOR[bridgeLocation.postingStatus] || "#0a6ed1";
            var fitBounds = null;
            // Stored GeoJSON geometry: Point / LineString (polyline) / Polygon / Multi*.
            if (geo) {
                try {
                    var gj = window.L.geoJSON(geo, {
                        style: function (f) {
                            var t = (f && f.geometry && f.geometry.type) || geo.type;
                            if (/Polygon/.test(t)) return { color: colour, weight: 2, fillColor: colour, fillOpacity: 0.22 };
                            if (/LineString/.test(t)) return { color: colour, weight: 4, opacity: 0.9 };
                            return { color: colour, weight: 2 };
                        },
                        pointToLayer: function (f, ll) {
                            return window.L.circleMarker(ll, { radius: 7, color: "#fff", weight: 2, fillColor: colour, fillOpacity: 0.9 });
                        }
                    }).addTo(map);
                    var gb = gj.getBounds();
                    if (gb && gb.isValid()) fitBounds = gb;
                } catch (_e) { /* fall back to point */ }
            }
            if (hasPoint) {
                window.L.circleMarker([lat, lng],
                    { radius: 10, color: "#fff", weight: 2, fillColor: colour, fillOpacity: 0.9 })
                    .bindPopup("<b>" + (bridgeLocation.bridgeName || "") + "</b><br><small>" +
                               (bridgeLocation.bridgeId || "") + " · " + (bridgeLocation.state || "") + "</small>")
                    .addTo(map);
                fitBounds = fitBounds ? fitBounds.extend([lat, lng]) : null;
            }
            if (fitBounds && fitBounds.isValid()) { map.fitBounds(fitBounds.pad(0.25)); }
            else if (hasPoint) { map.setView([lat, lng], 14); }
            _map = map;
            // FE lazy-renders object-page sections; if the map initialised while the
            // section had no size, Leaflet renders blank until invalidateSize is called.
            setTimeout(function () { try { map.invalidateSize(); } catch (_e) {} }, 250);
        });
    }

    function loadLeaflet(cb) {
        if (window.L) { cb(); return; }
        if (!document.getElementById("_gis_css")) {
            var leafletStylesheet = document.createElement("link");
            leafletStylesheet.id = "_gis_css"; leafletStylesheet.rel = "stylesheet"; leafletStylesheet.href = LEAFLET + "/leaflet.css";
            document.head.appendChild(leafletStylesheet);
        }
        // AMD shim (the bug): in a SAPUI5 page window.define (the AMD loader) is present
        // with define.amd, so Leaflet's UMD wrapper registers as an anonymous AMD module
        // instead of setting window.L — leaving window.L undefined and the map blank even
        // though leaflet.js loads HTTP-200. Hide define while Leaflet executes so it falls
        // through to the browser-global branch and sets window.L, then restore define.
        var _amdDefine = window.define;
        function afterLoad() {
            if (_amdDefine) { window.define = _amdDefine; }
            if (window.L && window.L.Icon && window.L.Icon.Default)
                window.L.Icon.Default.mergeOptions({
                    iconUrl:       LEAFLET + "/images/marker-icon.png",
                    iconRetinaUrl: LEAFLET + "/images/marker-icon-2x.png",
                    shadowUrl:     LEAFLET + "/images/marker-shadow.png"
                });
            cb();
        }
        var leafletScript = document.createElement("script");
        leafletScript.src = LEAFLET + "/leaflet.js";
        leafletScript.onload = afterLoad;
        leafletScript.onerror = function () {
            // CDN fallback — keep define hidden through its execution too.
            var fallbackLeafletScript = document.createElement("script");
            fallbackLeafletScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            fallbackLeafletScript.onload = afterLoad;
            fallbackLeafletScript.onerror = function () { if (_amdDefine) { window.define = _amdDefine; } cb(); };
            document.head.appendChild(fallbackLeafletScript);
        };
        if (_amdDefine) { window.define = undefined; }
        document.head.appendChild(leafletScript);
    }

    function setCoord(html) {
        var coordinateBar = document.getElementById("gisCoordBar");
        if (coordinateBar) coordinateBar.innerHTML = "📍 " + html;
    }

    // ── Button actions ──────────────────────────────────────────────────────
    window._gisOpen = function () {
        var id = getId();
        if (id && MAP_APP) {
            window.open(MAP_APP + "?highlightId=" + encodeURIComponent(id), "_blank", "noopener,noreferrer");
        } else if (id) {
            window.location.hash = "Map-display?bridgeId=" + id;
        }
    };

    window._gisCopy = function () {
        if (!getBridgeKeyPredicate()) return;
        readBridge("latitude,longitude")
            .then(function (bridgeLocation) {
                if (bridgeLocation.latitude && bridgeLocation.longitude) {
                    var bridgeCoordinates = bridgeLocation.latitude + ", " + bridgeLocation.longitude;
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(bridgeCoordinates).then(function () {
                            try { sap.m.MessageToast.show(T("gisCopied", "Copied:") + " " + bridgeCoordinates); } catch (_error) {}
                        });
                    }
                }
            });
    };

    // ── Hash-change re-init ─────────────────────────────────────────────────
    window.addEventListener("hashchange", function () {
        if (window.location.hash.indexOf("/Bridges(") !== -1) {
            var el = document.getElementById("gisMapCanvas");
            if (el) { el._gisReady = false; setTimeout(window._gisInit, 600); }
        }
    });

    // ── Render trigger ──────────────────────────────────────────────────────
    // The Map object-page section is LAZY-rendered by Fiori Elements: #gisMapHostEl
    // only enters the DOM when the user opens the Map tab — which can be long after
    // this script self-invokes. Watch for the host appearing (and not yet built) and
    // build the map then. This is the actual render trigger; the self-call below only
    // catches the case where the section is already present.
    try {
        var _gisHostObserver = new MutationObserver(function () {
            if (document.getElementById("gisMapHostEl") && !document.getElementById("gisMapCanvas")) {
                window._gisInit();
            }
        });
        _gisHostObserver.observe(document.body, { childList: true, subtree: true });
    } catch (_e) { /* MutationObserver unavailable — rely on self-call + hashchange */ }

    window._gisInit();
}());
