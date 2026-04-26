/**
 * SyncService.gs — Orchestrator for contact synchronization.
 */

var SYNC_BATCH_SIZE = 50;
var SYNC_BATCH_PAUSE_MS = 3000;
var SYNC_API_DELAY_MS = 1000;
var SYNC_TIMEOUT_MS = 270000; // 4.5 minutes (guard before 5-min limit)
var SYNC_CHECKPOINT_INTERVAL = 10;

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
          jobTitle: '',
          classLabel: '',
          yearLabel: yearLabel,
          address: '',
          notes: 'Ayah dari ' + mapped.fullName,
          parentName: '',
          parentPhone: '',
          parentEmail: '',
          parentRole: 'Ayah',
          relationshipLabel: 'father',
          groupName: groupName,
          googleResourceName: '',
          googleEtag: '',
          syncStatus: 'pending',
          lastSyncedAt: '',
          lastError: '',
          sourceUpdatedAt: '',
          waPhoneStatus: '',
          waPhoneCheckedAt: '',
          namingPattern: fatherName,
          syncPreviewAction: '',
          dedupeKey: generateDedupeKey(fatherName, normalizePhoneNumber(row['wa_ayah']), cleanEmail(row['email_ayah']))
        };
        contacts.push(fatherContact);
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
          jobTitle: '',
          classLabel: '',
          yearLabel: yearLabel,
          address: '',
          notes: 'Ibu dari ' + mapped.fullName,
          parentName: '',
          parentPhone: '',
          parentEmail: '',
          parentRole: 'Ibu',
          relationshipLabel: 'mother',
          groupName: groupName,
          googleResourceName: '',
          googleEtag: '',
          syncStatus: 'pending',
          lastSyncedAt: '',
          lastError: '',
          sourceUpdatedAt: '',
          waPhoneStatus: '',
          waPhoneCheckedAt: '',
          namingPattern: motherName,
          syncPreviewAction: '',
          dedupeKey: generateDedupeKey(motherName, normalizePhoneNumber(row['wa_ibu']), cleanEmail(row['email_ibu']))
        };
        contacts.push(motherContact);
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
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');

  if (!contacts || contacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts found. Run Scan DataSiswa first.' });
  }

  var startTime = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
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
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');

  if (!contacts || contacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts found. Run Scan DataSiswa first.' });
  }

  var startTime = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
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
        logAction(c.id, 'create', 'success', 'Created contact: ' + c.fullName, result.resourceName);
      } else {
        updateRowByKey(contactsSheet, 'id', c.id, {
          syncStatus: 'error',
          lastError: result.error || 'Unknown error'
        });
        errorCount++;
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
        logAction(c.id, 'update', 'success', 'Updated contact: ' + c.fullName,
          result.retried ? 'Retried with fresh etag' : '');
      } else {
        updateRowByKey(contactsSheet, 'id', c.id, {
          syncStatus: 'error',
          lastError: result.error || 'Unknown error'
        });
        errorCount++;
        logAction(c.id, 'update', 'error', 'Failed to update: ' + c.fullName, result.error);
      }
    }

    // Rate limiting
    Utilities.sleep(SYNC_API_DELAY_MS);
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
