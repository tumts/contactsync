/**
 * SyncService.gs — Orchestrator for contact synchronization.
 */

var SYNC_BATCH_SIZE = 50;
var SYNC_BATCH_PAUSE_MS = 3000;
var SYNC_API_DELAY_MS = 1000;
var SYNC_TIMEOUT_MS = 270000; // 4.5 minutes (guard before 5-min limit)
var SYNC_CHECKPOINT_INTERVAL = 10;
var SYNC_MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Scan DataSiswa sheet and import to Contacts sheet.
 * @return {string} JSON result summary.
 */
function scanDataSiswa() {
  var config = loadConfig();
  var sourceSheet = config.SOURCE_SHEET || 'DataSiswa';
  var sourceData = readSourceSheetAsObjects(sourceSheet);

  if (!sourceData || sourceData.length === 0) {
    return JSON.stringify({ success: false, message: 'No data found in ' + sourceSheet });
  }

  var presetId = Number(config.NAMING_PRESET || 1);
  var yearLabel = config.DEFAULT_YEAR_LABEL || '2026';
  var organization = config.DEFAULT_ORGANIZATION || '';
  var groupName = config.DEFAULT_GROUP_NAME || '';
  var parentMode = config.PARENT_CONTACT_MODE || 'consolidated';

  var contacts = [];
  var parentCount = 0;

  // Preserve existing WA check data
  var existingContacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var existingWaMap = {};
  var existingSyncMap = {};
  for (var e = 0; e < existingContacts.length; e++) {
    var ec = existingContacts[e];
    var phone = String(ec.phonePrimary || '').trim();
    if (phone) {
      if (ec.waPhoneStatus) {
        existingWaMap[phone] = {
          waPhoneStatus: String(ec.waPhoneStatus || ''),
          waPhoneCheckedAt: String(ec.waPhoneCheckedAt || '')
        };
      }
      // Also preserve sync data for already-synced contacts
      if (ec.googleResourceName) {
        existingSyncMap[phone] = {
          googleResourceName: String(ec.googleResourceName || ''),
          googleEtag: String(ec.googleEtag || ''),
          syncStatus: String(ec.syncStatus || ''),
          lastSyncedAt: String(ec.lastSyncedAt || '')
        };
      }
    }
  }

  for (var i = 0; i < sourceData.length; i++) {
    var row = sourceData[i];
    var mapped = mapSourceColumns(row);

    mapped.yearLabel = yearLabel;
    mapped.organization = organization;
    mapped.groupName = groupName;
    mapped.id = String(i + 1);
    mapped.syncStatus = 'pending';
    mapped.namingPattern = applyNamingPreset(presetId, mapped);
    mapped.studentStatus = mapped.studentStatus || config.DEFAULT_STUDENT_STATUS || 'aktif';
    mapped.labels = buildLabels(mapped.classLabel, mapped.yearLabel, mapped.studentStatus);
    mapped.dedupeKey = generateDedupeKey(mapped.fullName, mapped.phonePrimary, mapped.emailPrimary);

    contacts.push(mapped);

    // Restore existing WA check data
    var mappedPhone = String(mapped.phonePrimary || '').trim();
    if (mappedPhone && existingWaMap[mappedPhone]) {
      mapped.waPhoneStatus = existingWaMap[mappedPhone].waPhoneStatus;
      mapped.waPhoneCheckedAt = existingWaMap[mappedPhone].waPhoneCheckedAt;
    }
    // Restore existing sync data
    if (mappedPhone && existingSyncMap[mappedPhone]) {
      mapped.googleResourceName = existingSyncMap[mappedPhone].googleResourceName;
      mapped.googleEtag = existingSyncMap[mappedPhone].googleEtag;
      mapped.syncStatus = existingSyncMap[mappedPhone].syncStatus;
      mapped.lastSyncedAt = existingSyncMap[mappedPhone].lastSyncedAt;
    }

    // Separate parent contacts if mode is 'separate'
    if (parentMode === 'separate') {
      var statusAyah = String(row['status_ayah'] || '').trim();
      if (statusAyah === 'Masih Hidup' && (row['wa_ayah'] || row['email_ayah'])) {
        var fatherName = String(row['nama_ayah'] || '').trim();
        var fatherParts = splitFullName(fatherName);
        var fatherContact = {
          id: String(i + 1) + '-ayah',
          fullName: fatherName,
          givenName: fatherParts.givenName,
          familyName: fatherParts.familyName,
          emailPrimary: cleanEmail(row['email_ayah']),
          emailSecondary: '',
          phonePrimary: normalizePhoneNumber(row['wa_ayah']),
          phoneSecondary: '',
          organization: organization,
          jobTitle: 'Wali Murid',
          classLabel: mapped.classLabel,
          yearLabel: yearLabel,
          address: '',
          notes: 'Ayah dari ' + mapped.fullName + ' (' + mapped.classLabel + ')',
          parentName: '',
          parentPhone: '',
          parentEmail: '',
          parentRole: 'Ayah',
          relationshipLabel: 'father',
          groupName: config.DEFAULT_PARENT_GROUP_NAME || ('Orangtua ' + (organization || '')),
          labels: '',
          googleResourceName: '',
          googleEtag: '',
          syncStatus: 'pending',
          lastSyncedAt: '',
          lastError: '',
          sourceUpdatedAt: '',
          waPhoneStatus: '',
          waPhoneCheckedAt: '',
          namingPattern: applyNamingPreset(presetId, { fullName: fatherName, givenName: fatherParts.givenName, familyName: fatherParts.familyName }),
          syncPreviewAction: '',
          dedupeKey: generateDedupeKey(fatherName, normalizePhoneNumber(row['wa_ayah']), cleanEmail(row['email_ayah'])),
          studentStatus: ''
        };
        contacts.push(fatherContact);
        var fatherPhone = String(fatherContact.phonePrimary || '').trim();
        if (fatherPhone && existingWaMap[fatherPhone]) {
          fatherContact.waPhoneStatus = existingWaMap[fatherPhone].waPhoneStatus;
          fatherContact.waPhoneCheckedAt = existingWaMap[fatherPhone].waPhoneCheckedAt;
        }
        if (fatherPhone && existingSyncMap[fatherPhone]) {
          fatherContact.googleResourceName = existingSyncMap[fatherPhone].googleResourceName;
          fatherContact.googleEtag = existingSyncMap[fatherPhone].googleEtag;
          fatherContact.syncStatus = existingSyncMap[fatherPhone].syncStatus;
          fatherContact.lastSyncedAt = existingSyncMap[fatherPhone].lastSyncedAt;
        }
        fatherContact.labels = buildParentLabels(mapped.classLabel, yearLabel, 'Ayah');
        parentCount++;
      }

      var statusIbu = String(row['status_ibu'] || '').trim();
      if (statusIbu === 'Masih Hidup' && (row['wa_ibu'] || row['email_ibu'])) {
        var motherName = String(row['nama_ibu'] || '').trim();
        var motherParts = splitFullName(motherName);
        var motherContact = {
          id: String(i + 1) + '-ibu',
          fullName: motherName,
          givenName: motherParts.givenName,
          familyName: motherParts.familyName,
          emailPrimary: cleanEmail(row['email_ibu']),
          emailSecondary: '',
          phonePrimary: normalizePhoneNumber(row['wa_ibu']),
          phoneSecondary: '',
          organization: organization,
          jobTitle: 'Wali Murid',
          classLabel: mapped.classLabel,
          yearLabel: yearLabel,
          address: '',
          notes: 'Ibu dari ' + mapped.fullName + ' (' + mapped.classLabel + ')',
          parentName: '',
          parentPhone: '',
          parentEmail: '',
          parentRole: 'Ibu',
          relationshipLabel: 'mother',
          groupName: config.DEFAULT_PARENT_GROUP_NAME || ('Orangtua ' + (organization || '')),
          labels: '',
          googleResourceName: '',
          googleEtag: '',
          syncStatus: 'pending',
          lastSyncedAt: '',
          lastError: '',
          sourceUpdatedAt: '',
          waPhoneStatus: '',
          waPhoneCheckedAt: '',
          namingPattern: applyNamingPreset(presetId, { fullName: motherName, givenName: motherParts.givenName, familyName: motherParts.familyName }),
          syncPreviewAction: '',
          dedupeKey: generateDedupeKey(motherName, normalizePhoneNumber(row['wa_ibu']), cleanEmail(row['email_ibu'])),
          studentStatus: ''
        };
        contacts.push(motherContact);
        var motherPhone = String(motherContact.phonePrimary || '').trim();
        if (motherPhone && existingWaMap[motherPhone]) {
          motherContact.waPhoneStatus = existingWaMap[motherPhone].waPhoneStatus;
          motherContact.waPhoneCheckedAt = existingWaMap[motherPhone].waPhoneCheckedAt;
        }
        if (motherPhone && existingSyncMap[motherPhone]) {
          motherContact.googleResourceName = existingSyncMap[motherPhone].googleResourceName;
          motherContact.googleEtag = existingSyncMap[motherPhone].googleEtag;
          motherContact.syncStatus = existingSyncMap[motherPhone].syncStatus;
          motherContact.lastSyncedAt = existingSyncMap[motherPhone].lastSyncedAt;
        }
        motherContact.labels = buildParentLabels(mapped.classLabel, yearLabel, 'Ibu');
        parentCount++;
      }
    }
  }

  writeObjectsToSheet(config.CONTACTS_SHEET || 'Contacts', contacts, CONTACTS_HEADERS);

  var studentCount = sourceData.length;
  logAction('system', 'scan', 'success',
    'Scanned ' + studentCount + ' students, ' + parentCount + ' parents',
    JSON.stringify({ total: contacts.length }));

  return JSON.stringify({
    success: true,
    total: contacts.length,
    students: studentCount,
    parents: parentCount
  });
}

