/**
 * Config.gs — Configuration loader and manager for ContactSync.
 * Reads/writes key-value pairs from a "Config" sheet.
 */

var CONFIG_DEFAULTS = {
  SOURCE_SPREADSHEET_ID: '1NPGuKFP35_7oT5c6bhkvqo2AWix-Ym3o0RtJBoUHvM4',
  SOURCE_SHEET: 'DataSiswa',
  CONTACTS_SHEET: 'Contacts',
  SYNCLOG_SHEET: 'SyncLog',
  DUPLICATES_SHEET: 'Duplicates',
  CONFIG_SHEET: 'Config',
  DEFAULT_CLASS_LABEL: '',
  DEFAULT_YEAR_LABEL: '2026',
  DEFAULT_ORGANIZATION: 'MTs Al Amin',
  DEFAULT_GROUP_NAME: 'Siswa MTs Al Amin',
  NAMING_PRESET: '1',
  PARENT_CONTACT_MODE: 'consolidated',
  DRY_RUN_DEFAULT: 'true',
  DEBUG_MODE: 'false',
  WA_API_ENABLED: 'false',
  WA_API_BASE_URL: '',
  WA_API_TIMEOUT_MS: '10000',
  WA_API_BASIC_AUTH_USER: '',
  WA_API_BASIC_AUTH_PASS: '',
  WA_API_BATCH_DELAY_MS: '1500'
};

/**
 * Load all config from the Config sheet. Creates sheet with defaults if missing.
 * @return {Object} Config key-value object.
 */
function loadConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Config';
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['key', 'value']);
    var keys = Object.keys(CONFIG_DEFAULTS);
    for (var i = 0; i < keys.length; i++) {
      sheet.appendRow([keys[i], CONFIG_DEFAULTS[keys[i]]]);
    }
    SpreadsheetApp.flush();
  }

  var data = sheet.getDataRange().getValues();
  var config = {};
  for (var r = 1; r < data.length; r++) {
    var key = String(data[r][0]).trim();
    if (key) {
      config[key] = String(data[r][1]);
    }
  }

  var keys = Object.keys(CONFIG_DEFAULTS);
  for (var i = 0; i < keys.length; i++) {
    if (!(keys[i] in config)) {
      config[keys[i]] = CONFIG_DEFAULTS[keys[i]];
      sheet.appendRow([keys[i], CONFIG_DEFAULTS[keys[i]]]);
    }
  }

  return config;
}

/**
 * Save a full config object back to the Config sheet.
 * @param {Object} configObj Key-value pairs to write.
 */
function saveConfig(configObj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Config';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.clearContents();
  sheet.appendRow(['key', 'value']);

  var keys = Object.keys(configObj);
  for (var i = 0; i < keys.length; i++) {
    sheet.appendRow([keys[i], configObj[keys[i]]]);
  }

  SpreadsheetApp.flush();
  return JSON.stringify({ success: true, saved: keys.length });
}

/**
 * Get a single config value by key.
 * @param {string} key Config key.
 * @return {string} Value or empty string.
 */
function getConfigValue(key) {
  var config = loadConfig();
  return config[key] !== undefined ? config[key] : '';
}

/**
 * Set a single config value.
 * @param {string} key Config key.
 * @param {string} value Config value.
 */
function setConfigValue(key, value) {
  var config = loadConfig();
  config[key] = String(value);
  saveConfig(config);
}
