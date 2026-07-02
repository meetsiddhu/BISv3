const { csvCell, neutralizeFormula, buildBridgesCsv, buildRestrictionsCsv } = require('../srv/lib/csv-export')

describe('csv-export (extracted from server.js, ARCH-T4)', () => {
  test('csvCell quotes commas and escapes embedded quotes', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(42)).toBe('42')
  })

  // UAT P3-006: spreadsheet formula injection — cells starting with = + - @ are neutralised.
  test('csvCell neutralises formula-injection prefixes', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+44')).toBe("'+44")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('=cmd|calc,x')).toBe('"\'=cmd|calc,x"') // prefixed then quoted (has comma)
    expect(csvCell('Normal Bridge')).toBe('Normal Bridge')  // no false positives
  })

  // SEC: neutralizeFormula guards the SheetJS (XLSX/CSV) export path in attributes-api /
  // mass-upload — it neutralises the formula prefix WITHOUT the CSV comma/quote wrapping
  // (which would corrupt an .xlsx cell). SheetJS does its own quoting.
  test('neutralizeFormula prefixes formula triggers but does not CSV-quote', () => {
    expect(neutralizeFormula('=cmd|calc,x')).toBe("'=cmd|calc,x") // prefixed, NOT wrapped in quotes
    expect(neutralizeFormula('=1+1')).toBe("'=1+1")
    expect(neutralizeFormula('+44')).toBe("'+44")
    expect(neutralizeFormula('-5')).toBe("'-5")
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutralizeFormula('\t=x')).toBe("'\t=x")
    expect(neutralizeFormula('Normal, Bridge')).toBe('Normal, Bridge') // comma left as-is (SheetJS quotes)
    expect(neutralizeFormula(null)).toBe('')
    expect(neutralizeFormula(42)).toBe('42')
  })

  test('buildBridgesCsv emits a header + one row per bridge, with quoting', () => {
    const csv = buildBridgesCsv([
      { ID: 1, bridgeId: 'B1', bridgeName: 'Anzac, Bridge', state: 'NSW', conditionRating: 8 }
    ])
    const [header, row] = csv.split('\n')
    expect(header.startsWith('ID,bridgeId,bridgeName,state')).toBe(true)
    expect(row).toContain('"Anzac, Bridge"')   // comma in name is quoted
    expect(row.startsWith('1,B1,')).toBe(true)
  })

  test('buildBridgesCsv appends custom-attribute columns by ID', () => {
    const cols = [{ key: 'INSP_GRADE', label: 'Inspection Grade' }]
    const vals = new Map([['1', new Map([['INSP_GRADE', 'A']])]])
    const csv = buildBridgesCsv([{ ID: 1, bridgeId: 'B1', bridgeName: 'X', state: 'NSW' }], cols, vals)
    expect(csv.split('\n')[0]).toContain('Inspection Grade')
    expect(csv.split('\n')[1].endsWith(',A')).toBe(true)
  })

  test('buildRestrictionsCsv emits the restriction header set', () => {
    const csv = buildRestrictionsCsv([{ ID: 9, restrictionRef: 'R9', bridgeName: 'X', restrictionType: 'Mass Limit' }])
    expect(csv.split('\n')[0]).toContain('restrictionType')
    expect(csv.split('\n')[1].startsWith('9,R9,')).toBe(true)
  })

  test('empty input still yields a header line', () => {
    expect(buildBridgesCsv([]).split('\n')[0]).toContain('bridgeId')
  })
})