/**
 * Preview sync — dry-run without writing to Google Contacts.
 * @return {string} JSON result summary.
 */
function previewSync() {
  clearGroupCache();
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');

  if (!contacts || contacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts found. Run Scan DataSiswa first.' });
  }

  var startTime = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('SYNC_CANCEL');
  var startIndex = 0;

  // Check for resumed progress
  var savedProgress = props.getProperty('previewSync_progress');
  if (savedProgress) {
    try {
      var progress = JSON.parse(savedProgress);
      startIndex = progress.lastIndex || 0;
    } catch (e) {
      startIndex = 0;
    }
  }

  var createCount = 0;
  var updateCount = 0;
  var skipCount = 0;
  var errorCount = 0;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.CONTACTS_SHEET || 'Contacts');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var previewCol = -1;
  for (var h = 0; h < headers.length; h++) {
    if (headers[h] === 'syncPreviewAction') {
      previewCol = h + 1;
      break;
    }
  }

  for (var i = startIndex; i < contacts.length; i++) {
    // Timeout guard — check every SYNC_CHECKPOINT_INTERVAL rows
    if (i > startIndex && (i - startIndex) % SYNC_CHECKPOINT_INTERVAL === 0) {
      var elapsed = new Date().getTime() - startTime;
      if (elapsed > SYNC_TIMEOUT_MS) {
        props.setProperty('previewSync_progress', JSON.stringify({
          lastIndex: i,
          create: createCount,
          update: updateCount,
          skip: skipCount,
          error: errorCount
        }));
        return JSON.stringify({
          complete: false,
          processed: i,
          total: contacts.length,
          create: createCount,
          update: updateCount,
          skip: skipCount,
          error: errorCount
        });
      }

      var cancelFlag = props.getProperty('SYNC_CANCEL');
      if (cancelFlag === 'true') {
        props.deleteProperty('SYNC_CANCEL');
        props.deleteProperty('previewSync_progress');
        SpreadsheetApp.flush();
        logAction('system', 'preview', 'warning', 'Preview cancelled by user at index ' + i, '');
        return JSON.stringify({
          complete: false,
          cancelled: true,
          processed: i,
          total: contacts.length,
          create: createCount,
          update: updateCount,
          skip: skipCount,
          error: errorCount
        });
      }
    }

    var c = contacts[i];
    var action = 'create';

    try {
      var existing = searchExistingContact(
        c.fullName,
        c.emailPrimary,
        c.phonePrimary,
        c.googleResourceName
      );

      if (existing && existing.found) {
        action = 'update';
        updateCount++;
      } else {
        createCount++;
      }
    } catch (e) {
      action = 'error';
      errorCount++;
    }

    // Update the syncPreviewAction column in the sheet
    if (previewCol > 0 && c._rowIndex) {
      sheet.getRange(c._rowIndex, previewCol).setValue(action);
    }

    // Small delay to avoid rate limits
    if (i < contacts.length - 1) {
      Utilities.sleep(200);
    }
  }

  // Clear progress marker
  props.deleteProperty('previewSync_progress');
  SpreadsheetApp.flush();

  logAction('system', 'preview', 'success',
    'Preview complete: ' + createCount + ' create, ' + updateCount + ' update, ' + skipCount + ' skip',
    JSON.stringify({ create: createCount, update: updateCount, skip: skipCount, error: errorCount }));

  return JSON.stringify({
    complete: true,
    total: contacts.length,
    create: createCount,
    update: updateCount,
    skip: skipCount,
    error: errorCount
  });
}

