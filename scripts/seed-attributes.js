/**
 * Seed NSW-relevant configurable attributes for Bridges.
 * Covers fields NOT already in the core Bridge entity:
 *   - AS 5100/AS 4100 structural classification fields
 *   - Hydraulic assessment fields (beyond scour risk / flood immunity ARI already present)
 *   - Environmental & heritage classification
 *   - Asset valuation & programming
 *   - Foundation & geotechnical
 *
 * Run:  node scripts/seed-attributes.js
 */

const http = require('http')

const BASE = 'http://localhost:5050/odata/v4/admin'
const ATTR_BASE = 'http://localhost:5050/attributes/api'
const CREDS = Buffer.from('admin:admin').toString('base64')

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${CREDS}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }
    const req = http.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`${method} ${url} failed [${res.statusCode}]: ${data.slice(0, 300)}`))
        }
        try { resolve(data ? JSON.parse(data) : {}) } catch { resolve({}) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function post(url, body) { return request('POST', url, body) }
async function getAll(url) {
  const data = await request('GET', url)
  return data.value || []
}

// ── Group + attribute definitions ─────────────────────────────────────────────

const GROUPS = [
  {
    name: 'Structural Assessment',
    internalKey: 'structural_assessment',
    objectType: 'bridge',
    displayOrder: 10,
    attributes: [
      {
        name: 'AS 5100 Bridge Class',
        internalKey: 'as5100_bridge_class',
        dataType: 'SingleSelect',
        helpText: 'Loading class per AS 5100.2 (not the same as design load / NHVR PBS class)',
        displayOrder: 1,
        allowedValues: ['Class B', 'Class A', 'Class AA', 'Class M1600', 'Class S1600'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Fatigue Category (AS 4100)',
        internalKey: 'fatigue_category_as4100',
        dataType: 'SingleSelect',
        helpText: 'Applicable to steel & composite bridges per AS 4100 Table 11.5',
        displayOrder: 2,
        allowedValues: ['Category 1', 'Category 2', 'Category 3', 'Category 4', 'Category 5', 'Category 6', 'Category 7', 'N/A - Non-Steel'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Remaining Service Life',
        internalKey: 'remaining_service_life_yrs',
        dataType: 'Integer',
        unit: 'years',
        helpText: 'Estimated remaining service life from latest structural assessment',
        displayOrder: 3,
        minValue: 0,
        maxValue: 200,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Intervention Priority Score',
        internalKey: 'intervention_priority_score',
        dataType: 'Decimal',
        helpText: 'Risk-based priority score (1 = lowest, 10 = highest urgency)',
        displayOrder: 4,
        minValue: 1,
        maxValue: 10,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Chloride Contamination Level',
        internalKey: 'chloride_contamination_level',
        dataType: 'SingleSelect',
        helpText: 'Chloride-induced corrosion risk — relevant for coastal and deicing-salt bridges',
        displayOrder: 5,
        allowedValues: ['Low', 'Medium', 'High', 'Critical', 'Not Tested'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      }
    ]
  },
  {
    name: 'Hydraulic Assessment',
    internalKey: 'hydraulic_assessment',
    objectType: 'bridge',
    displayOrder: 20,
    attributes: [
      {
        name: 'Design Flood ARI',
        internalKey: 'design_flood_ari_yrs',
        dataType: 'Integer',
        unit: 'years',
        helpText: 'Average Recurrence Interval of design flood (e.g. 100, 200, 1000). Note: floodImmunityAriYears tracks the flood immunity level; this records the design intent.',
        displayOrder: 1,
        allowedValues: [],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: '100-Year Flood Level',
        internalKey: 'flood_level_100yr_mahd',
        dataType: 'Decimal',
        unit: 'mAHD',
        helpText: '1% AEP flood water surface elevation at bridge site (mAHD)',
        displayOrder: 2,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Freeboard',
        internalKey: 'freeboard_m',
        dataType: 'Decimal',
        unit: 'm',
        helpText: 'Vertical clearance between design flood level and lowest bridge soffit or kerb',
        displayOrder: 3,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Waterway Adequacy Rating',
        internalKey: 'waterway_adequacy_rating',
        dataType: 'SingleSelect',
        helpText: 'Waterway Adequacy Rating — A=adequate, D=most deficient',
        displayOrder: 4,
        allowedValues: ['A - Adequate', 'B - Minor Deficiency', 'C - Moderate Deficiency', 'D - Major Deficiency'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Afflux',
        internalKey: 'afflux_m',
        dataType: 'Decimal',
        unit: 'm',
        helpText: 'Rise in flood level upstream caused by the bridge constriction',
        displayOrder: 5,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Debris Accumulation Risk',
        internalKey: 'debris_accumulation_risk',
        dataType: 'SingleSelect',
        helpText: 'Likelihood of debris accumulation at bridge (affects hydraulic and structural risk)',
        displayOrder: 6,
        allowedValues: ['Low', 'Medium', 'High'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      }
    ]
  },
  {
    name: 'Environmental & Heritage',
    internalKey: 'environmental_heritage',
    objectType: 'bridge',
    displayOrder: 30,
    attributes: [
      {
        name: 'Environmental Sensitivity Class',
        internalKey: 'env_sensitivity_class',
        dataType: 'SingleSelect',
        helpText: 'NSW Environmental Sensitivity Class for works approval (ESC1=lowest, ESC4=highest sensitivity)',
        displayOrder: 1,
        allowedValues: ['ESC1', 'ESC2', 'ESC3', 'ESC4', 'Not Assessed'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Heritage Listing',
        internalKey: 'heritage_listing',
        dataType: 'SingleSelect',
        helpText: 'Highest level of heritage listing applicable to the bridge or its curtilage',
        displayOrder: 2,
        allowedValues: ['None', 'Local Heritage Item', 'State Heritage Register', 'National Heritage List', 'World Heritage'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Heritage Register Number',
        internalKey: 'heritage_register_number',
        dataType: 'Text',
        helpText: 'SHR item number or local LEP reference if heritage-listed',
        displayOrder: 3,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Aboriginal Cultural Heritage',
        internalKey: 'aboriginal_cultural_heritage',
        dataType: 'Boolean',
        helpText: 'Known or potential Aboriginal cultural heritage values in bridge vicinity (AHIMS check required)',
        displayOrder: 4,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Coastal / Marine Environment',
        internalKey: 'coastal_marine_environment',
        dataType: 'Boolean',
        helpText: 'Bridge located in coastal or marine environment (drives corrosion protection and maintenance strategy)',
        displayOrder: 5,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Acid Sulfate Soils Risk',
        internalKey: 'acid_sulfate_soils_risk',
        dataType: 'SingleSelect',
        helpText: 'Acid Sulfate Soils risk class per NSW Acid Sulfate Soils Manual',
        displayOrder: 6,
        allowedValues: ['None / Low', 'Class 5', 'Class 4', 'Class 3', 'Class 2', 'Class 1'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      }
    ]
  },
  {
    name: 'Asset Valuation & Programming',
    internalKey: 'asset_valuation_programming',
    objectType: 'bridge',
    displayOrder: 40,
    attributes: [
      {
        name: 'Asset Replacement Cost',
        internalKey: 'asset_replacement_cost_aud',
        dataType: 'Decimal',
        unit: 'AUD',
        helpText: 'Current replacement cost estimate (gross, undepreciated)',
        displayOrder: 1,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Depreciated Replacement Cost',
        internalKey: 'depreciated_replacement_cost_aud',
        dataType: 'Decimal',
        unit: 'AUD',
        helpText: 'Written-down replacement cost for financial reporting purposes',
        displayOrder: 2,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Annual Maintenance Cost',
        internalKey: 'annual_maintenance_cost_aud',
        dataType: 'Decimal',
        unit: 'AUD',
        helpText: 'Estimated average annual routine maintenance cost',
        displayOrder: 3,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Next Scheduled Inspection Date',
        internalKey: 'next_inspection_date',
        dataType: 'Date',
        helpText: 'Date of next programmed principal or routine inspection',
        displayOrder: 4,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Inspection Frequency',
        internalKey: 'inspection_frequency',
        dataType: 'SingleSelect',
        helpText: 'Programmed inspection cycle per NSW BMS inspection manual',
        displayOrder: 5,
        allowedValues: ['Annual', '2-Yearly', '3-Yearly', '5-Yearly', 'On Condition'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Asset Life Expectancy',
        internalKey: 'asset_life_expectancy_yrs',
        dataType: 'Integer',
        unit: 'years',
        helpText: 'Total design/expected service life used for depreciation and renewal planning',
        displayOrder: 6,
        minValue: 1,
        maxValue: 200,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      }
    ]
  },
  {
    name: 'Foundation & Geotechnical',
    internalKey: 'foundation_geotechnical',
    objectType: 'bridge',
    displayOrder: 50,
    attributes: [
      {
        name: 'Foundation Type',
        internalKey: 'foundation_type',
        dataType: 'SingleSelect',
        helpText: 'Primary foundation system type',
        displayOrder: 1,
        allowedValues: ['Driven Pile', 'Bored Pile', 'Spread Footing', 'Caisson', 'Rock Socket', 'Abutment / Embankment', 'Unknown'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Soil Classification',
        internalKey: 'soil_classification',
        dataType: 'SingleSelect',
        helpText: 'Predominant soil type at foundation level',
        displayOrder: 2,
        allowedValues: ['Rock', 'Gravel', 'Sand', 'Sandy Clay', 'Clay', 'Soft Clay', 'Peat / Organic', 'Unknown'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Liquefaction Risk',
        internalKey: 'liquefaction_risk',
        dataType: 'SingleSelect',
        helpText: 'Seismic liquefaction susceptibility of foundation soils',
        displayOrder: 3,
        allowedValues: ['Low', 'Medium', 'High', 'Not Assessed'],
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      },
      {
        name: 'Foundation Depth',
        internalKey: 'foundation_depth_m',
        dataType: 'Decimal',
        unit: 'm',
        helpText: 'Depth to founding level below natural surface or scour line',
        displayOrder: 4,
        minValue: 0,
        maxValue: 100,
        configs: [{ objectType: 'bridge', enabled: true, required: false }]
      }
    ]
  }
]

// ── Seed runner ───────────────────────────────────────────────────────────────

async function seed() {
  console.log('Checking existing attribute groups...')
  const existing = await getAll(`${BASE}/AttributeGroups?$filter=objectType eq 'bridge'`)
  const existingKeys = new Set(existing.map(g => g.internalKey))

  let groupsCreated = 0, attrsCreated = 0, avsCreated = 0, configsCreated = 0

  for (const groupDef of GROUPS) {
    if (existingKeys.has(groupDef.internalKey)) {
      console.log(`  ↷ Group already exists: ${groupDef.name}`)
      continue
    }

    console.log(`\n  + Creating group: ${groupDef.name}`)
    const group = await post(`${BASE}/AttributeGroups`, {
      objectType: groupDef.objectType,
      name: groupDef.name,
      internalKey: groupDef.internalKey,
      displayOrder: groupDef.displayOrder,
      status: 'Active'
    })
    groupsCreated++

    for (const attrDef of groupDef.attributes) {
      console.log(`    + Attribute: ${attrDef.name} [${attrDef.dataType}]`)
      const attr = await post(`${BASE}/AttributeDefinitions`, {
        group_ID: group.ID,
        objectType: groupDef.objectType,
        name: attrDef.name,
        internalKey: attrDef.internalKey,
        dataType: attrDef.dataType,
        unit: attrDef.unit || null,
        helpText: attrDef.helpText || null,
        displayOrder: attrDef.displayOrder,
        minValue: attrDef.minValue ?? null,
        maxValue: attrDef.maxValue ?? null,
        status: 'Active'
      })
      attrsCreated++

      // Allowed values
      if (attrDef.allowedValues?.length) {
        for (let i = 0; i < attrDef.allowedValues.length; i++) {
          const v = attrDef.allowedValues[i]
          await post(`${BASE}/AttributeAllowedValues`, {
            attribute_ID: attr.ID,
            value: v,
            label: v,
            displayOrder: i,
            status: 'Active'
          })
          avsCreated++
        }
        console.log(`      ↳ ${attrDef.allowedValues.length} allowed values`)
      }

      // Object-type configs
      for (const cfg of (attrDef.configs || [])) {
        await post(`${BASE}/AttributeObjectTypeConfig`, {
          attribute_ID: attr.ID,
          objectType: cfg.objectType,
          enabled: cfg.enabled,
          required: cfg.required || false
        })
        configsCreated++
      }
    }
  }

  console.log(`
─────────────────────────────────────────────
Seed complete:
  Groups created:         ${groupsCreated}
  Attribute defs created: ${attrsCreated}
  Allowed values created: ${avsCreated}
  Object-type configs:    ${configsCreated}
─────────────────────────────────────────────`)

  // ── Verify: read back config ───────────────────────────────────────────────
  console.log('\nVerifying via /attributes/api/config...')
  const data = await request('GET', `${ATTR_BASE}/config?objectType=bridge`)
  console.log(`\nAttribute config returned ${data.groups?.length || 0} active group(s):`)
  for (const g of data.groups || []) {
    console.log(`  ${g.name} (${g.internalKey}) — ${g.attributes.length} attributes`)
    for (const a of g.attributes) {
      console.log(`    · ${a.name} [${a.dataType}${a.unit ? ', ' + a.unit : ''}]${a.required ? ' *required' : ''}`)
    }
  }
}

seed().catch(err => { console.error('\nSeed FAILED:', err.message); process.exit(1) })
