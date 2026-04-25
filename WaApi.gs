/**
 * WaApi.gs — WhatsApp API integration via go-whatsapp-web-multidevice.
 * API reference: https://github.com/aldinokemal/go-whatsapp-web-multidevice
 */

var WA_BATCH_SIZE = 30;
var WA_BATCH_PAUSE_MS = 2000;
var WA_TIMEOUT_MS = 270000; // 4.5 minutes

/**
 * Build UrlFetchApp options for WA API calls.
 * @param {string} method HTTP method.
 * @param {Object|null} body Request body.
 * @return {Object} UrlFetchApp options.
 */
function buildFetchOptions(method, body) {
  var config = loadConfig();
  var options = {
    method: method,
    contentType: 'application/json',
    muteHttpExceptions: true
  };

  if (body) {
    options.payload = JSON.stringify(body);
  }

  var headers = {};
  var authUser = config.WA_API_BASIC_AUTH_USER || '';
  var authPass = config.WA_API_BASIC_AUTH_PASS || '';
  if (authUser) {
    headers['Authorization'] = 'Basic ' + Utilities.base64Encode(authUser + ':' + authPass);
  }

  var timeout = Number(config.WA_API_TIMEOUT_MS || 10000);
  options.headers = headers;

  return options;
}

/**
 * Test connection to the WA API server.
 * @return {string} JSON result.
 */
function testWaConnection() {
  var config = loadConfig();
  var baseUrl = config.WA_API_BASE_URL || 'http://localhost:3000';

  try {
    var options = buildFetchOptions('get', null);
    var response = UrlFetchApp.fetch(baseUrl + '/app/devices', options);
    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 200 && body.code === 200) {
      return JSON.stringify({
        success: true,
        message: 'Connected to WA API',
        devices: body.results || null
      });
    } else {
      return JSON.stringify({
        success: false,
        message: 'WA API returned code ' + code + ': ' + (body.message || ''),
        devices: null
      });
    }
  } catch (e) {
    return JSON.stringify({
      success: false,
      message: 'Connection failed: ' + e.toString(),
      devices: null
    });
  }
}

/**
 * Check if a single phone number is registered on WhatsApp.
 * @param {string} phone Raw phone number.
 * @return {Object} Status result.
 */