/**
 * Resume a previously timed-out preview.
 * @return {string} JSON result summary.
 */
function resumePreview() {
  return previewSync();
}

/**
 * Execute sync to Google Contacts.
 * @return {string} JSON result summary.
 */
function runSync() {
  clearGroupCache();
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');

  if (!contacts || contacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts found. Run Scan DataSiswa first.' });
  }

  var startTime = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('SYNC_CANCEL');
  var startIndex = 0;

  var savedProgress = props.getProperty('runSync_progress');
  if (savedProgress) {
    try {
      var progress = JSON.parse(savedProgress);
      startIndex = progress.lastIndex || 0;
    } catch (e) {
      startIndex = 0;
    }
  }

  var syncedCount = 0;
  var errorCount = 0;
  var skippedCount = 0;
  var contactsSheet = config.CONTACTS_SHEET || 'Contacts';
  var consecutiveErrors = 0;
  var maxConsecutiveErrors = parseInt(config.SYNC_MAX_CONSECUTIVE_ERRORS) || SYNC_MAX_CONSECUTIVE_ERRORS;

  for (var i = startIndex; i < contacts.length; i++) {
    // Timeout guard
    if (i > startIndex && (i - startIndex) % SYNC_CHECKPOINT_INTERVAL === 0) {
      var elapsed = new Date().getTime() - startTime;
      if (elapsed > SYNC_TIMEOUT_MS) {
        props.setProperty('runSync_progress', JSON.stringify({
          lastIndex: i,
          synced: syncedCount,
          errors: errorCount,
          skipped: skippedCount
        }));
        SpreadsheetApp.flush();
        return JSON.stringify({
          complete: false,
          synced: syncedCount,
          errors: errorCount,
          skipped: skippedCount,
          total: contacts.length,
          processed: i
        });
      }

      var cancelFlag = props.getProperty('SYNC_CANCEL');
      if (cancelFlag === 'true') {
        props.deleteProperty('SYNC_CANCEL');
        props.deleteProperty('runSync_progress');
        SpreadsheetApp.flush();
        logAction('system', 'sync', 'warning', 'Sync cancelled by user at index ' + i,
          JSON.stringify({ synced: syncedCount, errors: errorCount, skipped: skippedCount }));
        return JSON.stringify({
          complete: false,
          cancelled: true,
          synced: syncedCount,
          errors: errorCount,
          skipped: skippedCount,
          total: contacts.length,
          processed: i
        });
      }
    }

    // Batch pause
    if (i > startIndex && (i - startIndex) % SYNC_BATCH_SIZE === 0) {
      Utilities.sleep(SYNC_BATCH_PAUSE_MS);
    }

    var c = contacts[i];
    var action = String(c.syncPreviewAction || '').trim();

    if (action !== 'create' && action !== 'update') {
      skippedCount++;
      continue;
    }

    // Skip already-synced contacts with 'create' action to prevent duplicates after clearErrorsAndReset
    if (action === 'create' && String(c.syncStatus || '').trim() === 'synced') {
      skippedCount++;
      continue;
    }

    var result;
    if (action === 'create') {
      result = createGoogleContact(c);
      if (result.success) {
        updateRowByKey(contactsSheet, 'id', c.id, {
          googleResourceName: result.resourceName,
          googleEtag: result.etag,
          syncStatus: 'synced',
          lastSyncedAt: formatTimestamp(new Date()),
          lastError: ''
        });
        syncedCount++;
        consecutiveErrors = 0;
        logAction(c.id, 'create', 'success', 'Created contact: ' + c.fullName, result.resourceName);
      } else {
        updateRowByKey(contactsSheet, 'id', c.id, {
          syncStatus: 'error',
          lastError: result.error || 'Unknown error'
        });
        errorCount++;
        consecutiveErrors++;
        logAction(c.id, 'create', 'error', 'Failed to create: ' + c.fullName, result.error);
      }
    } else if (action === 'update') {
      result = updateGoogleContact(c.googleResourceName, c.googleEtag, c);
      if (result.success) {
        updateRowByKey(contactsSheet, 'id', c.id, {
          googleResourceName: result.resourceName,
          googleEtag: result.etag,
          syncStatus: 'synced',
          lastSyncedAt: formatTimestamp(new Date()),
          lastError: ''
        });
        syncedCount++;
        consecutiveErrors = 0;
        logAction(c.id, 'update', 'success', 'Updated contact: ' + c.fullName,
          result.retried ? 'Retried with fresh etag' : '');
      } else {
        updateRowByKey(contactsSheet, 'id', c.id, {
          syncStatus: 'error',
          lastError: result.error || 'Unknown error'
        });
        errorCount++;
        consecutiveErrors++;
        logAction(c.id, 'update', 'error', 'Failed to update: ' + c.fullName, result.error);
      }
    }

    // Stop on consecutive errors
    if (consecutiveErrors >= maxConsecutiveErrors) {
      props.setProperty('runSync_progress', JSON.stringify({
        lastIndex: i + 1,
        synced: syncedCount,
        errors: errorCount,
        skipped: skippedCount
      }));
      SpreadsheetApp.flush();
      logAction('system', 'sync', 'error',
        'Sync stopped: ' + consecutiveErrors + ' consecutive errors. Fix issues and run again.',
        JSON.stringify({ synced: syncedCount, errors: errorCount, lastError: result.error }));
      return JSON.stringify({
        complete: false,
        stoppedOnError: true,
        synced: syncedCount,
        errors: errorCount,
        skipped: skippedCount,
        total: contacts.length,
        processed: i + 1,
        message: 'Stopped after ' + consecutiveErrors + ' consecutive errors'
      });
    }

    // Rate limiting with exponential backoff on errors
    if (consecutiveErrors > 0) {
      Utilities.sleep(SYNC_API_DELAY_MS * Math.min(consecutiveErrors, 5));
    } else {
      Utilities.sleep(SYNC_API_DELAY_MS);
    }
  }

  // Clear progress
  props.deleteProperty('runSync_progress');
  SpreadsheetApp.flush();

  logAction('system', 'sync', syncedCount > 0 ? 'success' : 'warning',
    'Sync complete: ' + syncedCount + ' synced, ' + errorCount + ' errors',
    JSON.stringify({ synced: syncedCount, errors: errorCount, skipped: skippedCount }));

  return JSON.stringify({
    complete: true,
    synced: syncedCount,
    errors: errorCount,
    skipped: skippedCount,
    total: contacts.length
  });
}

