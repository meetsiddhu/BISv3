'use strict'

// [Domain 4 — Accessibility] WCAG 2.2 AA contrast regression guard.
//
// QA-Product/SuperTester finding FL-Q3 (2026-06-27): the freestyle FE custom-section
// controllers carried inline-style colours that fail WCAG 2.1.4.3 contrast on white
// (e.g. #aaa = 2.32:1, #ccc = 1.61:1, #8696a9 = 3.02:1, border #c0c0c0 = 1.82:1).
// They were replaced with AA-compliant tones (#767676, #5d6b7d, #5e6b78, #8a8a8a).
//
// This is a STATIC contrast gate — it does NOT replace a full axe/Playwright run
// (FL-Q5, still owed), but it deterministically blocks the specific low-contrast
// tokens from reappearing in the inline-styled controllers, in CI, with zero deps.

const fs = require('fs')
const path = require('path')

// Tokens CONFIRMED to fail WCAG 2.1.4.3 as text/border on white in this app's
// inline styles (FL-Q3). Hard-gated. The broader light-grey set (#999/#bbb/#ddd/#eee)
// is tracked separately as FL-Q3b — those need per-context review (large text,
// dark backgrounds, and 1.4.11 divider exceptions can legitimately pass) and are
// NOT blanket-banned here to avoid false positives breaking the build.
const BANNED = [
  '#aaa', '#aaaaaa',
  '#ccc', '#cccccc',
  '#c0c0c0', '#8696a9', '#6a7a8b'
]
// Boundary-safe: a hex token not followed by another hex digit (so #aaa won't match inside #aaab12).
// NOTE: case-insensitive only — NO 'g' flag. RegExp.test() with 'g' is stateful (lastIndex persists
// across files in test.each), which produces spurious matches. 'i' alone keeps .test() stateless.
const PATTERNS = BANNED.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![0-9a-fA-F])', 'i'))

// Scan every freestyle FE extension controller (where inline styles live).
const ROOT = path.join(__dirname, '..', 'app')
function walk (dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    // Skip node_modules and build output (dist/ is generated from webapp/ source).
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, acc) }
    else if (/\/webapp\/ext\/.*\.js$/.test(p) && !/\.test\.js$/.test(p)) acc.push(p)
  }
  return acc
}

describe('[Domain 4] WCAG 2.1.4.3 contrast guard — inline-style controllers', () => {
  const files = fs.existsSync(ROOT) ? walk(ROOT, []) : []

  test('scans at least the known inline-styled controllers', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test.each(files)('%s has no low-contrast hex colours', (file) => {
    const src = fs.readFileSync(file, 'utf8')
    const hits = []
    PATTERNS.forEach((re, i) => { if (re.test(src)) hits.push(BANNED[i]) })
    // Asserting {file, hits} (not bare hits) so a failure diff names the offending
    // file + the low-contrast token(s) — replace with an AA tone (#767676, #5d6b7d, #8a8a8a).
    expect({ file: path.relative(ROOT, file), lowContrast: hits }).toEqual({ file: path.relative(ROOT, file), lowContrast: [] })
  })
})
