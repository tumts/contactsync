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
    .addItem('Initialize Workspace', 'initializeWorkspace')
    .addItem('Scan DataSiswa', 'scanDataSiswa')
    .addItem('Validate Contacts', 'validateContacts')
    .addItem('Preview Sync', 'previewSync')
    .addItem('Run Sync', 'runSync')
    .addItem('Refresh from Google Contacts', 'refreshFromContacts')
    .addItem('Find Duplicates', 'findDuplicates')
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
 * Open the Dashboard in a sidebar.
 */
function openDashboard() {
  var html = HtmlService.createTemplateFromFile('Dashboard')
    .evaluate()
    .setTitle('ContactSync Dashboard')
    .setWidth(800);
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
  }

  return {
    totalStudents: sourceData.length,
    totalContacts: contacts.length,
    synced: synced,
    pending: pending,
    errors: errors,
    lastSync: lastSync || 'Never'
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