/**
 * Resume a previously timed-out sync.
 * @return {string} JSON result summary.
 */
function resumeSync() {
  return runSync();
}

/**
 * Test sync with a small number of contacts to verify everything works.
 * @param {number} count Number of contacts to test (default 2).
 * @return {string} JSON result summary.
 */
function testSync(count) {
  count = count || 2;
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');

  if (!contacts || contacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts found.' });
  }

  // Find first N contacts with syncPreviewAction = 'create' or 'update'
  var testContacts = [];
  for (var i = 0; i < contacts.length && testContacts.length < count; i++) {
    var action = String(contacts[i].syncPreviewAction || '').trim();
    if (action === 'create' || action === 'update') {
      testContacts.push(contacts[i]);
    }
  }

  if (testContacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts with create/update action found. Run Preview Sync first.' });
  }

  clearGroupCache();
  var contactsSheet = config.CONTACTS_SHEET || 'Contacts';
  var syncedCount = 0;
  var errorCount = 0;
  var results = [];

  for (var t = 0; t < testContacts.length; t++) {
    var c = testContacts[t];
    var action = String(c.syncPreviewAction || '').trim();
    var result;

    if (action === 'create') {
      result = createGoogleContact(c);
    } else {
      result = updateGoogleContact(c.googleResourceName, c.googleEtag, c);
    }

    if (result.success) {
      updateRowByKey(contactsSheet, 'id', c.id, {
        googleResourceName: result.resourceName,
        googleEtag: result.etag,
        syncStatus: 'synced',
        lastSyncedAt: formatTimestamp(new Date()),
        lastError: ''
      });
      syncedCount++;
      results.push({ name: c.fullName, action: action, status: 'success' });
      logAction(c.id, action, 'success', 'Test sync: ' + c.fullName, result.resourceName);
    } else {
      updateRowByKey(contactsSheet, 'id', c.id, {
        syncStatus: 'error',
        lastError: result.error || 'Unknown error'
      });
      errorCount++;
      results.push({ name: c.fullName, action: action, status: 'error', error: result.error });
      logAction(c.id, action, 'error', 'Test sync failed: ' + c.fullName, result.error);
    }

    Utilities.sleep(SYNC_API_DELAY_MS);
  }

  logAction('system', 'sync', errorCount > 0 ? 'error' : 'success',
    'Test sync: ' + syncedCount + ' synced, ' + errorCount + ' errors (tested ' + testContacts.length + ')',
    JSON.stringify(results));

  return JSON.stringify({
    success: errorCount === 0,
    tested: testContacts.length,
    synced: syncedCount,
    errors: errorCount,
    results: results
  });
}

