/**
 * Configurable Attributes API
 * Mounts on /attributes/api
 *
 * Routes:
 *   GET  /config?objectType=bridge          — groups + attributes for an object type
 *   GET  /values/:objectType/:objectId      — all current attribute values for an object
 *   POST /values/:objectType/:objectId      — upsert attribute values (validates required + types)
 *   GET  /history/:objectType/:objectId/:key — version log for one attribute on one object
 *   GET  /template?objectType=bridge        — Excel template download (admin only)
 *   POST /import?objectType=bridge          — bulk import from XLSX/CSV (admin only)
 *   GET  /export?objectType=bridge          — all objects with attribute values as XLSX
 */

const cds = require('@sap/cds')
const express = require('express')
const XLSX = require('xlsx')

const { SELECT, INSERT, UPDATE } = cds.ql

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentUser(req) {
  // Only trust the x-user header in non-production environments (e.g. local dev / test).
  // In production the authenticated identity must come from req.user set by the auth middleware.
  const xUser = process.env.NODE_ENV !== 'production' ? req.headers['x-user'] : undefined
  return req.user?.id || xUser || 'system'
}

function _getTypedValueColumn(dataType) {
  switch (dataType) {
    case 'Integer':     return 'valueInteger'
    case 'Decimal':     return 'valueDecimal'
    case 'Date':        return 'valueDate'
    case 'Boolean':     return 'valueBoolean'
    default:            return 'valueText'  // Text, SingleSelect, MultiSelect
  }
}

function coerceValue(dataType, raw) {
  if (raw === null || raw === undefined || raw === '') return null
  switch (dataType) {
    case 'Integer':
      if (typeof raw === 'number' && Number.isInteger(raw)) return raw
      if (/^-?\d+$/.test(String(raw).trim())) return parseInt(raw, 10)
      throw new Error(`Expected a whole number`)
    case 'Decimal':
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (/^-?\d+(\.\d+)?$/.test(String(raw).trim())) return parseFloat(raw)
      throw new Error(`Expected a number`)
    case 'Date':
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw)
      throw new Error(`Expected date in YYYY-MM-DD format`)
    case 'Boolean':
      if (typeof raw === 'boolean') return raw
      if (raw === 'true' || raw === 'X' || raw === '1' || raw === 1) return true
      if (raw === 'false' || raw === '0' || raw === 0) return false
      throw new Error(`Expected true or false`)
    default:
      return String(raw).trim()
  }
}

function buildValueEntry(objectType, objectId, attributeKey, dataType, coerced) {
  return {
    objectType,
    objectId: String(objectId),
    attributeKey,
    valueText:    dataType === 'Text' || dataType === 'SingleSelect' || dataType === 'MultiSelect' ? coerced : null,
    valueInteger: dataType === 'Integer' ? coerced : null,
    valueDecimal: dataType === 'Decimal' ? coerced : null,
    valueDate:    dataType === 'Date' ? coerced : null,
    valueBoolean: dataType === 'Boolean' ? coerced : null,
  }
}

async function loadActiveConfig(db, objectType) {
  const groups = await db.run(
    SELECT.from('bridge.management.AttributeGroups')
      .where({ objectType, status: 'Active' })
      .orderBy('displayOrder')
  )
  if (!groups.length) return []

  const allDefs = await db.run(
    SELECT.from('bridge.management.AttributeDefinitions')
      .where({ objectType, status: 'Active' })
      .orderBy('displayOrder')
  )

  const configs = await db.run(
    SELECT.from('bridge.management.AttributeObjectTypeConfig')
      .where({ objectType })
  )
  const configByKey = new Map(configs.map(c => [c.attribute_ID, c]))

  const allowedValues = await db.run(
    SELECT.from('bridge.management.AttributeAllowedValues')
      .where({ status: 'Active' })
      .orderBy('displayOrder')
  )
  const avByAttrId = new Map()
  for (const av of allowedValues) {
    if (!avByAttrId.has(av.attribute_ID)) avByAttrId.set(av.attribute_ID, [])
    avByAttrId.get(av.attribute_ID).push({ value: av.value, label: av.label || av.value })
  }

  const groupMap = new Map(groups.map(g => [g.ID, { ...g, attributes: [] }]))

  for (const def of allDefs) {
    const cfg = configByKey.get(def.ID)
    if (!cfg || !cfg.enabled) continue
    const group = groupMap.get(def.group_ID)
    if (!group) continue
    const displayOrder = cfg.displayOrder != null ? cfg.displayOrder : def.displayOrder
    group.attributes.push({
      ...def,
      required: cfg.required || false,
      displayOrder,
      allowedValues: avByAttrId.get(def.ID) || []
    })
  }

  return groups
    .map(group => groupMap.get(group.ID))
    .filter(group => group.attributes.length > 0)
    .map(group => ({
      ...group,
      attributes: group.attributes.sort((currentDefinition, nextDefinition) => currentDefinition.displayOrder - nextDefinition.displayOrder)
    }))
}

