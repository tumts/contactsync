/**
 * Logger.gs — Structured logging to SyncLog sheet.
 */

/**
 * Log a single action to the SyncLog sheet.
 * @param {string} rowId Identifier for the row/contact.
 * @param {string} action Action performed (scan, validate, sync, etc.).
 * @param {string} result Result status (success, error, skip, etc.).
 * @param {string} message Human-readable message.
 * @param {string} details Additional details (JSON string or text).
 */
function logAction(rowId, action, result, message, details) {
  var config = loadConfig();
  var sheetName = config.SYNCLOG_SHEET || 'SyncLog';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['timestamp', 'rowId', 'action', 'result', 'message', 'details']);
  }

  sheet.appendRow([
    formatTimestamp(new Date()),
    rowId || '',
    action || '',
    result || '',
    message || '',
    details || ''
  ]);
}

/**
 * Get the N most recent log entries.
 * @param {number} limit Number of entries to retrieve (default 50).
 * @return {Array<Object>} Array of log objects.
 */
function getRecentLogs(limit) {
  if (!limit) limit = 50;
  var config = loadConfig();
  var sheetName = config.SYNCLOG_SHEET || 'SyncLog';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var logs = [];
  var startRow = Math.max(1, data.length - limit);

  for (var r = data.length - 1; r >= startRow; r--) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = data[r][c];
    }
    logs.push(obj);
  }

  return logs;
}

/**
 * Clear all log entries (keeps header row).
 */
function clearLogs() {
  var config = loadConfig();
  var sheetName = config.SYNCLOG_SHEET || 'SyncLog';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) return;

  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
}

/**
 * Get a summary of log actions and results.
 * @return {Object} Summary with counts per action and result.
 */
function getSyncSummary() {
  var config = loadConfig();
  var sheetName = config.SYNCLOG_SHEET || 'SyncLog';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  var summary = { total: 0, byAction: {}, byResult: {} };

  if (!sheet) return summary;

  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    summary.total++;
    var action = String(data[r][2]);
    var result = String(data[r][3]);

    if (!summary.byAction[action]) summary.byAction[action] = 0;
    summary.byAction[action]++;

    if (!summary.byResult[result]) summary.byResult[result] = 0;
    summary.byResult[result]++;
  }

  return summary;
}