/**
 * Refresh Contacts sheet from Google Contacts (read-only import).
 * @return {string} JSON result summary.
 */
function refreshFromContacts() {
  var config = loadConfig();
  var contactsSheet = config.CONTACTS_SHEET || 'Contacts';
  var sheetContacts = readSheetAsObjects(contactsSheet);

  var googleContacts = fetchAllGoogleContacts();

  if (!googleContacts || googleContacts.length === 0) {
    return JSON.stringify({ success: true, total: 0, updated: 0, message: 'No Google Contacts found' });
  }

  // Build a map of resourceName → sheet row
  var resourceMap = {};
  for (var i = 0; i < sheetContacts.length; i++) {
    var rn = String(sheetContacts[i].googleResourceName || '').trim();
    if (rn) {
      resourceMap[rn] = sheetContacts[i];
    }
  }

  var updatedCount = 0;
  var newCount = 0;

  for (var g = 0; g < googleContacts.length; g++) {
    var gc = googleContacts[g];
    if (resourceMap[gc.resourceName]) {
      // Update existing row
      var updates = {
        googleEtag: gc.etag
      };
      if (gc.displayName) updates.fullName = gc.displayName;
      if (gc.email) updates.emailPrimary = gc.email;
      if (gc.phone) {
        var normalizedPhone = normalizePhoneNumber(gc.phone);
        if (normalizedPhone) updates.phonePrimary = normalizedPhone;
      }

      updateRowByKey(contactsSheet, 'googleResourceName', gc.resourceName, updates);
      updatedCount++;
    } else {
      newCount++;
    }
  }

  logAction('system', 'refresh', 'success',
    'Refreshed from Google Contacts: ' + updatedCount + ' updated, ' + newCount + ' new (not imported)',
    '');

  return JSON.stringify({
    success: true,
    total: googleContacts.length,
    updated: updatedCount,
    new: newCount
  });
}
