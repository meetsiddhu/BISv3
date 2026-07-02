'use strict'

// ISOLATION TEST for the governed-config plugin — it must run STANDALONE: no @sap/cds, no
// database, no sibling plugin loaded. These pure helpers generalise the proven
// PrioritisationModel clone/version/activate + per-class precedence pattern so BHI and Risk
// can reuse one lifecycle (docs/CONFIGURABLE-ENGINES-ASSESSMENT.md §6).

const gc = require('../../srv/lib/plugins/governed-config')

// deterministic id generator (the plugin injects genId, so tests don't need real uuids)
const makeGen = () => { let n = 0; return () => `id-${++n}` }

describe('[plugin:governed-config] independence + lifecycle helpers', () => {
  test('loads without @sap/cds or any sibling plugin (pure module)', () => {
    expect(typeof gc.cloneTree).toBe('function')
    expect(typeof gc.precedenceResolve).toBe('function')
    expect(typeof gc.activationPlan).toBe('function')
  })

  test('nextVersion = max+1 (1 when empty)', () => {
    expect(gc.nextVersion([])).toBe(1)
    expect(gc.nextVersion([1, 3, 2])).toBe(4)
    expect(gc.nextVersion([2, 'x', null])).toBe(3) // junk ignored
  })

  test('cloneTree deep-copies a model + children into a fresh Draft with new ids + reset governance', () => {
    const model = { ID: 'm1', code: 'BHI-DEFAULT', name: 'Default', version: 2, status: 'Active', isTemplate: false, reviewedBy: 'jo', reviewedAt: '2026-01-01', createdAt: 'x', createdBy: 'sys' }
    const children = [
      { ID: 'c1', model_ID: 'm1', assetClass: 'Culvert', mode: 'Road', bucket: 'deck', weight: 0.25, createdAt: 'x' },
      { ID: 'c2', model_ID: 'm1', assetClass: 'Culvert', mode: 'Road', bucket: 'substructure', weight: 0.5, modifiedBy: 'sys' }
    ]
    const out = gc.cloneTree({ model, children, genId: makeGen(), overrides: { code: 'BHI-COASTAL', name: 'Coastal' } })

    // new model: fresh id, version bumped, forced Draft, clonedFrom set, review wiped, framework stripped
    expect(out.model.ID).toBe('id-1')
    expect(out.model.version).toBe(3)
    expect(out.model.status).toBe('Draft')
    expect(out.model.clonedFrom).toBe('m1')
    expect(out.model.reviewedBy).toBeNull()
    expect(out.model.code).toBe('BHI-COASTAL') // override applied
    expect(out.model.createdAt).toBeUndefined() // framework stripped
    // children: new ids, re-parented to the new model, payload preserved
    expect(out.children.map(c => c.ID)).toEqual(['id-2', 'id-3'])
    expect(out.children.every(c => c.model_ID === 'id-1')).toBe(true)
    expect(out.children[1].weight).toBe(0.5)
    // purity: source untouched
    expect(model.ID).toBe('m1')
    expect(children[0].ID).toBe('c1')
  })

  test('precedenceResolve: (class,mode) → (class,*) → (*,mode) → (*,*) → null', () => {
    const rows = [
      { assetClass: 'Culvert', mode: 'Road', w: 'A' },
      { assetClass: 'Culvert', mode: '*', w: 'B' },
      { assetClass: '*', mode: 'Road', w: 'C' },
      { assetClass: '*', mode: '*', w: 'D' }
    ]
    expect(gc.precedenceResolve(rows, { assetClass: 'Culvert', mode: 'Road' }).w).toBe('A') // exact
    expect(gc.precedenceResolve(rows, { assetClass: 'Culvert', mode: 'Rail' }).w).toBe('B') // class + any-mode
    expect(gc.precedenceResolve(rows, { assetClass: 'Beam', mode: 'Road' }).w).toBe('C')    // any-class + mode
    expect(gc.precedenceResolve(rows, { assetClass: 'Beam', mode: 'Rail' }).w).toBe('D')    // global fallback
    expect(gc.precedenceResolve([{ assetClass: 'Culvert', mode: 'Road', w: 'A' }], { assetClass: 'Beam', mode: 'Rail' })).toBeNull()
  })

  test('activationPlan: activate target + retire only same-code Active siblings', () => {
    const models = [
      { ID: 'a', code: 'BHI-DEFAULT', status: 'Active' },
      { ID: 'b', code: 'BHI-DEFAULT', status: 'Draft' },   // the one being activated
      { ID: 'c', code: 'BHI-DEFAULT', status: 'Retired' },  // already retired — leave it
      { ID: 'd', code: 'OTHER', status: 'Active' }           // different code — leave it
    ]
    const plan = gc.activationPlan(models, 'b')
    expect(plan).toEqual({ ok: true, activate: 'b', retire: ['a'] })
    expect(gc.activationPlan(models, 'zzz')).toEqual({ ok: false, reason: 'not-found' })
  })
})
