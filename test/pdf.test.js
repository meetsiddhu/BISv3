const { Pdf, textWidth } = require('../srv/lib/pdf')

describe('srv/lib/pdf — dependency-free PDF writer', () => {
  test('produces a structurally valid single-page PDF', () => {
    const doc = new Pdf({ footer: 'BIS-PRI-TEST' })
    doc.brandHeader('Bridge Prioritisation — Portfolio One-Pager', 'Generated 2026-06-09')
    doc.kpis([{ label: 'Top-decile cost', value: '$8.4m' }, { label: 'P1', value: 3 }, { label: 'Assessed', value: '12 / 32' }])
    doc.heading('Headline')
    doc.paragraph('3 of 12 assessed structures are P1 critical. Funding the top decile is an estimated $8.4m.')
    doc.heading('Governance')
    doc.kv('Methodology owner', 'Asset Risk Committee')
    const buf = doc.build()
    expect(Buffer.isBuffer(buf)).toBe(true)
    const s = buf.toString('latin1')
    expect(s.startsWith('%PDF-1.')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Type /Catalog')
    expect(s).toContain('/BaseFont /Helvetica-Bold')
    // xref count line present and consistent
    expect(s).toMatch(/xref\n0 \d+/)
  })

  test('auto-paginates: lots of rows yield more than one /Type /Page', () => {
    const doc = new Pdf()
    doc.brandHeader('Many rows', '')
    for (let i = 0; i < 120; i++) doc.tableRow([{ text: 'Bridge ' + i, x: 48, w: 200 }, { text: String(i), x: 400, w: 80, align: 'right' }])
    const s = doc.build().toString('latin1')
    const pages = (s.match(/\/Type \/Page\b(?!s)/g) || []).length
    expect(pages).toBeGreaterThan(1)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  test('escapes PDF-significant characters without throwing', () => {
    const doc = new Pdf()
    doc.brandHeader('Edge (chars) \\ test', '')
    doc.paragraph('Parentheses ( ) backslash \\ and unicode — “smart” quotes €')
    const buf = doc.build()
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(300)
  })

  test('textWidth grows with length', () => {
    expect(textWidth('ii', 10)).toBeLessThan(textWidth('MM', 10))
  })
})
