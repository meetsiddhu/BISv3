const cds  = require('@sap/cds')
const path = require('path')
const LOG  = cds.log('bms-upload')
const { validateGeoJson } = require('../lib/geo')
const { writeChangeLogs } = require('../audit-log')
const { loadRestrictionLookups, validateRestrictionCodes, refreshBridgePostingStatus } = require('../lib/restriction-codelists')
const { buildRestrictionsCsv } = require('../lib/csv-export')

const ALLOWED_EXTENSIONS     = ['.xlsx', '.csv', '.xls']
const MAX_FILE_SIZE_BYTES    = 50 * 1024 * 1024
const MAX_ROWS               = Number(process.env.MAX_UPLOAD_ROWS) || 50000 // CONFIG-T3

const BRIDGE_DOWNLOAD_HEADERS = [
    'bridgeId', 'bridgeName', 'state', 'region', 'lga',
    'latitude', 'longitude', 'structureType', 'material',
    'yearBuilt', 'spanLength', 'totalLength', 'deckWidth', 'clearanceHeight',
    'spanCount', 'numberOfLanes', 'designLoad',
    'condition', 'conditionRating',
    'postingStatus',
    'assetOwner', 'managingAuthority',
    'floodImpacted', 'floodImmunityAriYears',
    'hmlApproved', 'bDoubleApproved', 'freightRoute', 'overMassRoute',
    'nhvrAssessed', 'pbsApprovalClass',
    'importanceLevel', 'seismicZone',
    'averageDailyTraffic', 'heavyVehiclePercent',
    'highPriorityAsset', 'remarks',
    'dataSource', 'sourceReferenceUrl', 'openDataReference', 'geoJson'
]

function validateUploadFile (fileName, fileContent) {
    const ext = path.extname(fileName || '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw { code: 400, message: `Invalid file type '${ext}'. Only ${ALLOWED_EXTENSIONS.join(', ')} are allowed.` }
    }
    const sizeBytes = Buffer.isBuffer(fileContent)
        ? fileContent.length
        : Buffer.byteLength(fileContent, 'base64')
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
        throw { code: 400, message: `File too large: ${Math.round(sizeBytes / 1024 / 1024)}MB. Maximum allowed: 50MB.` }
    }
    return { ext, sizeBytes }
}

function parseCSV (csv) {
    const lines = csv.split('\n').filter(line => line.trim())
    if (lines.length < 2) return { headers: [], rows: [] }
    const headers = lines[0].split(',').map(header => header.trim().replace(/^"|"$/g, ''))
    const rows = lines.slice(1).map(line => {
        const cols = []
        let current = '', insideQuotes = false
        for (const ch of line) {
            if (ch === '"') { insideQuotes = !insideQuotes }
            else if (ch === ',' && !insideQuotes) { cols.push(current.trim()); current = '' }
            else current += ch
        }
        cols.push(current.trim())
        return Object.fromEntries(headers.map((header, colIndex) => [header, cols[colIndex] ?? '']))
    })
    return { headers, rows }
}

const parseString  = rawValue => (rawValue && rawValue.trim()) ? rawValue.trim() : null
const parseInteger = rawValue => (rawValue && rawValue.trim()) ? parseInt(rawValue, 10) : null
const parseDecimal = rawValue => (rawValue && rawValue.trim()) ? parseFloat(rawValue) : null
const parseBoolean = rawValue => rawValue === 'true' || rawValue === 'TRUE' || rawValue === 'yes' || rawValue === '1'
    ? true
    : rawValue === 'false' || rawValue === 'FALSE' || rawValue === 'no' || rawValue === '0'
        ? false
        : null
const parseDate    = rawValue => (rawValue && rawValue.trim()) ? rawValue.trim() : null

