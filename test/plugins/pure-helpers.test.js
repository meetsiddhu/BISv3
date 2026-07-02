// Pure-function edge-case coverage for the reusable plugins (srv/lib/plugins/**).
// These exercise the typing/diff/CSV helpers directly (no DB / no cds.test boot) to close
// the branch gaps the isolation tests don't reach: coercion error paths, every typed-column
// branch, the Date/object/boolean stringification arms, and the CSV injection guard.
const changelog = require('../../srv/lib/plugins/changelog')
const changeDocs = require('../../srv/lib/plugins/change-documents')
const classification = require('../../srv/lib/plugins/classification')
const massUpload = require('../../srv/lib/plugins/mass-upload')

describe('plugin/changelog: valueToString', () => {
  const { valueToString } = changelog
  test('null / undefined → empty string', () => {
    expect(valueToString(null)).toBe('')
    expect(valueToString(undefined)).toBe('')
  })
  test('booleans → "true" / "false"', () => {
    expect(valueToString(true)).toBe('true')
    expect(valueToString(false)).toBe('false')
  })
  test('Date → ISO date (YYYY-MM-DD)', () => {
    expect(valueToString(new Date('2026-06-22T10:00:00Z'))).toBe('2026-06-22')
  })
  test('object → JSON', () => {
    expect(valueToString({ a: 1 })).toBe('{"a":1}')
  })
  test('numbers / strings → String()', () => {
    expect(valueToString(42)).toBe('42')
    expect(valueToString('hi')).toBe('hi')
  })
})

describe('plugin/changelog: diffRecords', () => {
  const { diffRecords, DEFAULT_SKIP_FIELDS } = changelog
  test('reports only the changed business fields', () => {
    const changes = diffRecords({ name: 'A', state: 'NSW' }, { name: 'B', state: 'NSW' })
    expect(changes).toEqual([{ fieldName: 'name', oldValue: 'A', newValue: 'B' }])
  })
  test('skips audit/draft fields by default', () => {
    const changes = diffRecords({ name: 'A', modifiedAt: 'x' }, { name: 'A', modifiedAt: 'y' })
    expect(changes).toEqual([]) // modifiedAt is in DEFAULT_SKIP_FIELDS
    expect(DEFAULT_SKIP_FIELDS.has('createdBy')).toBe(true)
  })
  test('null oldRecord (create) reports new fields as a change', () => {
    const changes = diffRecords(null, { name: 'New' })
    expect(changes).toEqual([{ fieldName: 'name', oldValue: '', newValue: 'New' }])
  })
  test('custom skipFields override the defaults', () => {
    const changes = diffRecords({ a: 1, b: 2 }, { a: 9, b: 9 }, new Set(['a']))
    expect(changes.map((c) => c.fieldName)).toEqual(['b'])
  })
  test('boolean false vs true is detected (not coalesced away)', () => {
    const changes = diffRecords({ active: true }, { active: false })
    expect(changes).toEqual([{ fieldName: 'active', oldValue: 'true', newValue: 'false' }])
  })
})

describe('plugin/change-documents: csvCell + toCsv', () => {
  const { csvCell, toCsv } = changeDocs
  test('csvCell: null/blank, quoting, and formula-injection guard', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })
  test('toCsv emits the fixed header then one line per row', () => {
    const csv = toCsv([{ changedAt: 't', changedBy: 'u', objectType: 'Bridge', objectName: 'B1', fieldName: 'name', oldValue: 'x', newValue: 'y', changeSource: 'OData', batchId: null }])
    const [header, row] = csv.split('\n')
    expect(header).toBe('changedAt,changedBy,objectType,objectName,fieldName,oldValue,newValue,changeSource,batchId')
    expect(row).toBe('t,u,Bridge,B1,name,x,y,OData,')
  })
  test('toCsv on empty/null input still yields the header only', () => {
    expect(toCsv([]).split('\n')).toHaveLength(1)
    expect(toCsv(null).split('\n')).toHaveLength(1)
  })
})

describe('plugin/classification: typedValueColumn', () => {
  const { typedValueColumn } = classification
  test('maps every data type to its typed column, defaulting to valueText', () => {
    expect(typedValueColumn('Integer')).toBe('valueInteger')
    expect(typedValueColumn('Decimal')).toBe('valueDecimal')
    expect(typedValueColumn('Date')).toBe('valueDate')
    expect(typedValueColumn('Boolean')).toBe('valueBoolean')
    expect(typedValueColumn('Text')).toBe('valueText')
    expect(typedValueColumn('SingleSelect')).toBe('valueText')
    expect(typedValueColumn(undefined)).toBe('valueText')
  })
})