async function loadValues(db, objectType, objectId) {
  return db.run(
    SELECT.from('bridge.management.AttributeValues')
      .where({ objectType, objectId: String(objectId) })
  )
}

async function writeValuesWithHistory(db, objectType, objectId, updates, changedBy, changeSource) {
  const existing = await loadValues(db, objectType, objectId)
  const existingByKey = new Map(existing.map(v => [v.attributeKey, v]))

  for (const { attributeKey, dataType, coercedValue } of updates) {
    const old = existingByKey.get(attributeKey)
    const entry = buildValueEntry(objectType, objectId, attributeKey, dataType, coercedValue)

    if (old) {
      await db.run(
        UPDATE('bridge.management.AttributeValues')
          .set({
            valueText:    entry.valueText,
            valueInteger: entry.valueInteger,
            valueDecimal: entry.valueDecimal,
            valueDate:    entry.valueDate,
            valueBoolean: entry.valueBoolean,
            modifiedBy:   changedBy,
            modifiedAt:   new Date().toISOString()
          })
          .where({ ID: old.ID })
      )
      await db.run(
        INSERT.into('bridge.management.AttributeValueHistory').entries({
          historyId:       cds.utils.uuid(),
          objectType,
          objectId:        String(objectId),
          attributeKey,
          oldValueText:    old.valueText,
          oldValueInteger: old.valueInteger,
          oldValueDecimal: old.valueDecimal,
          oldValueDate:    old.valueDate,
          oldValueBoolean: old.valueBoolean,
          newValueText:    entry.valueText,
          newValueInteger: entry.valueInteger,
          newValueDecimal: entry.valueDecimal,
          newValueDate:    entry.valueDate,
          newValueBoolean: entry.valueBoolean,
          changedBy,
          changedAt:       new Date().toISOString(),
          changeSource
        })
      )
    } else {
      const newId = cds.utils.uuid()
      await db.run(
        INSERT.into('bridge.management.AttributeValues').entries({
          ID:           newId,
          objectType,
          objectId:     String(objectId),
          attributeKey,
          valueText:    entry.valueText,
          valueInteger: entry.valueInteger,
          valueDecimal: entry.valueDecimal,
          valueDate:    entry.valueDate,
          valueBoolean: entry.valueBoolean,
          createdBy:    changedBy,
          createdAt:    new Date().toISOString(),
          modifiedBy:   changedBy,
          modifiedAt:   new Date().toISOString()
        })
      )
      await db.run(
        INSERT.into('bridge.management.AttributeValueHistory').entries({
          historyId:       cds.utils.uuid(),
          objectType,
          objectId:        String(objectId),
          attributeKey,
          newValueText:    entry.valueText,
          newValueInteger: entry.valueInteger,
          newValueDecimal: entry.valueDecimal,
          newValueDate:    entry.valueDate,
          newValueBoolean: entry.valueBoolean,
          changedBy,
          changedAt:       new Date().toISOString(),
          changeSource
        })
      )
    }
  }
}

