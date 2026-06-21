// Seeds ONE demo classification class scoped to restrictions (objectType 'restriction'), so the
// restriction Custom Attributes panel is usable out-of-the-box — exactly like the bridge classes
// from template-attributes-seed.js, which only register objectType 'bridge'. Idempotent
// (insert-if-missing by fixed UUID); an admin can edit/extend or deactivate it via the Attribute
// Classes tile. Tables are inserted parents-first so the FKs resolve.
// (SELECT/INSERT are CAP globals, available because server.js has loaded @sap/cds.)
const NS = 'bridge.management.'
const OBJECT_TYPE = 'restriction'
const TABLES = ['AttributeGroups', 'AttributeDefinitions', 'AttributeAllowedValues', 'AttributeObjectTypeConfig']

const GID = '00000000-0000-4000-7a01-000000000001'
const defId = (n) => `00000000-0000-4000-7b01-00000000000${n}`
const cfgId = (n) => `00000000-0000-4000-7d01-00000000000${n}`
const avId = (n) => `00000000-0000-4000-7c01-00000000000${n}`

// [n, name, internalKey, dataType, displayType, helpText]
const DEFS = [
  [1, 'Enforcing agency', 'restr_enforcing_agency', 'Text', 'Auto', 'Authority responsible for enforcing this restriction.'],
  [2, 'Permit / approval reference', 'restr_permit_reference', 'Text', 'Auto', 'Reference of the permit or approval that imposed the restriction.'],
  [3, 'Review due date', 'restr_review_due', 'Date', 'Auto', 'When this restriction must next be reviewed.'],
  [4, 'Advisory signage installed', 'restr_signage_installed', 'Boolean', 'Checkbox', 'Is advisory signage installed on site?'],
  [5, 'Severity basis', 'restr_severity_basis', 'SingleSelect', 'RadioGroup', 'How the restriction severity was determined.']
]
const SEVERITY_BASIS = ['Engineering assessment', 'Precautionary', 'Regulatory directive']

const SEED = {
  AttributeGroups: [{
    ID: GID, objectType: OBJECT_TYPE, name: 'Restriction operational attributes',
    internalKey: 'restr_ops', displayOrder: 10, status: 'Active'
  }],
  AttributeDefinitions: DEFS.map(([n, name, internalKey, dataType, displayType, helpText]) => ({
    ID: defId(n), group_ID: GID, objectType: OBJECT_TYPE, name, internalKey,
    dataType, displayType, helpText, displayOrder: n * 10, status: 'Active'
  })),
  AttributeObjectTypeConfig: DEFS.map(([n]) => ({
    ID: cfgId(n), attribute_ID: defId(n), objectType: OBJECT_TYPE,
    enabled: true, required: false, displayOrder: n * 10
  })),
  AttributeAllowedValues: SEVERITY_BASIS.map((v, i) => ({
    ID: avId(i + 1), attribute_ID: defId(5), value: v, label: v,
    displayOrder: (i + 1) * 10, status: 'Active'
  }))
}

async function ensureRestrictionAttributesSeed (db) {
  let inserted = 0
  const perTable = {}
  for (const table of TABLES) {
    const rows = SEED[table] || []
    const existing = await db.run(SELECT.from(NS + table).columns('ID'))
    const have = new Set((existing || []).map((r) => String(r.ID).toLowerCase()))
    const missing = rows.filter((r) => !have.has(String(r.ID).toLowerCase()))
    perTable[table] = missing.length
    if (!missing.length) continue
    await db.run(INSERT.into(NS + table).entries(missing))
    inserted += missing.length
  }
  return { inserted, perTable }
}

module.exports = { ensureRestrictionAttributesSeed, SEED }