describe('plugin/classification: coerceValue', () => {
  const { coerceValue } = classification
  test('null/blank → null for any type', () => {
    expect(coerceValue('Integer', null)).toBeNull()
    expect(coerceValue('Text', '')).toBeNull()
    expect(coerceValue('Decimal', undefined)).toBeNull()
  })
  test('Integer accepts ints + numeric strings; rejects non-integers', () => {
    expect(coerceValue('Integer', 5)).toBe(5)
    expect(coerceValue('Integer', '-7')).toBe(-7)
    expect(() => coerceValue('Integer', '1.5')).toThrow(/whole number/)
    expect(() => coerceValue('Integer', 'abc')).toThrow(/whole number/)
    expect(() => coerceValue('Integer', 1.5)).toThrow(/whole number/)
  })
  test('Decimal accepts finite numbers + decimal strings; rejects junk', () => {
    expect(coerceValue('Decimal', 3.14)).toBe(3.14)
    expect(coerceValue('Decimal', '2.5')).toBe(2.5)
    expect(coerceValue('Decimal', '-10')).toBe(-10)
    expect(() => coerceValue('Decimal', 'x')).toThrow(/Expected a number/)
  })
  test('Date requires YYYY-MM-DD', () => {
    expect(coerceValue('Date', '2026-06-22')).toBe('2026-06-22')
    expect(() => coerceValue('Date', '22/06/2026')).toThrow(/YYYY-MM-DD/)
  })
  test('Boolean accepts the documented truthy/falsey tokens', () => {
    expect(coerceValue('Boolean', true)).toBe(true)
    expect(coerceValue('Boolean', 'true')).toBe(true)
    expect(coerceValue('Boolean', 'X')).toBe(true)
    expect(coerceValue('Boolean', '1')).toBe(true)
    expect(coerceValue('Boolean', 1)).toBe(true)
    expect(coerceValue('Boolean', 'false')).toBe(false)
    expect(coerceValue('Boolean', '0')).toBe(false)
    expect(coerceValue('Boolean', 0)).toBe(false)
    expect(() => coerceValue('Boolean', 'maybe')).toThrow(/true or false/)
  })
  test('default (Text) trims to string', () => {
    expect(coerceValue('Text', '  hi  ')).toBe('hi')
    expect(coerceValue('SingleSelect', 'A')).toBe('A')
  })
})

describe('plugin/classification: buildValueEntry', () => {
  const { buildValueEntry } = classification
  test('routes the coerced value into exactly one typed column', () => {
    expect(buildValueEntry('bridge', 1, 'K', 'Integer', 5)).toMatchObject({
      objectType: 'bridge', objectId: '1', attributeKey: 'K',
      valueInteger: 5, valueText: null, valueDecimal: null, valueDate: null, valueBoolean: null
    })
    expect(buildValueEntry('bridge', 2, 'K', 'Decimal', 1.5).valueDecimal).toBe(1.5)
    expect(buildValueEntry('bridge', 3, 'K', 'Date', '2026-01-01').valueDate).toBe('2026-01-01')
    expect(buildValueEntry('bridge', 4, 'K', 'Boolean', true).valueBoolean).toBe(true)
  })
  test('Text/SingleSelect/MultiSelect land in valueText', () => {
    expect(buildValueEntry('b', 5, 'K', 'Text', 'hi').valueText).toBe('hi')
    expect(buildValueEntry('b', 6, 'K', 'MultiSelect', 'a,b').valueText).toBe('a,b')
  })
  test('objectId is always stringified', () => {
    expect(buildValueEntry('b', 99, 'K', 'Text', 'x').objectId).toBe('99')
  })
})

describe('plugin/mass-upload: coerce', () => {
  const { coerce } = massUpload
  test('null/blank → null', () => {
    expect(coerce('integer', null)).toBeNull()
    expect(coerce('decimal', '')).toBeNull()
    expect(coerce('boolean', undefined)).toBeNull()
  })
  test('integer parses, returns null on junk', () => {
    expect(coerce('integer', '42')).toBe(42)
    expect(coerce('integer', 'abc')).toBeNull()
  })
  test('decimal parses, returns null on junk', () => {
    expect(coerce('decimal', '3.5')).toBe(3.5)
    expect(coerce('decimal', 'NaN-ish')).toBeNull()
  })
  test('boolean recognises the truthy token set (case-insensitive)', () => {
    for (const t of ['true', '1', 'yes', 'y', 'x', 'TRUE', ' Y ']) expect(coerce('boolean', t)).toBe(true)
    for (const f of ['false', '0', 'no', 'n']) expect(coerce('boolean', f)).toBe(false)
  })
  test('date accepts Date instances and parseable strings → ISO date', () => {
    expect(coerce('date', new Date('2026-06-22T08:00:00Z'))).toBe('2026-06-22')
    expect(coerce('date', '2026-06-22')).toBe('2026-06-22')
    expect(coerce('date', 'not-a-date')).toBeNull()
  })
  test('default type stringifies', () => {
    expect(coerce('text', 123)).toBe('123')
  })
})

describe('plugin/mass-upload: csvCell + resultsToCsv', () => {
  const { csvCell, resultsToCsv } = massUpload
  test('csvCell guards injection + quotes specials', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell(7)).toBe('7')
  })
  test('resultsToCsv writes the default header + one line per result', () => {
    const csv = resultsToCsv([{ rowNum: 2, operation: 'create', status: 'Success', message: 'Created', key: 'K1' }])
    const [header, row] = csv.split('\n')
    expect(header).toBe('rowNum,operation,status,message,key')
    expect(row).toBe('2,create,Success,Created,K1')
  })
  test('resultsToCsv honours a custom column set', () => {
    const csv = resultsToCsv([{ rowNum: 1, status: 'Error', dataset: 'X' }], ['rowNum', 'dataset', 'status'])
    expect(csv.split('\n')[0]).toBe('rowNum,dataset,status')
    expect(csv.split('\n')[1]).toBe('1,X,Error')
  })
  test('resultsToCsv on empty input yields only the header', () => {
    expect(resultsToCsv([]).split('\n')).toHaveLength(1)
  })
})

describe('plugin/mass-upload: parseFile round-trips an xlsx buffer', () => {
  test('parses the first sheet to an array of row objects', () => {
    const XLSX = require('xlsx')
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['code', 'qty'], ['A', 1], ['B', 2]])
    XLSX.utils.book_append_sheet(wb, sheet, 'Data')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const rows = massUpload.parseFile(buf)
    expect(rows).toEqual([{ code: 'A', qty: 1 }, { code: 'B', qty: 2 }])
  })
})
