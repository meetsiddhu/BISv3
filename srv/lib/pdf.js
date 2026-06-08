'use strict'
// Minimal, dependency-free PDF generator (council improvement: server-rendered, branded, paginated
// A4 PDF). Uses only the 14 standard PDF Type-1 fonts (Helvetica / Helvetica-Bold) — NO font
// embedding, NO native deps, NO heavy libraries — so it runs unchanged on the CF Node buildpack and
// SQLite dev. Flow layout with a top-down cursor and automatic page breaks. Text is WinAnsi/latin1.

const A4 = { w: 595.28, h: 841.89 }

// Rough Helvetica advance widths (em fraction) — good enough for conservative word-wrap.
function charEm (ch) {
  if (ch === ' ') return 0.278
  if ('iltjfI.,;:\'!|()[]'.indexOf(ch) >= 0) return 0.28
  if ('mwMW@'.indexOf(ch) >= 0) return 0.86
  if (ch >= 'A' && ch <= 'Z') return 0.7
  if (ch >= '0' && ch <= '9') return 0.556
  return 0.52
}
function textWidth (s, size) { let w = 0; for (const c of String(s)) w += charEm(c); return w * size }

function escapePdf (s) {
  return String(s == null ? '' : s)
    // keep printable latin1; replace anything outside to '?'
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

class Pdf {
  constructor (opts = {}) {
    this.margin = opts.margin || 48
    this.brand = opts.brand || [0.12, 0.16, 0.32] // deep navy
    this.pages = []
    this.footer = opts.footer || ''
    this._newPage()
  }

  _newPage () {
    this.ops = []
    this.pages.push(this.ops)
    this.cursor = this.margin // distance from TOP
    this._pageHeaderDrawn = false
  }

  _y () { return A4.h - this.cursor } // convert top-distance to PDF bottom-origin
  _ensure (need) { if (this.cursor + need > A4.h - this.margin - 18) this._newPage() }

  _fill (c) { this.ops.push(`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} rg`) }
  _stroke (c) { this.ops.push(`${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} RG`) }

  rect (x, yTop, w, h, color) {
    this._fill(color || this.brand)
    this.ops.push(`${x.toFixed(2)} ${(A4.h - yTop - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }

  hline (color, weight) {
    this._stroke(color || [0.8, 0.8, 0.78])
    this.ops.push(`${(weight || 0.5).toFixed(2)} w ${this.margin.toFixed(2)} ${this._y().toFixed(2)} m ${(A4.w - this.margin).toFixed(2)} ${this._y().toFixed(2)} l S`)
  }

  _drawText (str, x, baselineY, size, bold, color) {
    const f = bold ? '/F2' : '/F1'
    const c = color || [0.1, 0.1, 0.09]
    this.ops.push(`BT ${f} ${size} Tf ${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} rg ${x.toFixed(2)} ${baselineY.toFixed(2)} Td (${escapePdf(str)}) Tj ET`)
  }

  // Wrap a string to the content width at the given size.
  _wrap (str, size, width) {
    const words = String(str).split(/\s+/)
    const lines = []; let line = ''
    for (const w of words) {
      const trial = line ? line + ' ' + w : w
      if (textWidth(trial, size) > width && line) { lines.push(line); line = w } else line = trial
    }
    if (line) lines.push(line)
    return lines
  }

  // ── flow helpers ──
  brandHeader (title, subtitle) {
    this.rect(0, 0, A4.w, 64, this.brand)
    // "logo" wordmark (no image dependency): a square + the system name
    this.rect(this.margin, 22, 18, 18, [0.36, 0.62, 0.92])
    this._drawText('BIS', this.margin + 22, A4.h - 36, 13, true, [1, 1, 1])
    this._drawText(title, this.margin + 60, A4.h - 31, 15, true, [1, 1, 1])
    if (subtitle) this._drawText(subtitle, this.margin + 60, A4.h - 47, 8.5, false, [0.82, 0.86, 0.95])
    this.cursor = 64 + 22
  }

  heading (str, size) {
    this._ensure(28)
    this.cursor += (size || 12) + 6
    this._drawText(str, this.margin, this._y(), size || 12, true, this.brand)
    this.cursor += 4
    this.hline([0.85, 0.85, 0.83], 0.5)
    this.cursor += 6
  }

  kv (label, value) {
    this._ensure(16)
    this.cursor += 13
    this._drawText(label, this.margin, this._y(), 9.5, false, [0.45, 0.45, 0.43])
    this._drawText(String(value == null ? '' : value), this.margin + 170, this._y(), 9.5, true, [0.12, 0.12, 0.1])
    this.cursor += 3
  }

  paragraph (str, size) {
    const s = size || 9.5
    const lines = this._wrap(str, s, A4.w - 2 * this.margin)
    for (const ln of lines) {
      this._ensure(s + 4)
      this.cursor += s + 3
      this._drawText(ln, this.margin, this._y(), s, false, [0.18, 0.18, 0.16])
    }
  }

  // KPI band: array of {label, value}
  kpis (items) {
    this._ensure(48)
    const gap = 8
    const w = (A4.w - 2 * this.margin - gap * (items.length - 1)) / items.length
    const top = this.cursor
    items.forEach((it, i) => {
      const x = this.margin + i * (w + gap)
      this.rect(x, top, w, 44, [0.953, 0.949, 0.929])
      this._drawText(it.label, x + 8, A4.h - (top + 14), 7.8, false, [0.45, 0.45, 0.43])
      this._drawText(String(it.value), x + 8, A4.h - (top + 34), 16, true, this.brand)
    })
    this.cursor = top + 44 + 6
  }

  tableHeader (cols) { // cols: [{text,x,align}]
    this._ensure(16)
    this.cursor += 12
    cols.forEach(c => this._col(c.text, c.x, c.w, c.align, 8.5, true, [0.45, 0.45, 0.43]))
    this.cursor += 3
    this.hline([0.85, 0.85, 0.83], 0.5)
  }

  tableRow (cells) { // cells: [{text,x,w,align,bold,color}]
    this._ensure(15)
    this.cursor += 12
    cells.forEach(c => this._col(c.text, c.x, c.w, c.align, 9, c.bold, c.color))
    this.cursor += 2
    this.hline([0.93, 0.93, 0.91], 0.3)
  }

  _col (text, x, w, align, size, bold, color) {
    let tx = x
    if (align === 'right') tx = x + w - textWidth(String(text), size)
    this._drawText(String(text), tx, this._y(), size, !!bold, color || [0.15, 0.15, 0.13])
  }

  spacer (h) { this.cursor += (h || 8) }

  build () {
    const objs = [] // each: string body (without "N 0 obj"/"endobj")
    const add = (body) => { objs.push(body); return objs.length } // returns obj number

    // reserve: 1 catalog, 2 pages, fonts 3/4, then page+content pairs
    const catalogNo = 1
    const pagesNo = 2
    const fontHelv = 3
    const fontBold = 4
    objs.push('') // 1
    objs.push('') // 2
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>') // 3
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>') // 4

    const pageNos = []
    const total = this.pages.length
    this.pages.forEach((ops, idx) => {
      // page footer (number + footer text)
      const footer = `${this.footer}${this.footer ? '   ·   ' : ''}Page ${idx + 1} of ${total}`
      const fOps = ops.slice()
      fOps.push(`BT /F1 8 Tf 0.5 0.5 0.48 rg ${this.margin} ${(this.margin - 16).toFixed(2)} Td (${escapePdf(footer)}) Tj ET`)
      const content = fOps.join('\n')
      const len = Buffer.byteLength(content, 'latin1')
      const contentNo = add(`<< /Length ${len} >>\nstream\n${content}\nendstream`)
      const pageNo = add(`<< /Type /Page /Parent ${pagesNo} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${fontHelv} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentNo} 0 R >>`)
      pageNos.push(pageNo)
    })

    objs[catalogNo - 1] = `<< /Type /Catalog /Pages ${pagesNo} 0 R >>`
    objs[pagesNo - 1] = `<< /Type /Pages /Kids [${pageNos.map(n => n + ' 0 R').join(' ')}] /Count ${pageNos.length} >>`

    // assemble with xref
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    const offsets = []
    for (let i = 0; i < objs.length; i++) {
      offsets[i] = Buffer.byteLength(pdf, 'latin1')
      pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`
    }
    const xrefStart = Buffer.byteLength(pdf, 'latin1')
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    for (let i = 0; i < objs.length; i++) {
      pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
    }
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogNo} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    return Buffer.from(pdf, 'latin1')
  }
}

module.exports = { Pdf, A4, textWidth }