// Build a flat list of { label, key } attribute column headers for a template
async function buildAttributeColumns(db, objectType) {
  const config = await loadActiveConfig(db, objectType)
  const cols = []
  for (const group of config) {
    for (const attr of group.attributes) {
      cols.push({
        label: `${attr.name} (${attr.internalKey})`,
        key: attr.internalKey,
        dataType: attr.dataType,
        required: attr.required,
        unit: attr.unit || '',
        allowedValues: attr.allowedValues || []
      })
    }
  }
  return cols
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = function mountAttributesApi(app, requiresAuthentication, validateCsrfToken, requiresScope) {
  const router = express.Router()
  router.use(express.json({ limit: '10mb' }))

  // GET /config?objectType=bridge
  router.get('/config', async (req, res) => {
    const { objectType } = req.query
    if (!objectType) return res.status(400).json({ error: { message: 'objectType is required' } })
    try {
      const db = await cds.connect.to('db')
      const config = await loadActiveConfig(db, objectType)
      res.json({ objectType, groups: config })
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Failed to load attribute config' } })
    }
  })

  // GET /values/:objectType/:objectId
  router.get('/values/:objectType/:objectId', async (req, res) => {
    const { objectType, objectId } = req.params
    try {
      const db = await cds.connect.to('db')
      const values = await loadValues(db, objectType, objectId)
      const flat = {}
      for (const savedCustomField of values) {
        flat[savedCustomField.attributeKey] = savedCustomField.valueText ?? savedCustomField.valueInteger ?? savedCustomField.valueDecimal ?? savedCustomField.valueDate ?? savedCustomField.valueBoolean ?? null
      }
      res.json({ objectType, objectId, values: flat })
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Failed to load attribute values' } })
    }
  })

  // POST /values/:objectType/:objectId
  // Body: { values: { key: rawValue, ... } }
  router.post('/values/:objectType/:objectId', async (req, res) => {
    const { objectType, objectId } = req.params
    const incoming = req.body?.values || {}
    try {
      const db = await cds.connect.to('db')
      const config = await loadActiveConfig(db, objectType)
      const attrMap = new Map()
      for (const group of config) {
        for (const attr of group.attributes) {
          attrMap.set(attr.internalKey, attr)
        }
      }

      const errors = []
      const updates = []

      for (const [key, rawValue] of Object.entries(incoming)) {
        const attr = attrMap.get(key)
        if (!attr) continue
        try {
          const coerced = coerceValue(attr.dataType, rawValue)
          // Validate allowed values for select types
          if ((attr.dataType === 'SingleSelect' || attr.dataType === 'MultiSelect') && coerced !== null) {
            const allowed = attr.allowedValues.map(av => av.value)
            const selectedValues = attr.dataType === 'MultiSelect' ? coerced.split(',').map(value => value.trim()) : [coerced]
            for (const selectedValue of selectedValues) {
              if (!allowed.includes(selectedValue)) errors.push(`${attr.name}: "${selectedValue}" is not an allowed value`)
            }
          }
          // Validate range
          if (attr.minValue != null && coerced != null && coerced < attr.minValue) {
            errors.push(`${attr.name}: value ${coerced} is below minimum ${attr.minValue}`)
          }
          if (attr.maxValue != null && coerced != null && coerced > attr.maxValue) {
            errors.push(`${attr.name}: value ${coerced} exceeds maximum ${attr.maxValue}`)
          }
          updates.push({ attributeKey: key, dataType: attr.dataType, coercedValue: coerced })
        } catch (error) {
          errors.push(`${attr.name}: ${error.message}`)
        }
      }

      // Check required fields
      for (const group of config) {
        for (const attr of group.attributes) {
          if (!attr.required) continue
          const incomingVal = incoming[attr.internalKey]
          const isSet = incomingVal !== null && incomingVal !== undefined && incomingVal !== ''
          if (!isSet) {
            // Only error if it was included in the payload (allow partial saves)
            if (Object.prototype.hasOwnProperty.call(incoming, attr.internalKey)) {
              errors.push(`${attr.name} is required and cannot be empty`)
            }
          }
        }
      }

      if (errors.length) return res.status(422).json({ errors })

      const changedBy = currentUser(req)
      await writeValuesWithHistory(db, objectType, objectId, updates, changedBy, 'manual')
      res.json({ ok: true, saved: updates.length })
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Failed to save attribute values' } })
    }
  })

  // DELETE /values/:objectType/:objectId — remove all attribute values for an object (admin reset)
  router.delete('/values/:objectType/:objectId', async (req, res) => {
    const { objectType, objectId } = req.params
    try {
      const db = await cds.connect.to('db')
      const existing = await loadValues(db, objectType, objectId)
      if (!existing.length) return res.json({ ok: true, deleted: 0 })

      const changedBy = currentUser(req)
      const now = new Date().toISOString()

      for (const existingCustomField of existing) {
        await db.run(
          INSERT.into('bridge.management.AttributeValueHistory').entries({
            historyId:       cds.utils.uuid(),
            objectType,
            objectId:        String(objectId),
            attributeKey:    existingCustomField.attributeKey,
            oldValueText:    existingCustomField.valueText,
            oldValueInteger: existingCustomField.valueInteger,
            oldValueDecimal: existingCustomField.valueDecimal,
            oldValueDate:    existingCustomField.valueDate,
            oldValueBoolean: existingCustomField.valueBoolean,
            changedBy,
            changedAt:       now,
            changeSource:    'manual'
          })
        )
      }

      const { DELETE: DEL } = cds.ql
      await db.run(
        DEL.from('bridge.management.AttributeValues')
          .where({ objectType, objectId: String(objectId) })
      )

      res.json({ ok: true, deleted: existing.length })
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Failed to delete attribute values' } })
    }
  })

  // GET /history/:objectType/:objectId/:key
  router.get('/history/:objectType/:objectId/:key', async (req, res) => {
    const { objectType, objectId, key } = req.params
    try {
      const db = await cds.connect.to('db')
      const rows = await db.run(
        SELECT.from('bridge.management.AttributeValueHistory')
          .where({ objectType, objectId: String(objectId), attributeKey: key })
          .orderBy('changedAt desc')
      )
      res.json({ history: rows })
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Failed to load history' } })
    }
  })

  // GET /template?objectType=bridge&format=xlsx|csv  (admin only)
  router.get('/template', async (req, res) => {
    const { objectType, format = 'xlsx' } = req.query
    if (!objectType) return res.status(400).json({ error: { message: 'objectType is required' } })
    try {
      const db = await cds.connect.to('db')
      const attrCols = await buildAttributeColumns(db, objectType)
      if (!attrCols.length) {
        return res.status(404).json({ error: { message: `No active attributes configured for object type: ${objectType}` } })
      }

      const idCol = objectType === 'bridge' ? 'bridgeId' : 'restrictionRef'
      const headers = [idCol, ...attrCols.map(c => c.label)]
      const requiredFlags = ['*', ...attrCols.map(c => c.required ? '*' : '')]

      const wb = XLSX.utils.book_new()
      const sheetLabel = objectType.charAt(0).toUpperCase() + objectType.slice(1) + 's'

      // Data sheet
      const dataSheet = XLSX.utils.aoa_to_sheet([requiredFlags, headers])
      dataSheet['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 16) }))
      XLSX.utils.book_append_sheet(wb, dataSheet, sheetLabel)

      // Instructions sheet
      const instrRows = [
        ['Configurable Attributes Import Template'],
        [''],
        [`Object Type: ${objectType}`],
        ['Fields marked with * in row 1 are required.'],
        ['Column header format: Label (internal_key) — use the internal_key for import matching.'],
        ['First data row starts at row 3.'],
        [''],
        ['Column', 'Internal Key', 'Data Type', 'Unit', 'Required', 'Allowed Values'],
        [idCol, idCol, 'Text', '', 'Yes (identifies the record)', ''],
        ...attrCols.map(c => [
          c.label,
          c.key,
          c.dataType,
          c.unit,
          c.required ? 'Yes' : 'No',
          c.allowedValues.map(av => av.value).join(', ')
        ])
      ]
      const instrSheet = XLSX.utils.aoa_to_sheet(instrRows)
      instrSheet['!cols'] = [{ wch: 36 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 60 }]
      XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions')

      if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(dataSheet)
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${objectType}-attributes-template.csv"`)
        return res.send(Buffer.from(csv, 'utf8'))
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${objectType}-attributes-template.xlsx"`)
      res.send(buf)
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Template generation failed' } })
    }
  })

  // POST /import?objectType=bridge&mode=all|skip  (admin only)
  // Body: { fileName, contentBase64, mode }  (same pattern as mass-upload)
  // mode=all: abort on any error; mode=skip: import valid rows, skip errors
  router.post('/import', async (req, res) => {
    const { objectType } = req.query
    const { contentBase64, mode = 'all' } = req.body || {}
    if (!objectType) return res.status(400).json({ error: { message: 'objectType is required' } })
    if (!contentBase64) return res.status(400).json({ error: { message: 'File content (contentBase64) is required' } })

    try {
      const buffer = Buffer.from(contentBase64, 'base64')
      const db = await cds.connect.to('db')
      const attrCols = await buildAttributeColumns(db, objectType)
      const attrByKey = new Map(attrCols.map(c => [c.key, c]))

      // Parse file
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const sheetLabel = objectType.charAt(0).toUpperCase() + objectType.slice(1) + 's'
      const sheet = wb.Sheets[sheetLabel] || wb.Sheets[wb.SheetNames[0]]
      if (!sheet) throw new Error(`Sheet "${sheetLabel}" not found in uploaded file`)

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
      if (rows.length < 3) return res.json({ created: 0, updated: 0, skipped: 0, errors: [] })

      // Row 1 = required flags (skipped), Row 2 = headers
      const headerRow = rows[1] || []
      const idCol = objectType === 'bridge' ? 'bridgeId' : 'restrictionRef'

      // Map header index → attribute key
      const colMap = []
      for (let headerIndex = 0; headerIndex < headerRow.length; headerIndex++) {
        const spreadsheetHeader = String(headerRow[headerIndex] || '')
        if (spreadsheetHeader === idCol) { colMap[headerIndex] = { type: 'id' }; continue }
        const match = spreadsheetHeader.match(/\(([^)]+)\)$/)
        if (match && attrByKey.has(match[1])) {
          colMap[headerIndex] = { type: 'attr', key: match[1], col: attrByKey.get(match[1]) }
        }
      }

      const idColIdx = colMap.findIndex(c => c?.type === 'id')
      if (idColIdx === -1) throw new Error(`ID column "${idCol}" not found in header row`)

      // Resolve object IDs
      const idLookupEntity = objectType === 'bridge' ? 'bridge.management.Bridges' : 'bridge.management.Restrictions'
      const idField = objectType === 'bridge' ? 'ID' : 'ID'
      const refField = objectType === 'bridge' ? 'bridgeId' : 'restrictionRef'
      const allObjects = await db.run(SELECT.from(idLookupEntity).columns(idField, refField))
      const objectIdByRef = new Map(allObjects.map(o => [o[refField], String(o[idField])]))

      const dataRows = rows.slice(2)
      const rowResults = []
      let created = 0, updated = 0, skippedCount = 0

      for (let ri = 0; ri < dataRows.length; ri++) {
        const row = dataRows[ri]
        const refVal = row[idColIdx] != null ? String(row[idColIdx]).trim() : ''
        if (!refVal) continue

        const objectId = objectIdByRef.get(refVal)
        if (!objectId) {
          rowResults.push({ row: ri + 3, ref: refVal, status: 'Error', message: `${idCol} "${refVal}" not found` })
          continue
        }

        const errors = []
        const updates = []

        for (let ci = 0; ci < colMap.length; ci++) {
          const colDef = colMap[ci]
          if (!colDef || colDef.type !== 'attr') continue
          const rawValue = row[ci]
          const { key, col } = colDef
          try {
            const coerced = coerceValue(col.dataType, rawValue)
            if (col.required && (coerced === null || coerced === undefined)) {
              errors.push(`${col.label.split(' (')[0]} is required`)
              continue
            }
            if ((col.dataType === 'SingleSelect' || col.dataType === 'MultiSelect') && coerced !== null) {
              const allowed = col.allowedValues.map(av => av.value)
              const selectedValues = col.dataType === 'MultiSelect' ? coerced.split(',').map(value => value.trim()) : [coerced]
              for (const selectedValue of selectedValues) {
                if (!allowed.includes(selectedValue)) errors.push(`${col.label.split(' (')[0]}: "${selectedValue}" is not an allowed value`)
              }
            }
            updates.push({ attributeKey: key, dataType: col.dataType, coercedValue: coerced })
          } catch (error) {
            errors.push(`${col.label.split(' (')[0]}: ${error.message}`)
          }
        }

        if (errors.length) {
          rowResults.push({ row: ri + 3, ref: refVal, status: 'Error', message: errors.join('; ') })
          if (mode === 'all') {
            return res.status(422).json({
              summary: { created, updated, skipped: skippedCount, errors: rowResults.filter(r => r.status === 'Error').length },
              rows: rowResults,
              aborted: true
            })
          }
          skippedCount++
          continue
        }

        // Check if this is a create or update
        const existingValues = await loadValues(db, objectType, objectId)
        const isUpdate = existingValues.length > 0
        const changedBy = currentUser(req)
        await writeValuesWithHistory(db, objectType, objectId, updates, changedBy, 'import')
        if (isUpdate) updated++; else created++
        rowResults.push({ row: ri + 3, ref: refVal, status: 'OK', message: isUpdate ? 'Updated' : 'Created' })
      }

      res.json({
        summary: { created, updated, skipped: skippedCount, errors: rowResults.filter(r => r.status === 'Error').length },
        rows: rowResults
      })
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Import failed' } })
    }
  })

  // GET /export?objectType=bridge&format=xlsx|csv
  router.get('/export', async (req, res) => {
    const { objectType, format = 'xlsx' } = req.query
    if (!objectType) return res.status(400).json({ error: { message: 'objectType is required' } })
    try {
      const db = await cds.connect.to('db')
      const attrCols = await buildAttributeColumns(db, objectType)

      const idLookupEntity = objectType === 'bridge' ? 'bridge.management.Bridges' : 'bridge.management.Restrictions'
      const coreFields = objectType === 'bridge'
        ? ['ID', 'bridgeId', 'bridgeName', 'state', 'assetOwner', 'postingStatus', 'conditionRating']
        : ['ID', 'restrictionRef', 'restrictionType', 'restrictionStatus', 'bridgeRef']
      const idField = 'ID'

      const objects = await db.run(SELECT.from(idLookupEntity).columns(...coreFields).orderBy(coreFields[1]))
      const allValues = await db.run(
        SELECT.from('bridge.management.AttributeValues').where({ objectType })
      )

      // Index values: objectId → key → display value
      const valueMap = new Map()
      for (const exportedCustomField of allValues) {
        if (!valueMap.has(exportedCustomField.objectId)) valueMap.set(exportedCustomField.objectId, new Map())
        const exportDisplayText = exportedCustomField.valueText ?? exportedCustomField.valueInteger ?? exportedCustomField.valueDecimal ?? exportedCustomField.valueDate ?? exportedCustomField.valueBoolean ?? ''
        valueMap.get(exportedCustomField.objectId).set(exportedCustomField.attributeKey, exportDisplayText != null ? String(exportDisplayText) : '')
      }

      const headerRow = [...coreFields, ...attrCols.map(attributeColumn => attributeColumn.label)]
      const dataRows = objects.map(obj => {
        const objValues = valueMap.get(String(obj[idField])) || new Map()
        return [
          ...coreFields.map(f => obj[f] != null ? obj[f] : ''),
          ...attrCols.map(c => objValues.get(c.key) || '')
        ]
      })

      const wb = XLSX.utils.book_new()
      const sheetLabel = objectType.charAt(0).toUpperCase() + objectType.slice(1) + 's'
      const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])
      sheet['!cols'] = headerRow.map(h => ({ wch: Math.max(String(h).length + 2, 14) }))
      XLSX.utils.book_append_sheet(wb, sheet, sheetLabel)

      if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(sheet)
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${objectType}-attributes-export.csv"`)
        return res.send(Buffer.from(csv, 'utf8'))
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${objectType}-attributes-export.xlsx"`)
      res.send(buf)
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Export failed' } })
    }
  })

  // Apply authentication guard (and CSRF guard for state-changing routes) if provided.
  // When called from server.js these are always passed; the fallback keeps the module
  // usable in isolation (e.g. unit tests) without breaking.
  const authMiddleware = typeof requiresAuthentication === 'function'
    ? requiresAuthentication
    : (_req, _res, next) => next()
  const csrfMiddleware = typeof validateCsrfToken === 'function'
    ? validateCsrfToken
    : (_req, _res, next) => next()
  // SEC-002: scope guard for mutating attribute config/values. requiresScope lets GET
  // through (reads stay open to any authenticated user); POST/import require the scope.
  const scopeMiddleware = typeof requiresScope === 'function'
    ? requiresScope
    : (_req, _res, next) => next()

  app.use('/attributes/api', authMiddleware, scopeMiddleware, csrfMiddleware, router)
}
