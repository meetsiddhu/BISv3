'use strict'

// Inspection-due decision-support (INSPECT-1/2, R3). The AssetClassStrategy holds the
// bridge-engineering inspection policy (interval per asset class / mode). This derives
// the next-due date + overdue signal for the risk worklist. SAP EAM owns the actual
// maintenance plan / scheduling (complement-not-replicate); this is advisory only.

function nextInspectionDue (lastInspectionDate, intervalMonths) {
  if (!lastInspectionDate || !(Number(intervalMonths) > 0)) return null
  const d = new Date(lastInspectionDate)
  if (isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + Number(intervalMonths))
  return d.toISOString().slice(0, 10)
}

function isOverdue (dueIso, now) {
  if (!dueIso) return false
  const due = new Date(dueIso)
  if (isNaN(due.getTime())) return false
  return due < (now ? new Date(now) : new Date())
}

module.exports = { nextInspectionDue, isOverdue }
