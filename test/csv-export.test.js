const { csvCell, buildBridgesCsv, buildRestrictionsCsv } = require('../srv/lib/csv-export')

describe('csv-export (extracted from server.js, ARCH-T4)', () => {
  test('csvCell quotes commas and escapes embedded quotes', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(42)).toBe('42')
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
