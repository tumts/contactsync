/**
 * Code.gs — Entry point and custom menu for ContactSync.
 */

/**
 * Create custom menu when spreadsheet opens.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('ContactSync')
    .addItem('Open Dashboard', 'openDashboard')
    .addItem('Open Sidebar', 'openSidebarShortcut')
    .addSeparator()
    .addItem('Initialize Workspace', 'initializeWorkspace')
    .addItem('Scan DataSiswa', 'scanDataSiswa')
    .addItem('Validate Contacts', 'validateContacts')
    .addItem('Preview Sync', 'previewSync')
    .addItem('Run Sync', 'runSync')
    .addItem('Refresh from Google Contacts', 'refreshFromContacts')
    .addItem('Find Duplicates', 'findDuplicates')
    .addItem('Migrate Schema', 'migrateToNewSchema')
    .addToUi();
}

/**
 * Serve the Dashboard as a web app.
 * @param {Object} e Event object.
 * @return {HtmlOutput} Dashboard page.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('ContactSync Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include an HTML file's content (for CSS/JS partials).
 * @param {string} filename File name without extension.
 * @return {string} File content as HTML string.
 */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

/**
 * Open the Dashboard as a modeless dialog (popup).
 */
function openDashboard() {
  var html = HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('ContactSync Dashboard')
    .setWidth(900)
    .setHeight(600);
  SpreadsheetApp.getUi().showModelessDialog(html, 'ContactSync Dashboard');
}

/**
 * Open the Sidebar shortcut panel.
 */
