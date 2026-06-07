'use strict'

// Pure mass-edit value normalisation/coercion (extracted from server.js — P1-001 god-file
// reduction + P2-001 de-duplication). No CAP/DB dependency, so it is unit-testable in
// isolation. The field-type maps + required-field set stay in server.js (close to the
// routers) and are passed in.
function normalizeMassEditValue (field, value, fieldTypes, requiredFields) {
  const type = fieldTypes && fieldTypes[field]
  if (!type) {
    throw new Error(`Unsupported mass edit field: ${field}`)
  }

  if (value === undefined) {
    return undefined
  }

  if (value === '') {
    value = null
  }

  if (requiredFields && requiredFields.has(field) && (value === null || value === undefined)) {
    throw new Error(`${field} cannot be empty`)
  }

  switch (type) {
    case 'string':
      return value == null ? null : String(value).trim()
    case 'integer':
      if (value == null) return null
      if (typeof value === 'number' && Number.isInteger(value)) return value
      if (/^-?\d+$/.test(String(value).trim())) return Number.parseInt(value, 10)
      throw new Error(`${field} must be a whole number`)
    case 'decimal':
      if (value == null) return null
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (/^-?\d+(\.\d+)?$/.test(String(value).trim())) return Number.parseFloat(value)
      throw new Error(`${field} must be a number`)
    case 'boolean':
      if (value == null) return false
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 'X' || value === 1 || value === '1') return true
      if (value === 'false' || value === 0 || value === '0') return false
      throw new Error(`${field} must be true or false`)
    case 'date':
      if (value == null) return null
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
      throw new Error(`${field} must be in YYYY-MM-DD format`)
    default:
      return value
  }
}

module.exports = { normalizeMassEditValue }
