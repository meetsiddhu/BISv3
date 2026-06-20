"use strict";

const cds = require("@sap/cds");

// ─────────────────────────────────────────────────────────────────────────────
// Demo Data Handler — Fictional Bridge Dataset
// Loads / clears a curated set of fictional, representative bridges for
// demonstration purposes. All bridge names, locations and identifiers are
// invented; engineering attributes are representative of a typical Australian
// state road network.
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_BRIDGES = [
  // ── Sydney Metropolitan ─────────────────────────────────────────────────────────────
  {
    ID: 1001, bridgeId: "BRG-NSW-SYD-001", bridgeName: "Harbour Gate Bridge",
    assetClass: "Road Bridge", route: "Harbour City Expressway", routeNumber: "A8",
    state: "NSW", region: "Sydney Metropolitan", lga: "North Haven",
    latitude: -33.791200, longitude: 151.252400, location: "Kestrel Harbour",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Arch Bridge", yearBuilt: 1932, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 49.0, spanLength: 503.0,
    material: "Steel", spanCount: 1, totalLength: 1149.0, deckWidth: 48.8,
    numberOfLanes: 8, condition: "Good", conditionRating: 8,
    structuralAdequacyRating: 9, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-11-14", nhvrAssessed: true, nhvrAssessmentDate: "2025-11-20",
    loadRating: 42.5, averageDailyTraffic: 160000, heavyVehiclePercent: 18.5,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Landmark steel arch bridge. Major strategic crossing with ongoing structural monitoring program.",
    geoJson: '{"type":"LineString","coordinates":[[151.248,-33.791],[151.252,-33.791]]}',
    floodImpacted: false
  },
  {
    ID: 1002, bridgeId: "BRG-NSW-SYD-002", bridgeName: "Blackwattle Crossing",
    assetClass: "Road Bridge", route: "City West Link", routeNumber: "M4",
    state: "NSW", region: "Sydney Metropolitan", lga: "Harborside",
    latitude: -33.841500, longitude: 151.148900, location: "Kestrel Bay",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Cable-stayed Bridge", yearBuilt: 1995, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 40.0, spanLength: 345.0,
    material: "Concrete and Steel", spanCount: 3, totalLength: 805.0, deckWidth: 32.2,
    numberOfLanes: 6, condition: "Good", conditionRating: 7,
    structuralAdequacyRating: 8, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-10-02", nhvrAssessed: true, nhvrAssessmentDate: "2025-10-08",
    loadRating: 36.5, averageDailyTraffic: 95000, heavyVehiclePercent: 16.25,
    freightRoute: true, overMassRoute: false, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Major cable-stayed bridge linking inner-city precincts. Urban freight corridor.",
    geoJson: '{"type":"LineString","coordinates":[[151.153,-33.841],[151.149,-33.841]]}',
    floodImpacted: false
  },
  {
    ID: 1003, bridgeId: "BRG-NSW-SYD-003", bridgeName: "Riverview Arch Bridge",
    assetClass: "Road Bridge", route: "River Road", routeNumber: "A40",
    state: "NSW", region: "Sydney Metropolitan", lga: "Riverton",
    latitude: -33.804300, longitude: 151.098200, location: "Greywood River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Arch Bridge", yearBuilt: 1964, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 29.3, spanLength: 305.0,
    material: "Concrete", spanCount: 1, totalLength: 579.0, deckWidth: 22.8,
    numberOfLanes: 4, condition: "Fair", conditionRating: 6,
    structuralAdequacyRating: 7, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-08-19", nhvrAssessed: true, nhvrAssessmentDate: "2025-09-01",
    loadRating: 32.0, averageDailyTraffic: 72000, heavyVehiclePercent: 9.0,
    freightRoute: false, overMassRoute: false, hmlApproved: false, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Long-span concrete arch. Approaching end of design life — major inspection 2026.",
    geoJson: '{"type":"LineString","coordinates":[[151.094,-33.804],[151.099,-33.804]]}',
    floodImpacted: false
  },
  {
    ID: 1004, bridgeId: "BRG-NSW-SYD-004", bridgeName: "Coxley Cove Bridge",
    assetClass: "Road Bridge", route: "River Road", routeNumber: "A40",
    state: "NSW", region: "Sydney Metropolitan", lga: "Westbay",
    latitude: -33.882600, longitude: 151.118300, location: "Coxley Cove",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Girder Bridge", yearBuilt: 1953, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 12.0, spanLength: 64.0,
    material: "Steel", spanCount: 5, totalLength: 340.0, deckWidth: 18.6,
    numberOfLanes: 4, condition: "Fair", conditionRating: 5,
    structuralAdequacyRating: 5, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-06-12", nhvrAssessed: true, nhvrAssessmentDate: "2025-06-20",
    loadRating: 28.0, averageDailyTraffic: 55000, heavyVehiclePercent: 8.2,
    freightRoute: false, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "Ageing steel girder structure with load restrictions. Replacement feasibility study underway.",
    geoJson: '{"type":"LineString","coordinates":[[151.116,-33.882],[151.121,-33.882]]}',
    floodImpacted: false
  },
  {
    ID: 1005, bridgeId: "BRG-NSW-SYD-005", bridgeName: "Marlow Creek Bridge",
    assetClass: "Road Bridge", route: "Coastal Motorway", routeNumber: "M1",
    state: "NSW", region: "Sydney Metropolitan", lga: "Brackenridge",
    latitude: -33.456800, longitude: 151.298400, location: "Marlow Creek",
    assetOwner: "State Roads Authority", managingAuthority: "Motorway Concession Operator",
    structureType: "Box Girder Bridge", yearBuilt: 1986, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 67.0, spanLength: 240.0,
    material: "Concrete", spanCount: 2, totalLength: 292.0, deckWidth: 13.2,
    numberOfLanes: 4, condition: "Good", conditionRating: 8,
    structuralAdequacyRating: 8, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-09-05", nhvrAssessed: true, nhvrAssessmentDate: "2025-09-12",
    loadRating: 40.0, averageDailyTraffic: 85000, heavyVehiclePercent: 22.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "High-level box girder crossing at 67 m. Critical freight link on the coastal motorway corridor.",
    geoJson: '{"type":"LineString","coordinates":[[151.296,-33.457],[151.301,-33.457]]}',
    floodImpacted: false
  },
  {
    ID: 1006, bridgeId: "BRG-NSW-SYD-006", bridgeName: "Westbrook Bridge",
    assetClass: "Road Bridge", route: "Bridge Street", routeNumber: "B8",
    state: "NSW", region: "Sydney Metropolitan", lga: "Westbrook",
    latitude: -33.548700, longitude: 150.748200, location: "Greywood River",
    assetOwner: "Westbrook Shire Council", managingAuthority: "Westbrook Shire Council",
    structureType: "Cable-stayed Bridge", yearBuilt: 2018, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 11.8, spanLength: 140.0,
    material: "Concrete and Steel", spanCount: 3, totalLength: 320.0, deckWidth: 14.5,
    numberOfLanes: 2, condition: "Excellent", conditionRating: 10,
    structuralAdequacyRating: 10, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-11-01", nhvrAssessed: true, nhvrAssessmentDate: "2025-11-05",
    loadRating: 45.0, averageDailyTraffic: 18000, heavyVehiclePercent: 12.0,
    freightRoute: true, overMassRoute: false, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "New 2018 replacement. Critical flood-immunity bridge — designed to 1 in 100-year ARI. Elevated 4m above original.",
    geoJson: '{"type":"LineString","coordinates":[[150.746,-33.549],[150.751,-33.549]]}',
    floodImpacted: false
  },
  {
    ID: 1007, bridgeId: "BRG-NSW-SYD-007", bridgeName: "Tarlington Bridge",
    assetClass: "Road Bridge", route: "Tarlington Road", routeNumber: "B87",
    state: "NSW", region: "Sydney Metropolitan", lga: "Riverton",
    latitude: -33.768900, longitude: 151.052600, location: "Greywood River",
    assetOwner: "Riverton City Council", managingAuthority: "Riverton City Council",
    structureType: "Truss Bridge", yearBuilt: 1935, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 9.5, spanLength: 98.0,
    material: "Steel", spanCount: 3, totalLength: 311.0, deckWidth: 10.2,
    numberOfLanes: 2, condition: "Poor", conditionRating: 3,
    structuralAdequacyRating: 3, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-07-22", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 18.0, averageDailyTraffic: 22000, heavyVehiclePercent: 6.0,
    freightRoute: false, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "90-year-old steel truss with significant section loss on lower chord members. Load restriction in place. Replacement planned 2027.",
    geoJson: '{"type":"LineString","coordinates":[[151.049,-33.769],[151.055,-33.769]]}',
    floodImpacted: false
  },
  // ── Hunter ───────────────────────────────────────────────────────────────────
  {
    ID: 1008, bridgeId: "BRG-NSW-HUN-001", bridgeName: "Heaton Bascule Bridge",
    assetClass: "Road Bridge", route: "Coastal Highway", routeNumber: "A1",
    state: "NSW", region: "Hunter", lga: "Port Heaton",
    latitude: -32.896400, longitude: 151.612800, location: "Heaton River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Bascule Bridge", yearBuilt: 1975, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 4.6, spanLength: 45.7,
    material: "Steel", spanCount: 7, totalLength: 322.0, deckWidth: 12.0,
    numberOfLanes: 2, condition: "Fair", conditionRating: 5,
    structuralAdequacyRating: 5, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-08-30", nhvrAssessed: true, nhvrAssessmentDate: "2025-09-10",
    loadRating: 25.0, averageDailyTraffic: 38000, heavyVehiclePercent: 19.0,
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Bascule opening bridge on major freight corridor. Scour monitoring programme active. Flood affected Jan 2023.",
    geoJson: '{"type":"LineString","coordinates":[[151.610,-32.896],[151.616,-32.896]]}',
    floodImpacted: true
  },
  {
    ID: 1009, bridgeId: "BRG-NSW-HUN-002", bridgeName: "Milfield Truss Bridge",
    assetClass: "Road Bridge", route: "Valley Street", routeNumber: "B64",
    state: "NSW", region: "Hunter", lga: "Milfield",
    latitude: -32.704200, longitude: 151.498600, location: "Heaton River",
    assetOwner: "Milfield Shire Council", managingAuthority: "Milfield Shire Council",
    structureType: "Truss Bridge", yearBuilt: 1896, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 7.2, spanLength: 80.0,
    material: "Steel", spanCount: 4, totalLength: 352.0, deckWidth: 8.4,
    numberOfLanes: 1, condition: "Poor", conditionRating: 2,
    structuralAdequacyRating: 2, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-05-14", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 12.0, averageDailyTraffic: 8500, heavyVehiclePercent: 4.5,
    freightRoute: false, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "130-year-old riveted steel truss. Emergency load limit 12t. Critical scour undermining at Pier 2. Replacement business case submitted.",
    geoJson: '{"type":"LineString","coordinates":[[151.496,-32.704],[151.502,-32.704]]}',
    floodImpacted: true
  },
  {
    ID: 1010, bridgeId: "BRG-NSW-HUN-003", bridgeName: "Carwell River Bridge",
    assetClass: "Road Bridge", route: "Coastal Highway", routeNumber: "A1",
    state: "NSW", region: "Hunter", lga: "Port Heaton",
    latitude: -32.612400, longitude: 151.992300, location: "Carwell River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1997, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 8.5, spanLength: 40.0,
    material: "Concrete", spanCount: 8, totalLength: 328.0, deckWidth: 13.4,
    numberOfLanes: 2, condition: "Good", conditionRating: 7,
    structuralAdequacyRating: 8, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-10-18", nhvrAssessed: true, nhvrAssessmentDate: "2025-10-25",
    loadRating: 38.5, averageDailyTraffic: 18000, heavyVehiclePercent: 24.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Modern PSC girder bridge. Bypass highway alignment. Regular heavy vehicle use.",
    geoJson: '{"type":"LineString","coordinates":[[151.989,-32.612],[151.996,-32.612]]}',
    floodImpacted: false
  },
  // ── Northern NSW / New England ───────────────────────────────────────────────
  {
    ID: 1011, bridgeId: "BRG-NSW-NOR-001", bridgeName: "Clarendon Bridge",
    assetClass: "Road Bridge", route: "Inland Way", routeNumber: "B65",
    state: "NSW", region: "Northern NSW", lga: "Clarendon Valley",
    latitude: -29.748600, longitude: 152.896400, location: "Clarendon River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Arch Truss Bridge", yearBuilt: 1932, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 14.3, spanLength: 118.0,
    material: "Steel", spanCount: 5, totalLength: 634.0, deckWidth: 9.8,
    numberOfLanes: 2, condition: "Fair", conditionRating: 5,
    structuralAdequacyRating: 5, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-09-25", nhvrAssessed: true, nhvrAssessmentDate: "2025-10-01",
    loadRating: 26.0, averageDailyTraffic: 12000, heavyVehiclePercent: 18.0,
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "Heritage swing-span truss. Shares dual-level with railway. Flood affected Feb 2022. Scour protection works 2024.",
    geoJson: '{"type":"LineString","coordinates":[[152.893,-29.749],[152.900,-29.749]]}',
    floodImpacted: true
  },
  {
    ID: 1012, bridgeId: "BRG-NSW-NOR-002", bridgeName: "Tallowood River Bridge",
    assetClass: "Road Bridge", route: "Coastal Highway", routeNumber: "A1",
    state: "NSW", region: "Northern NSW", lga: "Tallowood",
    latitude: -31.856300, longitude: 152.404800, location: "Tallowood River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1981, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 8.8, spanLength: 38.0,
    material: "Concrete", spanCount: 10, totalLength: 396.0, deckWidth: 12.2,
    numberOfLanes: 2, condition: "Fair", conditionRating: 6,
    structuralAdequacyRating: 6, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-07-08", nhvrAssessed: true, nhvrAssessmentDate: "2025-07-15",
    loadRating: 34.0, averageDailyTraffic: 24000, heavyVehiclePercent: 21.0,
    freightRoute: true, overMassRoute: false, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Key north coast freight route. Deck resurfacing 2022. Substructure inspection due 2026.",
    geoJson: '{"type":"LineString","coordinates":[[152.402,-31.856],[152.408,-31.856]]}',
    floodImpacted: true
  },
  {
    ID: 1013, bridgeId: "BRG-NSW-NOR-003", bridgeName: "Westhaven River Bridge",
    assetClass: "Road Bridge", route: "Tableland Highway", routeNumber: "B56",
    state: "NSW", region: "Northern NSW", lga: "Westhaven",
    latitude: -31.498200, longitude: 152.852400, location: "Westhaven River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1966, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 8.2, spanLength: 36.0,
    material: "Concrete", spanCount: 7, totalLength: 267.0, deckWidth: 11.0,
    numberOfLanes: 2, condition: "Fair", conditionRating: 5,
    structuralAdequacyRating: 5, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-06-19", nhvrAssessed: true, nhvrAssessmentDate: "2025-06-28",
    loadRating: 28.5, averageDailyTraffic: 16500, heavyVehiclePercent: 14.0,
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Ageing PSC structure approaching 60 years. Widening feasibility study in progress.",
    geoJson: '{"type":"LineString","coordinates":[[152.850,-31.498],[152.856,-31.498]]}',
    floodImpacted: false
  },
  {
    ID: 1014, bridgeId: "BRG-NSW-NOR-004", bridgeName: "Greenbank River Bridge",
    assetClass: "Road Bridge", route: "Coastal Highway", routeNumber: "A1",
    state: "NSW", region: "Northern NSW", lga: "Greenbank",
    latitude: -31.124600, longitude: 152.786200, location: "Greenbank River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Truss Bridge", yearBuilt: 1966, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 10.6, spanLength: 95.0,
    material: "Steel", spanCount: 4, totalLength: 410.0, deckWidth: 10.5,
    numberOfLanes: 2, condition: "Poor", conditionRating: 4,
    structuralAdequacyRating: 4, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-05-30", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 22.0, averageDailyTraffic: 13500, heavyVehiclePercent: 20.0,
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "Major north coast freight constraint. Rated 22t GML. Business case for replacement approved 2024 — construction 2027-2030.",
    geoJson: '{"type":"LineString","coordinates":[[152.783,-31.125],[152.790,-31.125]]}',
    floodImpacted: true
  },
  {
    ID: 1015, bridgeId: "BRG-NSW-NOR-005", bridgeName: "Fernleigh River Bridge",
    assetClass: "Road Bridge", route: "Coastal Highway", routeNumber: "A1",
    state: "NSW", region: "Northern NSW", lga: "Fernleigh",
    latitude: -30.548700, longitude: 152.948300, location: "Fernleigh River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1979, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 7.4, spanLength: 32.0,
    material: "Concrete", spanCount: 9, totalLength: 302.0, deckWidth: 11.8,
    numberOfLanes: 2, condition: "Fair", conditionRating: 6,
    structuralAdequacyRating: 6, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-08-11", nhvrAssessed: true, nhvrAssessmentDate: "2025-08-18",
    loadRating: 33.0, averageDailyTraffic: 9800, heavyVehiclePercent: 16.5,
    freightRoute: true, overMassRoute: false, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Flood-prone crossing — 1 in 10 ARI flood immunity. Deck waterproofing renewed 2021.",
    geoJson: '{"type":"LineString","coordinates":[[152.945,-30.549],[152.952,-30.549]]}',
    floodImpacted: true
  },
  // ── New England ──────────────────────────────────────────────────────────────
  {
    ID: 1016, bridgeId: "BRG-NSW-NEW-001", bridgeName: "Stonebrook River Bridge",
    assetClass: "Road Bridge", route: "Commerce Street", routeNumber: "B54",
    state: "NSW", region: "Western NSW", lga: "Stonebrook Regional",
    latitude: -32.296800, longitude: 148.512400, location: "Stonebrook River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1972, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 9.0, spanLength: 30.0,
    material: "Concrete", spanCount: 8, totalLength: 256.0, deckWidth: 11.4,
    numberOfLanes: 2, condition: "Fair", conditionRating: 5,
    structuralAdequacyRating: 6, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-09-03", nhvrAssessed: true, nhvrAssessmentDate: "2025-09-08",
    loadRating: 35.0, averageDailyTraffic: 11200, heavyVehiclePercent: 28.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Primary east-west freight crossing. High percentage heavy vehicles due to agricultural freight.",
    geoJson: '{"type":"LineString","coordinates":[[148.509,-32.297],[148.516,-32.297]]}',
    floodImpacted: false
  },
  {
    ID: 1017, bridgeId: "BRG-NSW-NEW-002", bridgeName: "Cooradah River Bridge",
    assetClass: "Road Bridge", route: "Inland Highway", routeNumber: "A39",
    state: "NSW", region: "Western NSW", lga: "Cooradah",
    latitude: -30.384200, longitude: 149.712600, location: "Cooradah River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1985, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 10.2, spanLength: 34.0,
    material: "Concrete", spanCount: 7, totalLength: 248.0, deckWidth: 12.0,
    numberOfLanes: 2, condition: "Good", conditionRating: 7,
    structuralAdequacyRating: 7, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-10-14", nhvrAssessed: true, nhvrAssessmentDate: "2025-10-20",
    loadRating: 37.5, averageDailyTraffic: 7600, heavyVehiclePercent: 32.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Major inland freight highway crossing. High agricultural freight use — cotton and grain season peaks.",
    geoJson: '{"type":"LineString","coordinates":[[149.710,-30.384],[149.716,-30.384]]}',
    floodImpacted: false
  },
  {
    ID: 1018, bridgeId: "BRG-NSW-NEW-003", bridgeName: "Pendleton River Bridge",
    assetClass: "Road Bridge", route: "Highlands Highway", routeNumber: "A15",
    state: "NSW", region: "New England", lga: "Pendleton Regional",
    latitude: -31.142400, longitude: 150.864200, location: "Pendleton River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Truss Bridge", yearBuilt: 1958, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 7.8, spanLength: 62.0,
    material: "Steel", spanCount: 3, totalLength: 199.0, deckWidth: 9.6,
    numberOfLanes: 2, condition: "Poor", conditionRating: 3,
    structuralAdequacyRating: 3, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-04-22", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 19.0, averageDailyTraffic: 9200, heavyVehiclePercent: 22.0,
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "67-year-old truss structure. GML 19t restricts B-double access on the highlands corridor. Replacement funding sought.",
    geoJson: '{"type":"LineString","coordinates":[[150.861,-31.142],[150.868,-31.142]]}',
    floodImpacted: false
  },
  // ── Southern NSW / Illawarra ─────────────────────────────────────────────────
  {
    ID: 1019, bridgeId: "BRG-NSW-ILL-001", bridgeName: "Saltwater River Bridge",
    assetClass: "Road Bridge", route: "South Coast Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Saltwater",
    latitude: -34.912600, longitude: 150.548200, location: "Saltwater River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Arch Truss Bridge", yearBuilt: 1881, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 11.0, spanLength: 88.0,
    material: "Steel", spanCount: 4, totalLength: 387.0, deckWidth: 9.2,
    numberOfLanes: 2, condition: "Poor", conditionRating: 3,
    structuralAdequacyRating: 3, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-03-17", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 16.0, averageDailyTraffic: 28000, heavyVehiclePercent: 15.0,
    dataSource: "DEMO", remarks: "Heritage listed 143-year-old wrought iron truss. GML 16t. Critical south coast bottleneck. Replacement under construction (2026 target).",
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    geoJson: '{"type":"LineString","coordinates":[[150.545,-34.913],[150.552,-34.913]]}',
    floodImpacted: false
  },
  {
    ID: 1020, bridgeId: "BRG-NSW-ILL-002", bridgeName: "Oyster Bay Bridge",
    assetClass: "Road Bridge", route: "South Coast Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Oyster Bay",
    latitude: -35.748600, longitude: 150.124800, location: "Oyster River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Cable-stayed Bridge", yearBuilt: 2023, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 20.0, spanLength: 200.0,
    material: "Concrete and Steel", spanCount: 3, totalLength: 425.0, deckWidth: 16.8,
    numberOfLanes: 4, condition: "Excellent", conditionRating: 10,
    structuralAdequacyRating: 10, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-11-10", nhvrAssessed: true, nhvrAssessmentDate: "2025-11-15",
    loadRating: 50.0, averageDailyTraffic: 18500, heavyVehiclePercent: 14.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Brand new 2023 bridge replacing the 1956 structure. 4-lane dual carriageway. Designed for bushfire and flood resilience.",
    geoJson: '{"type":"LineString","coordinates":[[150.122,-35.749],[150.128,-35.749]]}',
    floodImpacted: false
  },
  {
    ID: 1021, bridgeId: "BRG-NSW-ILL-003", bridgeName: "Merrindale River Bridge",
    assetClass: "Road Bridge", route: "South Coast Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Oyster Bay",
    latitude: -35.948200, longitude: 150.024600, location: "Merrindale River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1977, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 7.6, spanLength: 30.0,
    material: "Concrete", spanCount: 6, totalLength: 194.0, deckWidth: 11.0,
    numberOfLanes: 2, condition: "Fair", conditionRating: 6,
    structuralAdequacyRating: 6, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-08-28", nhvrAssessed: true, nhvrAssessmentDate: "2025-09-03",
    loadRating: 34.5, averageDailyTraffic: 6400, heavyVehiclePercent: 12.0,
    freightRoute: true, overMassRoute: false, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "South coast highway bridge. Minor scour observed at Pier 3 — monitoring programme established 2023.",
    geoJson: '{"type":"LineString","coordinates":[[150.022,-35.948],[150.028,-35.948]]}',
    floodImpacted: false
  },
  {
    ID: 1022, bridgeId: "BRG-NSW-ILL-004", bridgeName: "Silverwood River Bridge",
    assetClass: "Road Bridge", route: "South Coast Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Silverwood Valley",
    latitude: -36.712400, longitude: 149.798600, location: "Silverwood River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1969, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 7.0, spanLength: 28.0,
    material: "Concrete", spanCount: 5, totalLength: 152.0, deckWidth: 10.8,
    numberOfLanes: 2, condition: "Fair", conditionRating: 5,
    structuralAdequacyRating: 5, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-07-04", nhvrAssessed: true, nhvrAssessmentDate: "2025-07-11",
    loadRating: 29.0, averageDailyTraffic: 5800, heavyVehiclePercent: 11.0,
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "Ageing structure with precamber loss. Restricted to 30t GML pending detailed assessment scheduled for Q1 2026.",
    geoJson: '{"type":"LineString","coordinates":[[149.796,-36.712],[149.802,-36.712]]}',
    floodImpacted: false
  },
  // ── Western NSW ──────────────────────────────────────────────────────────────
  {
    ID: 1023, bridgeId: "BRG-NSW-WST-001", bridgeName: "Dryfield River Bridge",
    assetClass: "Road Bridge", route: "Outback Highway", routeNumber: "A71",
    state: "NSW", region: "Far West NSW", lga: "Dryfield",
    latitude: -30.148200, longitude: 145.886400, location: "Dryfield River",
    assetOwner: "Dryfield Shire Council", managingAuthority: "Dryfield Shire Council",
    structureType: "Truss Bridge", yearBuilt: 1902, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 6.2, spanLength: 71.0,
    material: "Steel", spanCount: 3, totalLength: 230.0, deckWidth: 8.0,
    numberOfLanes: 1, condition: "Poor", conditionRating: 2,
    structuralAdequacyRating: 2, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 0",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-06-05", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 10.0, averageDailyTraffic: 850, heavyVehiclePercent: 8.0,
    freightRoute: false, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "122-year-old riveted wrought iron truss — rare surviving example. Heritage listed. Single lane — load restricted to 10t. Urgent structural intervention required.",
    geoJson: '{"type":"LineString","coordinates":[[145.883,-30.148],[145.890,-30.148]]}',
    floodImpacted: true
  },
  {
    ID: 1024, bridgeId: "BRG-NSW-WST-002", bridgeName: "Wheatfield River Bridge",
    assetClass: "Road Bridge", route: "Inland Highway", routeNumber: "A39",
    state: "NSW", region: "Western NSW", lga: "Wheatfield",
    latitude: -33.424600, longitude: 148.064200, location: "Wheatfield River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1990, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 9.5, spanLength: 32.0,
    material: "Concrete", spanCount: 7, totalLength: 238.0, deckWidth: 12.0,
    numberOfLanes: 2, condition: "Good", conditionRating: 7,
    structuralAdequacyRating: 7, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 0",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-10-22", nhvrAssessed: true, nhvrAssessmentDate: "2025-10-29",
    loadRating: 38.0, averageDailyTraffic: 4200, heavyVehiclePercent: 35.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Major grain belt crossing. Very high HV% reflects agricultural export freight. Bridge in good condition.",
    geoJson: '{"type":"LineString","coordinates":[[148.061,-33.424],[148.067,-33.424]]}',
    floodImpacted: false
  },
  {
    ID: 1025, bridgeId: "BRG-NSW-WST-003", bridgeName: "Bindaree River Bridge",
    assetClass: "Road Bridge", route: "Southern Cross Highway", routeNumber: "B94",
    state: "NSW", region: "Riverina", lga: "Bindaree",
    latitude: -35.148600, longitude: 147.312400, location: "Bindaree River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1994, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 8.8, spanLength: 38.0,
    material: "Concrete", spanCount: 9, totalLength: 358.0, deckWidth: 12.8,
    numberOfLanes: 2, condition: "Good", conditionRating: 8,
    structuralAdequacyRating: 8, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 0",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-11-03", nhvrAssessed: true, nhvrAssessmentDate: "2025-11-09",
    loadRating: 40.0, averageDailyTraffic: 8900, heavyVehiclePercent: 30.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Regional highway crossing serving grain and livestock freight corridors to southern ports.",
    geoJson: '{"type":"LineString","coordinates":[[147.309,-35.149],[147.316,-35.149]]}',
    floodImpacted: false
  },
  {
    ID: 1026, bridgeId: "BRG-NSW-WST-004", bridgeName: "Borderton Bridge",
    assetClass: "Road Bridge", route: "Southern Highway", routeNumber: "A79",
    state: "NSW", region: "Riverina", lga: "Borderton",
    latitude: -36.048200, longitude: 146.948600, location: "Border River (NSW/VIC border)",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1977, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 8.4, spanLength: 36.0,
    material: "Concrete", spanCount: 10, totalLength: 378.0, deckWidth: 13.6,
    numberOfLanes: 2, condition: "Fair", conditionRating: 6,
    structuralAdequacyRating: 6, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 0",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-09-30", nhvrAssessed: true, nhvrAssessmentDate: "2025-10-07",
    loadRating: 34.5, averageDailyTraffic: 22000, heavyVehiclePercent: 27.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Inter-state border crossing on a major north-south freight corridor. Joint maintenance agreement between NSW and VIC.",
    geoJson: '{"type":"LineString","coordinates":[[146.946,-36.048],[146.952,-36.048]]}',
    floodImpacted: false
  },
  // ── Central West ─────────────────────────────────────────────────────────────
  {
    ID: 1027, bridgeId: "BRG-NSW-CTR-001", bridgeName: "Millbrook Bridge",
    assetClass: "Road Bridge", route: "Western Highway", routeNumber: "A32",
    state: "NSW", region: "Central West", lga: "Millbrook Regional",
    latitude: -33.448600, longitude: 149.512400, location: "Millbrook River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Girder Bridge", yearBuilt: 2001, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 6.8, spanLength: 28.0,
    material: "Concrete", spanCount: 4, totalLength: 118.0, deckWidth: 14.2,
    numberOfLanes: 4, condition: "Good", conditionRating: 8,
    structuralAdequacyRating: 8, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 0",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-11-06", nhvrAssessed: true, nhvrAssessmentDate: "2025-11-12",
    loadRating: 42.0, averageDailyTraffic: 35000, heavyVehiclePercent: 19.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "4-lane divided highway structure in good condition. Major regional freight and tourism route.",
    geoJson: '{"type":"LineString","coordinates":[[149.509,-33.448],[149.516,-33.448]]}',
    floodImpacted: false
  },
  {
    ID: 1028, bridgeId: "BRG-NSW-CTR-002", bridgeName: "Hartley Gorge Bridge",
    assetClass: "Road Bridge", route: "Western Highway", routeNumber: "A32",
    state: "NSW", region: "Central West", lga: "Hartley",
    latitude: -33.524600, longitude: 150.064800, location: "Hartley Gorge",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Box Girder Bridge", yearBuilt: 2006, designLoad: "SM1600",
    designStandard: "AS5100", clearanceHeight: 14.6, spanLength: 60.0,
    material: "Concrete", spanCount: 3, totalLength: 194.0, deckWidth: 13.8,
    numberOfLanes: 4, condition: "Excellent", conditionRating: 9,
    structuralAdequacyRating: 9, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100", seismicZone: "Zone 0",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-10-27", nhvrAssessed: true, nhvrAssessmentDate: "2025-11-02",
    loadRating: 45.0, averageDailyTraffic: 28000, heavyVehiclePercent: 17.0,
    freightRoute: true, overMassRoute: true, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Modern box girder in excellent condition. Part of a highway duplication project.",
    geoJson: '{"type":"LineString","coordinates":[[150.062,-33.525],[150.068,-33.525]]}',
    floodImpacted: false
  },
  // ── South Western Slopes ─────────────────────────────────────────────────────
  {
    ID: 1029, bridgeId: "BRG-NSW-SWS-001", bridgeName: "Riverford Bridge",
    assetClass: "Road Bridge", route: "Southern Highway", routeNumber: "A79",
    state: "NSW", region: "Riverina", lga: "Riverford",
    latitude: -35.098600, longitude: 148.152400, location: "Bindaree River",
    assetOwner: "State Roads Authority", managingAuthority: "State Roads Authority",
    structureType: "Prestressed Concrete Girder", yearBuilt: 1978, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 11.2, spanLength: 36.0,
    material: "Concrete", spanCount: 11, totalLength: 414.0, deckWidth: 12.2,
    numberOfLanes: 2, condition: "Fair", conditionRating: 6,
    structuralAdequacyRating: 6, postingStatus: "Unrestricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 0",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-09-15", nhvrAssessed: true, nhvrAssessmentDate: "2025-09-22",
    loadRating: 34.0, averageDailyTraffic: 19500, heavyVehiclePercent: 25.0,
    freightRoute: true, overMassRoute: false, hmlApproved: true, bDoubleApproved: true,
    dataSource: "DEMO", remarks: "Main interstate truck corridor crossing. Major flooding history. Scour monitoring active on Piers 4 and 5.",
    geoJson: '{"type":"LineString","coordinates":[[148.149,-35.099],[148.156,-35.099]]}',
    floodImpacted: true
  },
  {
    ID: 1030, bridgeId: "BRG-NSW-SWS-002", bridgeName: "Alpine Creek Bridge",
    assetClass: "Road Bridge", route: "Alpine Highway", routeNumber: "B72",
    state: "NSW", region: "Riverina", lga: "Alpine Valleys",
    latitude: -35.348200, longitude: 148.264600, location: "Alpine Creek",
    assetOwner: "Alpine Valleys Council", managingAuthority: "Alpine Valleys Council",
    structureType: "Truss Bridge", yearBuilt: 1948, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 8.4, spanLength: 55.0,
    material: "Steel", spanCount: 2, totalLength: 128.0, deckWidth: 8.6,
    numberOfLanes: 1, condition: "Poor", conditionRating: 3,
    structuralAdequacyRating: 3, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 0",
    highPriorityAsset: false, status: "Active",
    lastInspectionDate: "2025-05-08", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 17.0, averageDailyTraffic: 3200, heavyVehiclePercent: 16.0,
    freightRoute: false, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "77-year-old single-lane steel truss. Corroded lower chord. Load limit 17t. Timber approaches replaced 2019.",
    geoJson: '{"type":"LineString","coordinates":[[148.262,-35.348],[148.268,-35.348]]}',
    floodImpacted: false
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Demo attribute values — derive the bridge-template custom attributes
// (TPL-BRIDGE-INTL-V1 bindings) from each demo bridge's engineering fields, so the
// flagship template scores on ~7 of 12 criteria against demo data instead of just
// the 2 core-register ones. Stored as AttributeValues (EAV) keyed to each bridge.
// Manual judgement criteria (seismic, freight, community…) stay for the Assess screen.
const REF_YEAR = 2026;
function deriveDemoAttributes(b) {
  const sar = Number(b.structuralAdequacyRating) || 5;
  const loadRatingFactor = Math.round((0.6 + sar * 0.09) * 100) / 100;        // RF ≈ 0.78..1.41
  const age = REF_YEAR - (Number(b.yearBuilt) || REF_YEAR);
  const lifeConsumed = Math.max(0, Math.min(120, Math.round((age / 100) * 100)));
  const isOldSteel = /steel/i.test(b.material || "") && (Number(b.yearBuilt) || 9999) < 1960;
  const fatigue = isOldSteel ? (b.conditionRating <= 2 ? "Fracture-critical" : "Monitored") : "None";
  const scour = b.floodImpacted ? (b.conditionRating <= 2 ? "Scour-critical" : "Monitored") : "Stable";
  const r = String(b.region || "");
  const detourKm = /Metropolitan|Metro/.test(r) ? 4 : /Hunter|Illawarra/.test(r) ? 12
    : /Central|Riverina/.test(r) ? 25 : /Far West|Western|Northern/.test(r) ? 45 : 18;
  return [
    { key: "LOAD_RATING_FACTOR", dec: loadRatingFactor },
    { key: "DESIGN_LIFE_CONSUMED_PCT", dec: lifeConsumed },
    { key: "DETOUR_LENGTH_KM", dec: detourKm },
    { key: "FATIGUE_CLASS", text: fatigue },
    { key: "SCOUR_STATUS", text: scour }
  ];
}
function demoAttributeRows(now) {
  const rows = [];
  for (const b of DEMO_BRIDGES) {
    for (const a of deriveDemoAttributes(b)) {
      rows.push({
        ID: cds.utils.uuid(), objectType: "bridge", objectId: String(b.ID),
        attributeKey: a.key,
        valueText: a.text ?? null, valueDecimal: a.dec ?? null,
        valueInteger: null, valueBoolean: null, valueDate: null,
        createdAt: now, createdBy: "demo-loader", modifiedAt: now, modifiedBy: "demo-loader"
      });
    }
  }
  return rows;
}

module.exports = (srv) => {

  srv.on("loadDemoData", async (req) => {
    if (!req.user?.is('admin')) return req.reject(403, 'Admin role required');
    const { Bridges, SystemConfig } = srv.entities;
    const db = await cds.connect.to("db");

    try {
      // 1. Delete all existing bridge records + their demo attribute values
      await db.run(DELETE.from(Bridges));
      await db.run(DELETE.from("bridge.management.AttributeValues").where({ createdBy: "demo-loader" }));

      // 2. Insert demo bridges
      const now = new Date().toISOString();
      const rows = DEMO_BRIDGES.map(b => ({
        ...b,
        title: b.bridgeName,
        createdAt: now,
        createdBy: "demo-loader",
        modifiedAt: now,
        modifiedBy: "demo-loader"
      }));
      await db.run(INSERT.into(Bridges).entries(rows));

      // 2b. Insert derived demo attribute values (feeds the bridge prioritisation template)
      const attrRows = demoAttributeRows(now);
      if (attrRows.length) await db.run(INSERT.into("bridge.management.AttributeValues").entries(attrRows));

      // 3. Set demoModeActive = true in SystemConfig
      await db.run(
        UPDATE(SystemConfig).set({ value: "true", modifiedAt: now, modifiedBy: "demo-loader" })
                            .where({ configKey: "demoModeActive" })
      );

      req.notify(200, `Demo data loaded — ${rows.length} demonstration bridges activated.`);
      return `Demo data loaded — ${rows.length} bridges, ${attrRows.length} attribute values.`;
    } catch (error) {
      req.error(500, "Failed to load demo data: " + error.message);
    }
  });

  srv.on("clearDemoData", async (req) => {
    if (!req.user?.is('admin')) return req.reject(403, 'Admin role required');
    const { Bridges, SystemConfig } = srv.entities;
    const db = await cds.connect.to("db");

    try {
      const now = new Date().toISOString();

      // Delete all bridges + their demo attribute values
      await db.run(DELETE.from(Bridges));
      await db.run(DELETE.from("bridge.management.AttributeValues").where({ createdBy: "demo-loader" }));

      // Set demoModeActive = false
      await db.run(
        UPDATE(SystemConfig).set({ value: "false", modifiedAt: now, modifiedBy: "demo-loader" })
                            .where({ configKey: "demoModeActive" })
      );

      req.notify(200, "Demo data cleared. System ready for production data load.");
      return "Demo data cleared.";
    } catch (error) {
      req.error(500, "Failed to clear demo data: " + error.message);
    }
  });

};

// Exposed for tooling (e.g. scripts/generate-mass-upload-workbook.js) so example
// workbooks are built from the same fictional dataset.
module.exports.DEMO_BRIDGES = DEMO_BRIDGES;