module.exports = function registerUploadHandlers (srv, helpers = {}) {

    // ── massUploadBridges ────────────────────────────────────────────────────
    srv.on('massUploadBridges', async req => {
        try {
            const { csvData, fileName } = req.data
            if (!csvData) return req.error(400, 'csvData is required')

            validateUploadFile(fileName || 'upload.csv', csvData)

            const { rows } = parseCSV(csvData)
            if (rows.length > MAX_ROWS) {
                return req.error(400, `Too many rows: ${rows.length}. Maximum ${MAX_ROWS} rows per upload.`)
            }

            let succeeded = 0, failed = 0
            const errors = []
            const tx = cds.tx(req)
            try {
                const maxIdResult = await tx.run(
                    SELECT.one.from('bridge.management.Bridges').columns(['max(ID) as maxID'])
                )
                let nextBridgeID = (maxIdResult?.maxID || 0) + 1

                for (const [rowIndex, row] of rows.entries()) {
                    try {
                        if (!parseString(row.bridgeId) || !parseString(row.bridgeName)) {
                            failed++
                            errors.push(`Row ${rowIndex + 2}: bridgeId and bridgeName are required`)
                            continue
                        }

                        const entry = {
                            bridgeId:             parseString(row.bridgeId),
                            bridgeName:           parseString(row.bridgeName),
                            state:                parseString(row.state)  || 'NSW',
                            region:               parseString(row.region),
                            lga:                  parseString(row.lga),
                            latitude:             parseDecimal(row.latitude),
                            longitude:            parseDecimal(row.longitude),
                            structureType:        parseString(row.structureType),
                            material:             parseString(row.material),
                            yearBuilt:            parseInteger(row.yearBuilt),
                            spanLength:           parseDecimal(row.spanLength),
                            totalLength:          parseDecimal(row.totalLength),
                            deckWidth:            parseDecimal(row.deckWidth),
                            clearanceHeight:      parseDecimal(row.clearanceHeight),
                            spanCount:            parseInteger(row.spanCount),
                            numberOfLanes:        parseInteger(row.numberOfLanes),
                            designLoad:           parseString(row.designLoad),
                            condition:            parseString(row.condition)      || 'Good',
                            conditionRating:      parseInteger(row.conditionRating),
                            postingStatus:        parseString(row.postingStatus)  || 'Unrestricted',
                            assetOwner:           parseString(row.assetOwner),
                            managingAuthority:    parseString(row.managingAuthority),
                            floodImpacted:        parseBoolean(row.floodImpacted) ?? false,
                            floodImmunityAriYears: parseInteger(row.floodImmunityAriYears),
                            hmlApproved:          parseBoolean(row.hmlApproved)      ?? false,
                            bDoubleApproved:      parseBoolean(row.bDoubleApproved)  ?? false,
                            freightRoute:         parseBoolean(row.freightRoute)     ?? false,
                            overMassRoute:        parseBoolean(row.overMassRoute)    ?? false,
                            nhvrAssessed:         parseBoolean(row.nhvrAssessed)     ?? false,
                            pbsApprovalClass:     parseString(row.pbsApprovalClass),
                            importanceLevel:      parseInteger(row.importanceLevel),
                            seismicZone:          parseString(row.seismicZone),
                            averageDailyTraffic:  parseInteger(row.averageDailyTraffic),
                            heavyVehiclePercent:  parseDecimal(row.heavyVehiclePercent),
                            highPriorityAsset:    parseBoolean(row.highPriorityAsset) ?? false,
                            loadRating:           parseDecimal(row.loadRating),
                            remarks:              parseString(row.remarks),
                            dataSource:           parseString(row.dataSource),
                            sourceReferenceUrl:   parseString(row.sourceReferenceUrl),
                            openDataReference:    parseString(row.openDataReference),
                            geoJson:              (() => {            // GIS-5: never persist malformed/[lat,lon]-swapped geometry
                                                    const gj = validateGeoJson(parseString(row.geoJson))
                                                    if (!gj.ok) { LOG.warn(`Row ${row.bridgeId || '?'}: invalid geoJson dropped — ${gj.error}`); return null }
                                                    return gj.value
                                                  })(),
                            lastInspectionDate:   parseDate(row.lastInspectionDate),
                            gazetteReference:     parseString(row.gazetteReference),
                            nhvrReferenceUrl:     parseString(row.nhvrReferenceUrl),
                        }

                        Object.keys(entry).forEach(fieldName => {
                            if (entry[fieldName] === null) delete entry[fieldName]
                        })

                        const existingBridge = await tx.run(
                            SELECT.one.from('bridge.management.Bridges').where({ bridgeId: entry.bridgeId })
                        )
                        if (existingBridge) {
                            await tx.run(
                                UPDATE('bridge.management.Bridges').set(entry).where({ bridgeId: entry.bridgeId })
                            )
                        } else {
                            await tx.run(
                                INSERT.into('bridge.management.Bridges').entries({ ID: nextBridgeID++, ...entry })
                            )
                        }
                        succeeded++
                    } catch (rowError) { failed++; errors.push(`Row ${rowIndex + 2} (${row.bridgeId}): ${rowError.message}`) }
                }
                await tx.commit()
            } catch (txError) {
                await tx.rollback()
                return req.error(500, `Upload failed: ${txError.message}`)
            }
            return { processed: rows.length, succeeded, failed, errors: errors.join('\n') }
        } catch (uploadError) {
            if (uploadError.code === 400) return req.error(400, uploadError.message)
            LOG.error('massUploadBridges unexpected error', uploadError)
            return req.error(500, `Upload failed: ${uploadError.message}`)
        }
    })

    // ── massUploadRestrictions ───────────────────────────────────────────────
    // R4/R6 RECORDED DECISION (docs/RESTRICTIONS-REVIEW-2026-06.json, amendments):
    // bulk intake deliberately writes ONE master — bridge.management.Restrictions.
    // There is intentionally NO BridgeRestrictions upload dataset: since R6 every
    // read surface (NetworkRestrictionReport ALP, dashboard KPIs, prioritisation
    // restrictionFlag, postingStatus) reads the bridge.management.
    // UnifiedRestrictions UNION view over BOTH masters, an uploaded row is fully
    // visible everywhere — a second intake path would only re-create the dual-
    // master write ambiguity the council flagged. BridgeRestrictions remains the
    // interactive master for the Bridges register object-page tab only.
    srv.on('massUploadRestrictions', async req => {
        try {
            const { csvData, fileName } = req.data
            if (!csvData) return req.error(400, 'csvData is required')

            validateUploadFile(fileName || 'upload.csv', csvData)

            const { rows } = parseCSV(csvData)
            if (rows.length > MAX_ROWS) {
                return req.error(400, `Too many rows: ${rows.length}. Maximum ${MAX_ROWS} rows per upload.`)
            }

            let succeeded = 0, failed = 0
            const errors = []
            const bridgeIntegerIdCache = new Map()
            const affectedBridgeIds = new Set()
            const batchId = cds.utils.uuid()
            const changedBy = req.user?.id || 'system'
            const tx = cds.tx(req)
            try {
                // Codelist validation reads the lookup TABLES (admin-extensible —
                // rule 4), falling back to the canonical catalogue when empty.
                const lookups = await loadRestrictionLookups(tx)

                // Auto-generate restrictionRef (RST-NNNN) for rows without one —
                // same sequence pattern as the AdminService NEW-draft handler.
                const { cnt } = await tx.run(
                    SELECT.one.from('bridge.management.Restrictions').columns('count(1) as cnt')
                )
                let nextRefSeq = (Number(cnt) || 0) + 1

                for (const [rowIndex, row] of rows.entries()) {
                    try {
                        if (!parseString(row.restrictionType) || !parseString(row.restrictionValue) || !parseString(row.restrictionUnit)) {
                            failed++
                            errors.push(`Row ${rowIndex + 2}: restrictionType, restrictionValue, restrictionUnit are required`)
                            continue
                        }

                        let bridgeIntegerID = parseInteger(row.bridge_ID) || null
                        if (!bridgeIntegerID && parseString(row.bridgeRef)) {
                            const bridgeRef = parseString(row.bridgeRef)
                            if (!bridgeIntegerIdCache.has(bridgeRef)) {
                                const matchedBridge = await tx.run(
                                    SELECT.one('ID').from('bridge.management.Bridges').where({ bridgeId: bridgeRef })
                                )
                                bridgeIntegerIdCache.set(bridgeRef, matchedBridge ? matchedBridge.ID : null)
                            }
                            bridgeIntegerID = bridgeIntegerIdCache.get(bridgeRef)
                            if (!bridgeIntegerID) {
                                failed++
                                errors.push(`Row ${rowIndex + 2}: bridge '${bridgeRef}' not found — upload bridges first`)
                                continue
                            }
                        }

                        const entry = {
                            ID:                      cds.utils.uuid(),
                            bridge_ID:               bridgeIntegerID,
                            bridgeRef:               parseString(row.bridgeRef),
                            restrictionRef:          parseString(row.restrictionRef),
                            name:                    parseString(row.name),
                            descr:                   parseString(row.descr),
                            restrictionType:         parseString(row.restrictionType),
                            restrictionValue:        parseString(row.restrictionValue),
                            restrictionUnit:         parseString(row.restrictionUnit),
                            restrictionCategory:     parseString(row.restrictionCategory) || 'Permanent',
                            restrictionStatus:       parseString(row.restrictionStatus)   || 'Active',
                            appliesToVehicleClass:   parseString(row.appliesToVehicleClass),
                            grossMassLimit:          parseDecimal(row.grossMassLimit),
                            axleMassLimit:           parseDecimal(row.axleMassLimit),
                            heightLimit:             parseDecimal(row.heightLimit),
                            widthLimit:              parseDecimal(row.widthLimit),
                            lengthLimit:             parseDecimal(row.lengthLimit),
                            speedLimit:              parseInteger(row.speedLimit),
                            permitRequired:          parseBoolean(row.permitRequired) ?? false,
                            escortRequired:          parseBoolean(row.escortRequired) ?? false,
                            temporary:               parseBoolean(row.temporary)      ?? false,
                            effectiveFrom:           parseDate(row.effectiveFrom),
                            effectiveTo:             parseDate(row.effectiveTo),
                            direction:               parseString(row.direction),
                            issuingAuthority:        parseString(row.issuingAuthority),
                            legalReference:          parseString(row.legalReference),
                            // Previously-dropped columns (upload gap fix)
                            approvedBy:              parseString(row.approvedBy),
                            approvalReference:       parseString(row.approvalReference),
                            enforcementAuthority:    parseString(row.enforcementAuthority),
                            temporaryFrom:           parseDate(row.temporaryFrom),
                            temporaryTo:             parseDate(row.temporaryTo),
                            temporaryReason:         parseString(row.temporaryReason),
                            // New NSW/NHVR attributes (additive)
                            gazetteNumber:           parseString(row.gazetteNumber),
                            gazettePublicationDate:  parseDate(row.gazettePublicationDate),
                            gazetteExpiryDate:       parseDate(row.gazetteExpiryDate),
                            reviewDueDate:           parseDate(row.reviewDueDate),
                            approvalDate:            parseDate(row.approvalDate),
                            restrictionReason:       parseString(row.restrictionReason),
                            detourRoute:             parseString(row.detourRoute),
                            conditionTrigger:        parseString(row.conditionTrigger),
                            pbsClassApplicable:      parseString(row.pbsClassApplicable),
                            grossCombinationLimit:   parseDecimal(row.grossCombinationLimit),
                            tandemAxleLimit:         parseDecimal(row.tandemAxleLimit),
                            triAxleLimit:            parseDecimal(row.triAxleLimit),
                            steerAxleLimit:          parseDecimal(row.steerAxleLimit),
                            pilotVehicleCount:       parseInteger(row.pilotVehicleCount),
                            signageRequired:         parseBoolean(row.signageRequired) ?? false,
                            restrictionSeverity:     parseString(row.restrictionSeverity),
                            laneAvailability:        parseString(row.laneAvailability),
                            lanesOpen:               parseInteger(row.lanesOpen),
                            lanesTotal:              parseInteger(row.lanesTotal),
                            laneWidthLimit:          parseDecimal(row.laneWidthLimit),
                            active:                  true,
                        }

                        // Row-level codelist validation: blocking codes (type/
                        // category/status) fail the row; soft codes (unit/
                        // direction/vehicle class) are reported and cleared.
                        const codeErrors = validateRestrictionCodes(entry, lookups)
                        const blocking = codeErrors.filter(e => e.blocking)
                        if (blocking.length) {
                            failed++
                            errors.push(`Row ${rowIndex + 2}: ${blocking.map(e => e.message).join('; ')}`)
                            continue
                        }
                        for (const softError of codeErrors) {
                            errors.push(`Row ${rowIndex + 2}: ${softError.message} — value cleared`)
                            entry[softError.field] = null
                        }

                        if (!entry.restrictionRef) {
                            entry.restrictionRef = `RST-${String(nextRefSeq++).padStart(4, '0')}`
                        }
                        if (!entry.name) entry.name = entry.restrictionRef || entry.restrictionType

                        Object.keys(entry).forEach(fieldName => {
                            if (entry[fieldName] === null) delete entry[fieldName]
                        })

                        await tx.run(INSERT.into('bridge.management.Restrictions').entries(entry))
                        // Rule 3: ChangeLog on every CUD — bulk source fails loudly
                        // inside the tx, so an audit miss rolls the upload back.
                        await writeChangeLogs(tx, {
                            objectType: 'Restriction',
                            objectId:   entry.ID,
                            objectName: entry.restrictionRef || entry.ID,
                            source:     'MassUpload',
                            batchId,
                            changedBy,
                            changes: Object.entries(entry)
                                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                                .map(([k, v]) => ({ fieldName: k, oldValue: '', newValue: String(v) }))
                        })
                        if (entry.bridge_ID) affectedBridgeIds.add(entry.bridge_ID)
                        succeeded++
                    } catch (rowError) { failed++; errors.push(`Row ${rowIndex + 2}: ${rowError.message}`) }
                }
                // Recompute postingStatus for every bridge that gained restrictions
                // (same derivation as the OData path — closure types => CLOSED).
                if (helpers.updateBridgePostingStatus) {
                    for (const bridgeId of affectedBridgeIds) {
                        await helpers.updateBridgePostingStatus(bridgeId, tx, req)
                    }
                } else {
                    await refreshBridgePostingStatus(tx, [...affectedBridgeIds])
                }
                await tx.commit()
            } catch (txError) {
                await tx.rollback()
                return req.error(500, `Upload failed: ${txError.message}`)
            }
            return { processed: rows.length, succeeded, failed, errors: errors.join('\n') }
        } catch (uploadError) {
            if (uploadError.code === 400) return req.error(400, uploadError.message)
            LOG.error('massUploadRestrictions unexpected error', uploadError)
            return req.error(500, `Upload failed: ${uploadError.message}`)
        }
    })

    // ── massDownloadBridges ──────────────────────────────────────────────────
    srv.on('massDownloadBridges', async req => {
        const { region, state } = req.data
        const db = await cds.connect.to('db')
        const filterCriteria = {}
        if (state)  filterCriteria.state  = state
        if (region) filterCriteria.region = region
        const bridges = await db.run(
            SELECT.from('bridge.management.Bridges').where(filterCriteria)
        )

        const quoteCsvValue = cellValue => {
            if (cellValue == null || cellValue === '') return ''
            const stringValue = String(cellValue)
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return '"' + stringValue.replace(/"/g, '""') + '"'
            }
            return stringValue
        }

        const csv = [
            BRIDGE_DOWNLOAD_HEADERS.join(','),
            ...bridges.map(bridge =>
                BRIDGE_DOWNLOAD_HEADERS.map(fieldName => quoteCsvValue(bridge[fieldName])).join(',')
            )
        ].join('\n')

        return {
            csvData:     csv,
            filename:    `bridges_${state || 'all'}_${new Date().toISOString().split('T')[0]}.csv`,
            recordCount: bridges.length
        }
    })

    // ── massDownloadRestrictions — round-trip extract for mass edit/upload ───
    srv.on('massDownloadRestrictions', async req => {
        const { state } = req.data || {}
        const db = await cds.connect.to('db')
        const [restrictions, bridges] = await Promise.all([
            db.run(SELECT.from('bridge.management.Restrictions')),
            db.run(SELECT.from('bridge.management.Bridges').columns('ID', 'bridgeId', 'bridgeName', 'state'))
        ])
        const bridgeById = new Map(bridges.map(bridge => [String(bridge.ID), bridge]))
        let records = restrictions.map(restriction => {
            const bridge = bridgeById.get(String(restriction.bridge_ID))
            return {
                ...restriction,
                bridgeRef:  restriction.bridgeRef || bridge?.bridgeId || '',
                bridgeName: bridge?.bridgeName || '',
                state:      bridge?.state || ''
            }
        })
        if (state) records = records.filter(record => record.state === state)
        return {
            csvData:     buildRestrictionsCsv(records),
            filename:    `restrictions_${state || 'all'}_${new Date().toISOString().split('T')[0]}.csv`,
            recordCount: records.length
        }
    })
}