function checkWhatsAppNumber(phone) {
  var config = loadConfig();

  if (config.WA_API_ENABLED !== 'true') {
    return { status: 'unchecked', message: 'WA API disabled' };
  }

  var normalized = normalizePhoneNumber(phone);
  if (!normalized) {
    return { status: 'invalid', message: 'Invalid phone format' };
  }

  var baseUrl = config.WA_API_BASE_URL || 'http://localhost:3000';

  try {
    var options = buildFetchOptions('post', { phone: normalized });
    var response = UrlFetchApp.fetch(baseUrl + '/user/check', options);
    var body = JSON.parse(response.getContentText());

    if (body.results && body.results.is_registered === true) {
      return { status: 'active', jid: body.results.jid || '' };
    } else if (body.results && body.results.is_registered === false) {
      return { status: 'inactive' };
    } else {
      return { status: 'error', message: 'Unexpected response: ' + response.getContentText() };
    }
  } catch (e) {
    logAction('', 'waCheck', 'error', 'WA check failed for ' + normalized, e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Batch check an array of phone numbers.
 * @param {Array<Object>} phoneList Array of { rowId, phone }.
 * @return {string} JSON result.
 */
function batchCheckNumbers(phoneList) {
  var config = loadConfig();
  var batchDelay = Number(config.WA_API_BATCH_DELAY_MS || 1500);
  var startTime = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var startIndex = 0;

  var savedProgress = props.getProperty('batchCheck_progress');
  if (savedProgress) {
    try {
      var progress = JSON.parse(savedProgress);
      startIndex = progress.lastIndex || 0;
    } catch (e) {
      startIndex = 0;
    }
  }

  var results = [];
  var summary = { active: 0, inactive: 0, invalid: 0, error: 0 };

  for (var i = startIndex; i < phoneList.length; i++) {
    // Timeout guard
    if (i > startIndex && (i - startIndex) % 10 === 0) {
      var elapsed = new Date().getTime() - startTime;
      if (elapsed > WA_TIMEOUT_MS) {
        props.setProperty('batchCheck_progress', JSON.stringify({
          lastIndex: i,
          summary: summary
        }));
        return JSON.stringify({
          complete: false,
          checked: i,
          total: phoneList.length,
          results: results,
          summary: summary
        });
      }
    }

    // Batch pause
    if (i > startIndex && (i - startIndex) % WA_BATCH_SIZE === 0) {
      Utilities.sleep(WA_BATCH_PAUSE_MS);
    }

    var item = phoneList[i];
    var checkResult = checkWhatsAppNumber(item.phone);
    results.push({
      rowId: item.rowId,
      phone: item.phone,
      status: checkResult.status,
      jid: checkResult.jid || '',
      message: checkResult.message || ''
    });

    if (checkResult.status === 'active') summary.active++;
    else if (checkResult.status === 'inactive') summary.inactive++;
    else if (checkResult.status === 'invalid') summary.invalid++;
    else summary.error++;

    // Delay between individual checks
    if (i < phoneList.length - 1) {
      Utilities.sleep(batchDelay);
    }
  }

  props.deleteProperty('batchCheck_progress');

  return JSON.stringify({
    complete: true,
    checked: phoneList.length,
    total: phoneList.length,
    results: results,
    summary: summary
  });
}

/**
 * Resume a previously timed-out batch check.
 * @return {string} JSON result.
 */
function resumeBatchCheck() {
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var phoneList = [];

  var seen = {};
  for (var i = 0; i < contacts.length; i++) {
    var phones = [
      { field: 'phonePrimary', value: contacts[i].phonePrimary },
      { field: 'phoneSecondary', value: contacts[i].phoneSecondary },
      { field: 'parentPhone', value: contacts[i].parentPhone }
    ];
    for (var p = 0; p < phones.length; p++) {
      var num = String(phones[p].value || '').trim();
      if (num && !seen[num]) {
        seen[num] = true;
        phoneList.push({ rowId: contacts[i].id, phone: num });
      }
    }
  }

  return batchCheckNumbers(phoneList);
}

/**
 * Check all contact phone numbers against WhatsApp.
 * @return {string} JSON result.
 */
function checkAllContactNumbers() {
  var config = loadConfig();

  if (config.WA_API_ENABLED !== 'true') {
    return JSON.stringify({
      success: false,
      message: 'WA API is disabled. Enable it in Config first.'
    });
  }

  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var phoneList = [];
  var seen = {};

  for (var i = 0; i < contacts.length; i++) {
    var phones = [
      { field: 'phonePrimary', value: contacts[i].phonePrimary },
      { field: 'phoneSecondary', value: contacts[i].phoneSecondary },
      { field: 'parentPhone', value: contacts[i].parentPhone }
    ];
    for (var p = 0; p < phones.length; p++) {
      var num = String(phones[p].value || '').trim();
      if (num && !seen[num]) {
        seen[num] = true;
        phoneList.push({ rowId: contacts[i].id, phone: num });
      }
    }
  }

  if (phoneList.length === 0) {
    return JSON.stringify({ success: true, message: 'No phone numbers to check', summary: {} });
  }

  var result = JSON.parse(batchCheckNumbers(phoneList));

  // Update Contacts sheet with WA status
  if (result.results) {
    var contactsSheet = config.CONTACTS_SHEET || 'Contacts';
    var now = formatTimestamp(new Date());
    var phoneStatusMap = {};
    for (var r = 0; r < result.results.length; r++) {
      phoneStatusMap[result.results[r].phone] = result.results[r].status;
    }

    for (var c = 0; c < contacts.length; c++) {
      var primary = String(contacts[c].phonePrimary || '').trim();
      if (primary && phoneStatusMap[primary]) {
        updateRowByKey(contactsSheet, 'id', contacts[c].id, {
          waPhoneStatus: phoneStatusMap[primary],
          waPhoneCheckedAt: now
        });
      }
    }
  }

  logAction('system', 'waCheckAll', result.complete ? 'success' : 'partial',
    'WA check: ' + (result.summary.active || 0) + ' active, ' + (result.summary.inactive || 0) + ' inactive',
    JSON.stringify(result.summary));

  return JSON.stringify({
    success: true,
    complete: result.complete,
    total: phoneList.length,
    checked: result.checked,
    summary: result.summary
  });
}
