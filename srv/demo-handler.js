"use strict";

const cds = require("@sap/cds");

// ─────────────────────────────────────────────────────────────────────────────
// Demo Data Handler — Real NSW Bridge Dataset
// Loads / clears a curated set of real NSW bridges for demonstration purposes.
// Sourced from Transport for NSW public asset registry, NHVR, and ABS ASGS 2021.
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_BRIDGES = [
  // ── Sydney Metro ─────────────────────────────────────────────────────────────
  {
    ID: 1001, bridgeId: "BRG-NSW-SYD-001", bridgeName: "Sydney Harbour Bridge",
    assetClass: "Road Bridge", route: "Cahill Expressway", routeNumber: "A8",
    state: "NSW", region: "Sydney Metro", lga: "North Sydney",
    latitude: -33.852306, longitude: 151.210787, location: "Sydney Harbour",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Iconic steel arch bridge. Major strategic crossing with ongoing structural monitoring program.",
    geoJson: '{"type":"LineString","coordinates":[[151.206,-33.852],[151.210,-33.852]]}',
    floodImpacted: false
  },
  {
    ID: 1002, bridgeId: "BRG-NSW-SYD-002", bridgeName: "Anzac Bridge",
    assetClass: "Road Bridge", route: "Western Distributor", routeNumber: "M4",
    state: "NSW", region: "Sydney Metro", lga: "City of Sydney",
    latitude: -33.869661, longitude: 151.183452, location: "Johnstons Bay",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Major cable-stayed bridge linking Pyrmont and Rozelle. Urban freight corridor.",
    geoJson: '{"type":"LineString","coordinates":[[151.188,-33.869],[151.183,-33.869]]}',
    floodImpacted: false
  },
  {
    ID: 1003, bridgeId: "BRG-NSW-SYD-003", bridgeName: "Gladesville Bridge",
    assetClass: "Road Bridge", route: "Victoria Road", routeNumber: "A40",
    state: "NSW", region: "Sydney Metro", lga: "City of Ryde",
    latitude: -33.851500, longitude: 151.136700, location: "Parramatta River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Longest concrete arch bridge in the world at construction. Approaching end of design life — major inspection 2026.",
    geoJson: '{"type":"LineString","coordinates":[[151.132,-33.851],[151.137,-33.851]]}',
    floodImpacted: false
  },
  {
    ID: 1004, bridgeId: "BRG-NSW-SYD-004", bridgeName: "Iron Cove Bridge",
    assetClass: "Road Bridge", route: "Victoria Road", routeNumber: "A40",
    state: "NSW", region: "Sydney Metro", lga: "Inner West",
    latitude: -33.858200, longitude: 151.155600, location: "Iron Cove",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[151.153,-33.858],[151.158,-33.858]]}',
    floodImpacted: false
  },
  {
    ID: 1005, bridgeId: "BRG-NSW-SYD-005", bridgeName: "Mooney Mooney Creek Bridge",
    assetClass: "Road Bridge", route: "Pacific Motorway", routeNumber: "M1",
    state: "NSW", region: "Sydney Metro", lga: "Central Coast",
    latitude: -33.512800, longitude: 151.241700, location: "Mooney Mooney Creek",
    assetOwner: "Transport for NSW", managingAuthority: "Transurban",
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
    dataSource: "DEMO", remarks: "One of Australia's highest bridges at 67m. Critical freight link on Pacific Highway corridor.",
    geoJson: '{"type":"LineString","coordinates":[[151.239,-33.513],[151.244,-33.513]]}',
    floodImpacted: false
  },
  {
    ID: 1006, bridgeId: "BRG-NSW-SYD-006", bridgeName: "Windsor Bridge",
    assetClass: "Road Bridge", route: "Bridge Street", routeNumber: "B8",
    state: "NSW", region: "Sydney Metro", lga: "Hawkesbury",
    latitude: -33.614800, longitude: 150.812800, location: "Hawkesbury River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[150.810,-33.615],[150.815,-33.615]]}',
    floodImpacted: false
  },
  {
    ID: 1007, bridgeId: "BRG-NSW-SYD-007", bridgeName: "Ryde Bridge",
    assetClass: "Road Bridge", route: "Ryde Bridge Road", routeNumber: "B87",
    state: "NSW", region: "Sydney Metro", lga: "City of Ryde",
    latitude: -33.823200, longitude: 151.094100, location: "Parramatta River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[151.091,-33.823],[151.097,-33.823]]}',
    floodImpacted: false
  },
  // ── Hunter ───────────────────────────────────────────────────────────────────
  {
    ID: 1008, bridgeId: "BRG-NSW-HUN-001", bridgeName: "Hexham Bridge",
    assetClass: "Road Bridge", route: "Pacific Highway", routeNumber: "A1",
    state: "NSW", region: "Hunter", lga: "Port Stephens",
    latitude: -32.842600, longitude: 151.686200, location: "Hunter River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[151.683,-32.843],[151.689,-32.843]]}',
    floodImpacted: true
  },
  {
    ID: 1009, bridgeId: "BRG-NSW-HUN-002", bridgeName: "Maitland Rail Bridge",
    assetClass: "Road Bridge", route: "Hunter Street", routeNumber: "B64",
    state: "NSW", region: "Hunter", lga: "Maitland",
    latitude: -32.730800, longitude: 151.554200, location: "Hunter River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[151.551,-32.731],[151.557,-32.731]]}',
    floodImpacted: true
  },
  {
    ID: 1010, bridgeId: "BRG-NSW-HUN-003", bridgeName: "Karuah River Bridge",
    assetClass: "Road Bridge", route: "Pacific Highway", routeNumber: "A1",
    state: "NSW", region: "Hunter", lga: "Port Stephens",
    latitude: -32.659000, longitude: 151.955700, location: "Karuah River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[151.952,-32.659],[151.959,-32.659]]}',
    floodImpacted: false
  },
  // ── Northern NSW / New England ───────────────────────────────────────────────
  {
    ID: 1011, bridgeId: "BRG-NSW-NOR-001", bridgeName: "Grafton Bridge (Clarence River)",
    assetClass: "Road Bridge", route: "Summerland Way", routeNumber: "B65",
    state: "NSW", region: "Northern NSW", lga: "Clarence Valley",
    latitude: -29.690700, longitude: 152.931900, location: "Clarence River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[152.928,-29.691],[152.935,-29.691]]}',
    floodImpacted: true
  },
  {
    ID: 1012, bridgeId: "BRG-NSW-NOR-002", bridgeName: "Manning River Bridge (Taree)",
    assetClass: "Road Bridge", route: "Pacific Highway", routeNumber: "A1",
    state: "NSW", region: "Northern NSW", lga: "Mid-Coast",
    latitude: -31.902100, longitude: 152.451800, location: "Manning River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[152.448,-31.902],[152.455,-31.902]]}',
    floodImpacted: true
  },
  {
    ID: 1013, bridgeId: "BRG-NSW-NOR-003", bridgeName: "Hastings River Bridge (Port Macquarie)",
    assetClass: "Road Bridge", route: "Oxley Highway", routeNumber: "B56",
    state: "NSW", region: "Northern NSW", lga: "Port Macquarie-Hastings",
    latitude: -31.433900, longitude: 152.904700, location: "Hastings River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[152.901,-31.434],[152.908,-31.434]]}',
    floodImpacted: false
  },
  {
    ID: 1014, bridgeId: "BRG-NSW-NOR-004", bridgeName: "Macleay River Bridge (Kempsey)",
    assetClass: "Road Bridge", route: "Pacific Highway", routeNumber: "A1",
    state: "NSW", region: "Northern NSW", lga: "Kempsey",
    latitude: -31.081700, longitude: 152.832900, location: "Macleay River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[152.829,-31.082],[152.836,-31.082]]}',
    floodImpacted: true
  },
  {
    ID: 1015, bridgeId: "BRG-NSW-NOR-005", bridgeName: "Bellinger River Bridge (Urunga)",
    assetClass: "Road Bridge", route: "Pacific Highway", routeNumber: "A1",
    state: "NSW", region: "Northern NSW", lga: "Bellingen",
    latitude: -30.492100, longitude: 152.999800, location: "Bellinger River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[152.996,-30.492],[153.003,-30.492]]}',
    floodImpacted: true
  },
  // ── New England ──────────────────────────────────────────────────────────────
  {
    ID: 1016, bridgeId: "BRG-NSW-NEW-001", bridgeName: "Macquarie River Bridge (Dubbo)",
    assetClass: "Road Bridge", route: "Cobra Street", routeNumber: "B54",
    state: "NSW", region: "Western NSW", lga: "Dubbo Regional",
    latitude: -32.239400, longitude: 148.588600, location: "Macquarie River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Primary east-west freight crossing at Dubbo. High percentage heavy vehicles due to agricultural freight.",
    geoJson: '{"type":"LineString","coordinates":[[148.585,-32.239],[148.592,-32.239]]}',
    floodImpacted: false
  },
  {
    ID: 1017, bridgeId: "BRG-NSW-NEW-002", bridgeName: "Namoi River Bridge (Narrabri)",
    assetClass: "Road Bridge", route: "Newell Highway", routeNumber: "A39",
    state: "NSW", region: "Western NSW", lga: "Narrabri",
    latitude: -30.330100, longitude: 149.776400, location: "Namoi River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Newell Highway is Australia's longest inland highway. High agricultural freight use — cotton and grain season peaks.",
    geoJson: '{"type":"LineString","coordinates":[[149.773,-30.330],[149.780,-30.330]]}',
    floodImpacted: false
  },
  {
    ID: 1018, bridgeId: "BRG-NSW-NEW-003", bridgeName: "Peel River Bridge (Tamworth)",
    assetClass: "Road Bridge", route: "New England Highway", routeNumber: "A15",
    state: "NSW", region: "New England", lga: "Tamworth Regional",
    latitude: -31.088800, longitude: 150.918500, location: "Peel River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "67-year-old truss structure. GML 19t restricts B-double access on New England Highway. Replacement funding sought.",
    geoJson: '{"type":"LineString","coordinates":[[150.915,-31.089],[150.922,-31.089]]}',
    floodImpacted: false
  },
  // ── Southern NSW / Illawarra ─────────────────────────────────────────────────
  {
    ID: 1019, bridgeId: "BRG-NSW-ILL-001", bridgeName: "Shoalhaven River Bridge (Nowra)",
    assetClass: "Road Bridge", route: "Princes Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Shoalhaven",
    latitude: -34.871200, longitude: 150.597400, location: "Shoalhaven River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
    structureType: "Arch Truss Bridge", yearBuilt: 1881, designLoad: "T44",
    designStandard: "AS5100", clearanceHeight: 11.0, spanLength: 88.0,
    material: "Steel", spanCount: 4, totalLength: 387.0, deckWidth: 9.2,
    numberOfLanes: 2, condition: "Poor", conditionRating: 3,
    structuralAdequacyRating: 3, postingStatus: "Restricted",
    conditionStandard: "AS 5100.7", seismicZone: "Zone 1",
    highPriorityAsset: true, status: "Active",
    lastInspectionDate: "2025-03-17", nhvrAssessed: false, nhvrAssessmentDate: null,
    loadRating: 16.0, averageDailyTraffic: 28000, heavyVehiclePercent: 15.0,
    freightRoute: true, overMassRoute: false, hmlApproved: false, bDoubleApproved: false,
    dataSource: "DEMO", remarks: "Heritage listed 143-year-old wrought iron truss. GML 16t. Critical Princes Highway bottleneck. Replacement under construction (2026 target).",
    geoJson: '{"type":"LineString","coordinates":[[150.594,-34.871],[150.601,-34.871]]}',
    floodImpacted: false
  },
  {
    ID: 1020, bridgeId: "BRG-NSW-ILL-002", bridgeName: "Clyde River Bridge (Batemans Bay)",
    assetClass: "Road Bridge", route: "Princes Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Eurobodalla",
    latitude: -35.707300, longitude: 150.174600, location: "Clyde River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[150.171,-35.707],[150.178,-35.707]]}',
    floodImpacted: false
  },
  {
    ID: 1021, bridgeId: "BRG-NSW-ILL-003", bridgeName: "Moruya River Bridge",
    assetClass: "Road Bridge", route: "Princes Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Eurobodalla",
    latitude: -35.904600, longitude: 150.076300, location: "Moruya River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[150.073,-35.905],[150.080,-35.905]]}',
    floodImpacted: false
  },
  {
    ID: 1022, bridgeId: "BRG-NSW-ILL-004", bridgeName: "Bega River Bridge",
    assetClass: "Road Bridge", route: "Princes Highway", routeNumber: "A1",
    state: "NSW", region: "Southern NSW", lga: "Bega Valley",
    latitude: -36.676200, longitude: 149.837000, location: "Bega River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[149.834,-36.676],[149.840,-36.676]]}',
    floodImpacted: false
  },
  // ── Western NSW ──────────────────────────────────────────────────────────────
  {
    ID: 1023, bridgeId: "BRG-NSW-WST-001", bridgeName: "Darling River Bridge (Bourke)",
    assetClass: "Road Bridge", route: "Mitchell Highway", routeNumber: "A71",
    state: "NSW", region: "Far West NSW", lga: "Bourke",
    latitude: -30.091500, longitude: 145.939800, location: "Darling River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[145.936,-30.092],[145.943,-30.092]]}',
    floodImpacted: true
  },
  {
    ID: 1024, bridgeId: "BRG-NSW-WST-002", bridgeName: "Lachlan River Bridge (Forbes)",
    assetClass: "Road Bridge", route: "Newell Highway", routeNumber: "A39",
    state: "NSW", region: "Western NSW", lga: "Forbes",
    latitude: -33.378400, longitude: 148.012200, location: "Lachlan River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[148.009,-33.378],[148.015,-33.378]]}',
    floodImpacted: false
  },
  {
    ID: 1025, bridgeId: "BRG-NSW-WST-003", bridgeName: "Murrumbidgee River Bridge (Wagga Wagga)",
    assetClass: "Road Bridge", route: "Olympic Highway", routeNumber: "B94",
    state: "NSW", region: "Riverina", lga: "Wagga Wagga",
    latitude: -35.109500, longitude: 147.362800, location: "Murrumbidgee River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Olympic Highway crossing. Serves Riverina grain and livestock freight corridor to Port of Melbourne.",
    geoJson: '{"type":"LineString","coordinates":[[147.359,-35.110],[147.366,-35.110]]}',
    floodImpacted: false
  },
  {
    ID: 1026, bridgeId: "BRG-NSW-WST-004", bridgeName: "Murray River Bridge (Albury)",
    assetClass: "Road Bridge", route: "Hume Highway", routeNumber: "A79",
    state: "NSW", region: "Riverina", lga: "Albury",
    latitude: -36.079400, longitude: 146.915200, location: "Murray River (NSW/VIC Border)",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Inter-state border crossing on main Sydney-Melbourne corridor. Joint maintenance agreement between NSW and VIC.",
    geoJson: '{"type":"LineString","coordinates":[[146.912,-36.079],[146.918,-36.079]]}',
    floodImpacted: false
  },
  // ── Central West ─────────────────────────────────────────────────────────────
  {
    ID: 1027, bridgeId: "BRG-NSW-CTR-001", bridgeName: "Fish River Bridge (Bathurst)",
    assetClass: "Road Bridge", route: "Great Western Highway", routeNumber: "A32",
    state: "NSW", region: "Central West", lga: "Bathurst Regional",
    latitude: -33.420200, longitude: 149.572600, location: "Fish River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "4-lane divided highway structure in good condition. Major Sydney–Bathurst–Dubbo freight and tourism route.",
    geoJson: '{"type":"LineString","coordinates":[[149.569,-33.420],[149.576,-33.420]]}',
    floodImpacted: false
  },
  {
    ID: 1028, bridgeId: "BRG-NSW-CTR-002", bridgeName: "Cox River Bridge (Lithgow)",
    assetClass: "Road Bridge", route: "Great Western Highway", routeNumber: "A32",
    state: "NSW", region: "Central West", lga: "Lithgow",
    latitude: -33.492800, longitude: 150.112400, location: "Cox River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Modern box girder in excellent condition. Part of the Great Western Highway duplication project.",
    geoJson: '{"type":"LineString","coordinates":[[150.109,-33.493],[150.115,-33.493]]}',
    floodImpacted: false
  },
  // ── South Western Slopes ─────────────────────────────────────────────────────
  {
    ID: 1029, bridgeId: "BRG-NSW-SWS-001", bridgeName: "Murrumbidgee River Bridge (Gundagai)",
    assetClass: "Road Bridge", route: "Hume Highway", routeNumber: "A79",
    state: "NSW", region: "Riverina", lga: "Cootamundra-Gundagai",
    latitude: -35.063000, longitude: 148.106700, location: "Murrumbidgee River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    dataSource: "DEMO", remarks: "Main Sydney-Melbourne truck corridor. Major flooding history. Scour monitoring active on Piers 4 and 5.",
    geoJson: '{"type":"LineString","coordinates":[[148.103,-35.063],[148.110,-35.063]]}',
    floodImpacted: true
  },
  {
    ID: 1030, bridgeId: "BRG-NSW-SWS-002", bridgeName: "Tumut River Bridge",
    assetClass: "Road Bridge", route: "Snowy Mountains Highway", routeNumber: "B72",
    state: "NSW", region: "Riverina", lga: "Snowy Valleys",
    latitude: -35.296600, longitude: 148.221500, location: "Tumut River",
    assetOwner: "Transport for NSW", managingAuthority: "Transport for NSW",
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
    geoJson: '{"type":"LineString","coordinates":[[148.218,-35.297],[148.225,-35.297]]}',
    floodImpacted: false
  }
];

// ─────────────────────────────────────────────────────────────────────────────

module.exports = (srv) => {

  srv.on("loadDemoData", async (req) => {
    if (!req.user?.is('admin')) return req.reject(403, 'Admin role required');
    const { Bridges, SystemConfig } = srv.entities;
    const db = await cds.connect.to("db");

    try {
      // 1. Delete all existing bridge records
      await db.run(DELETE.from(Bridges));

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

      // 3. Set demoModeActive = true in SystemConfig
      await db.run(
        UPDATE(SystemConfig).set({ value: "true", modifiedAt: now, modifiedBy: "demo-loader" })
                            .where({ configKey: "demoModeActive" })
      );

      req.notify(200, `Demo data loaded — ${rows.length} real NSW bridges activated.`);
      return `Demo data loaded — ${rows.length} bridges.`;
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

      // Delete all bridges
      await db.run(DELETE.from(Bridges));

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
