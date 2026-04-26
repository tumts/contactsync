/**
 * Sheets.gs — Helper functions for sheet operations.
 */

var CONTACTS_HEADERS = [
  'id', 'fullName', 'givenName', 'familyName', 'middleName', 'namePrefix', 'nameSuffix',
  'nickname', 'fileAs', 'emailPrimary', 'emailSecondary',
  'phonePrimary', 'phoneSecondary', 'phoneLabel', 'organization', 'jobTitle', 'classLabel',
  'yearLabel', 'studentStatus', 'address', 'notes', 'birthday', 'parentName', 'parentPhone',
  'parentEmail', 'parentRole', 'relationshipLabel', 'groupName', 'labels',
  'googleResourceName', 'googleEtag', 'syncStatus', 'lastSyncedAt', 'lastError',
  'sourceUpdatedAt', 'waPhoneStatus', 'waPhoneCheckedAt', 'namingPattern',
  'syncPreviewAction', 'dedupeKey'
];

var SYNCLOG_HEADERS = [
  'timestamp', 'rowId', 'action', 'result', 'message', 'details'
];

var DUPLICATES_HEADERS = [
  'id', 'name1', 'name2', 'phone1', 'phone2', 'email1', 'email2',
  'score', 'status', 'resolvedAt'
];

/**
 * Get or create a sheet with given name and headers.
 * @param {string} name Sheet name.
 * @param {Array<string>} headers Header row.
 * @return {GoogleAppsScript.Spreadsheet.Sheet} The sheet.
 */
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }

  return sheet;
}

/**
 * Read a sheet and return an array of objects keyed by header names.
 * @param {string} sheetName Sheet name.
 * @return {Array<Object>} Array of row objects.
 */
function readSheetAsObjects(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = [];
  for (var c = 0; c < data[0].length; c++) {
    headers.push(String(data[0][c]).trim());
  }

  var objects = [];
  for (var r = 1; r < data.length; r++) {
    var obj = {};
    var hasData = false;
    for (var c = 0; c < headers.length; c++) {
      var val = data[r][c] !== undefined ? data[r][c] : '';
      obj[headers[c]] = val;
      if (String(val).trim() !== '') hasData = true;
    }
    if (hasData) {
      obj._rowIndex = r + 1;
      objects.push(obj);
    }
  }

  return objects;
}

/**
 * Read source data from an external spreadsheet (SiswaHub).
 * Uses openById() to access the source spreadsheet configured in Config.
 * @param {string} sheetName Sheet name to read from the source spreadsheet.
 * @return {Array<Object>} Array of row objects.
 */
function readSourceSheetAsObjects(sheetName) {
  var config = loadConfig();
  var sourceId = config.SOURCE_SPREADSHEET_ID || '';

  if (!sourceId) {
    throw new Error('SOURCE_SPREADSHEET_ID is not configured. Set it in the Config sheet.');
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(sourceId);
  } catch (e) {
    throw new Error('Cannot open source spreadsheet. Check SOURCE_SPREADSHEET_ID and sharing permissions. Error: ' + e.toString());
  }

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = [];
  for (var c = 0; c < data[0].length; c++) {
    headers.push(String(data[0][c]).trim());
  }

  var objects = [];
  for (var r = 1; r < data.length; r++) {
    var obj = {};
    var hasData = false;
    for (var c = 0; c < headers.length; c++) {
      var val = data[r][c] !== undefined ? data[r][c] : '';
      obj[headers[c]] = val;
      if (String(val).trim() !== '') hasData = true;
    }
    if (hasData) {
      obj._rowIndex = r + 1;
      objects.push(obj);
    }
  }

  return objects;
}

/**
 * Write an array of objects to a sheet.
 * @param {string} sheetName Sheet name.
 * @param {Array<Object>} objects Data rows.
 * @param {Array<string>} headers Column headers to write.
 */
function writeObjectsToSheet(sheetName, objects, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clearContents();

  if (!headers || headers.length === 0) {
    if (objects.length > 0) {
      headers = Object.keys(objects[0]).filter(function(k) { return k !== '_rowIndex'; });
    } else {
      return;
    }
  }

  var rows = [headers];
  for (var i = 0; i < objects.length; i++) {
    var row = [];
    for (var h = 0; h < headers.length; h++) {
      var val = objects[i][headers[h]];
      row.push(val !== undefined && val !== null ? val : '');
    }
    rows.push(row);
  }

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  SpreadsheetApp.flush();
}

/**
 * Update a single row by matching a key column value.
 * @param {string} sheetName Sheet name.
 * @param {string} keyColumn Header name of the key column.
 * @param {*} keyValue Value to match.
 * @param {Object} updateObj Fields to update.
 * @return {boolean} True if a row was found and updated.
 */
function updateRowByKey(sheetName, keyColumn, keyValue, updateObj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return false;

  var headers = [];
  for (var c = 0; c < data[0].length; c++) {
    headers.push(String(data[0][c]).trim());
  }

  var keyCol = headers.indexOf(keyColumn);
  if (keyCol === -1) return false;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][keyCol]) === String(keyValue)) {
      var updateKeys = Object.keys(updateObj);
      for (var i = 0; i < updateKeys.length; i++) {
        var col = headers.indexOf(updateKeys[i]);
        if (col !== -1) {
          sheet.getRange(r + 1, col + 1).setValue(updateObj[updateKeys[i]]);
        }
      }
      SpreadsheetApp.flush();
      return true;
    }
  }

  return false;
}

/**
 * Initialize all workspace sheets with correct headers.
 * @return {string} JSON result summary.
 */
function initializeWorkspace() {
  var config = loadConfig();

  var sheets = [
    { name: config.CONTACTS_SHEET || 'Contacts', headers: CONTACTS_HEADERS },
    { name: config.SYNCLOG_SHEET || 'SyncLog', headers: SYNCLOG_HEADERS },
    { name: config.DUPLICATES_SHEET || 'Duplicates', headers: DUPLICATES_HEADERS }
  ];

  var created = [];
  for (var i = 0; i < sheets.length; i++) {
    getOrCreateSheet(sheets[i].name, sheets[i].headers);
    created.push(sheets[i].name);
  }

  loadConfig();

  logAction('system', 'initialize', 'success', 'Workspace initialized', 'Sheets: ' + created.join(', '));

  return JSON.stringify({
    success: true,
    message: 'Workspace initialized successfully',
    sheets: created
  });
}