function openSidebarShortcut() {
  var html = HtmlService.createTemplateFromFile('Sidebar')
    .evaluate()
    .setTitle('ContactSync');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Get overview data for the dashboard.
 * @return {Object} Overview summary.
 */
function getOverviewData() {
  var config = loadConfig();
  var contactsSheet = config.CONTACTS_SHEET || 'Contacts';
  var sourceSheet = config.SOURCE_SHEET || 'DataSiswa';

  var contacts = readSheetAsObjects(contactsSheet);
  var sourceData = [];
  try {
    sourceData = readSourceSheetAsObjects(sourceSheet);
  } catch (e) {
    // Source spreadsheet not configured yet or inaccessible
  }

  var synced = 0;
  var pending = 0;
  var errors = 0;
  var lastSync = '';

  var classMap = {};

  for (var i = 0; i < contacts.length; i++) {
    var status = String(contacts[i].syncStatus || '').trim();
    if (status === 'synced') {
      synced++;
      var ts = String(contacts[i].lastSyncedAt || '');
      if (ts > lastSync) lastSync = ts;
    } else if (status === 'error') {
      errors++;
    } else {
      pending++;
    }

    var cl = String(contacts[i].classLabel || '').trim() || '(no class)';
    if (!classMap[cl]) {
      classMap[cl] = { classLabel: cl, total: 0, synced: 0, pending: 0, errors: 0 };
    }
    classMap[cl].total++;
    if (status === 'synced') classMap[cl].synced++;
    else if (status === 'error') classMap[cl].errors++;
    else classMap[cl].pending++;
  }

  var classBreakdown = [];
  var classKeys = Object.keys(classMap).sort();
  for (var k = 0; k < classKeys.length; k++) {
    classBreakdown.push(classMap[classKeys[k]]);
  }

  return {
    totalStudents: sourceData.length,
    totalContacts: contacts.length,
    synced: synced,
    pending: pending,
    errors: errors,
    lastSync: lastSync || 'Never',
    classBreakdown: classBreakdown
  };
}

/**
 * Get contacts list for the dashboard table.
 * @return {Array<Object>} Contacts data.
 */
function getContactsList() {
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  return contacts;
}

/**
 * Get sync progress from PropertiesService.
 * @return {Object} Progress info for preview and run sync.
 */
function getSyncProgress() {
  var props = PropertiesService.getScriptProperties();
  var previewRaw = props.getProperty('previewSync_progress');
  var runRaw = props.getProperty('runSync_progress');

  var previewProgress = null;
  var runProgress = null;

  if (previewRaw) {
    try { previewProgress = JSON.parse(previewRaw); } catch (e) {}
  }
  if (runRaw) {
    try { runProgress = JSON.parse(runRaw); } catch (e) {}
  }

  return {
    preview: previewProgress,
    run: runProgress
  };
}

/**
 * Get full invalid contacts data (row data + errors per row).
 * @return {string} JSON with invalid contacts and their errors.
 */
function getInvalidContacts() {
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var results = [];

  for (var i = 0; i < contacts.length; i++) {
    var result = validateRow(contacts[i]);
    if (!result.valid) {
      results.push({
        row: i + 2,
        fullName: contacts[i].fullName || '(empty)',
        phonePrimary: contacts[i].phonePrimary || '',
        emailPrimary: contacts[i].emailPrimary || '',
        classLabel: contacts[i].classLabel || '',
        yearLabel: contacts[i].yearLabel || '',
        studentStatus: contacts[i].studentStatus || '',
        errors: result.errors
      });
    }
  }

  return JSON.stringify({ total: contacts.length, invalid: results.length, data: results });
}

/**
 * Export invalid contacts as CSV for SiswaHub (reverse-mapped columns).
 * @return {string} CSV string.
 */
function exportInvalidAsCSV() {
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var csvHeaders = ['nama', 'kelas', 'rombel', 'wa_siswa', 'email_siswa', 'errors'];
  var lines = [csvHeaders.join(',')];

  for (var i = 0; i < contacts.length; i++) {
    var result = validateRow(contacts[i]);
    if (!result.valid) {
      var c = contacts[i];
      var classLabel = String(c.classLabel || '');
      var kelas = '';
      var rombel = '';
      if (classLabel.length >= 2) {
        kelas = classLabel.substring(0, classLabel.length - 1);
        rombel = classLabel.substring(classLabel.length - 1);
      } else {
        kelas = classLabel;
      }

      var phone = String(c.phonePrimary || '');
      if (phone.indexOf('62') === 0) {
        phone = '0' + phone.substring(2);
      }

      var row = [
        csvQuote(c.fullName || ''),
        csvQuote(kelas),
        csvQuote(rombel),
        csvQuote(phone),
        csvQuote(c.emailPrimary || ''),
        csvQuote(result.errors.join('; '))
      ];
      lines.push(row.join(','));
    }
  }

  return lines.join('\n');
}

/**
 * Quote a CSV field value.
 * @param {string} val Value to quote.
 * @return {string} Quoted value.
 */
function csvQuote(val) {
  var s = String(val || '');
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Migrate existing contacts to the new schema (Fase 4).
 * Adds studentStatus, builds labels, clears old namingPattern, resets syncStatus.
 * @return {string} JSON result summary.
 */
function migrateToNewSchema() {
  var config = loadConfig();
  var contactsSheetName = config.CONTACTS_SHEET || 'Contacts';
  var contacts = readSheetAsObjects(contactsSheetName);

  if (!contacts || contacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts to migrate' });
  }

  var migrated = 0;
  for (var i = 0; i < contacts.length; i++) {
    var c = contacts[i];

    if (!c.studentStatus) {
      c.studentStatus = 'aktif';
    }

    c.labels = buildLabels(c.classLabel, c.yearLabel, c.studentStatus);

    c.namingPattern = '';

    c.syncStatus = 'pending';

    if (!c.middleName) c.middleName = '';
    if (!c.namePrefix) c.namePrefix = '';
    if (!c.nameSuffix) c.nameSuffix = '';
    if (!c.nickname) c.nickname = '';
    if (!c.fileAs) c.fileAs = '';
    if (!c.birthday) c.birthday = '';
    if (!c.phoneLabel) c.phoneLabel = '';

    migrated++;
  }

  writeObjectsToSheet(contactsSheetName, contacts, CONTACTS_HEADERS);

  logAction('system', 'migrate', 'success',
    'Schema migration complete: ' + migrated + ' contacts migrated',
    JSON.stringify({ migrated: migrated }));

  return JSON.stringify({
    success: true,
    message: 'Migration complete: ' + migrated + ' contacts updated to new schema',
    migrated: migrated
  });
}
