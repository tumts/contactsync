/**
 * WaApi.gs — WhatsApp API integration via go-whatsapp-web-multidevice.
 * API reference: https://github.com/aldinokemal/go-whatsapp-web-multidevice
 */

var WA_TIMEOUT_MS = 270000; // 4.5 minutes

/**
 * Build UrlFetchApp options for WA API calls.
 * @param {string} method HTTP method.
 * @param {Object|null} payload Request payload (ignored for GET).
 * @return {Object} UrlFetchApp options.
 */
function buildFetchOptions(method, payload) {
  var config = loadConfig();
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json'
    }
  };

  // Only add payload for non-GET methods
  if (payload && method.toLowerCase() !== 'get') {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var user = config.WA_API_BASIC_AUTH_USER || '';
  var pass = config.WA_API_BASIC_AUTH_PASS || '';
  if (user && pass) {
    options.headers['Authorization'] = 'Basic ' + Utilities.base64Encode(user + ':' + pass);
  }

  var deviceId = config.WA_API_DEVICE_ID || '';
  if (deviceId) {
    options.headers['X-Device-Id'] = deviceId;
  }

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

    // Try GET /app/status first (Connection Status)
    try {
      var response = UrlFetchApp.fetch(baseUrl + '/app/status', options);
      var code = response.getResponseCode();
      var body = JSON.parse(response.getContentText());

      if (code === 200) {
        return JSON.stringify({
          success: true,
          message: 'Connected to WA API',
          devices: body.results || body
        });
      }
    } catch (e1) {
      // /app/status failed, try fallback
    }

    // Fallback: GET /devices
    var response2 = UrlFetchApp.fetch(baseUrl + '/devices', options);
    var code2 = response2.getResponseCode();
    var body2 = JSON.parse(response2.getContentText());

    if (code2 === 200) {
      return JSON.stringify({
        success: true,
        message: 'Connected to WA API (via /devices)',
        devices: body2.results || body2
      });
    } else {
      return JSON.stringify({
        success: false,
        message: 'WA API returned code ' + code2 + ': ' + (body2.message || ''),
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
 * Test WA check with a small number of contacts.
 * Checks the first N contacts that haven't been checked yet.
 * Also fetches user info (pushName) for active numbers.
 * @param {number} count Number of contacts to test (default 2).
 * @return {string} JSON result with per-contact details.
 */
function testWaCheck(count) {
  count = count || 2;
  var config = loadConfig();

  if (config.WA_API_ENABLED !== 'true') {
    return JSON.stringify({
      success: false,
      message: 'WA API is disabled. Enable it in Config first.'
    });
  }

  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var testContacts = [];

  for (var i = 0; i < contacts.length && testContacts.length < count; i++) {
    var phone = String(contacts[i].phonePrimary || '').trim();
    if (phone) {
      testContacts.push({
        id: contacts[i].id,
        name: contacts[i].fullName || '(no name)',
        phone: phone
      });
    }
  }

  if (testContacts.length === 0) {
    return JSON.stringify({ success: false, message: 'No contacts with phone numbers found.' });
  }

  var results = [];
  for (var t = 0; t < testContacts.length; t++) {
    var item = testContacts[t];
    var checkResult = checkWhatsAppNumber(item.phone);

    var userInfo = null;
    if (checkResult.status === 'active') {
      try {
        userInfo = getWaUserInfo(item.phone);
      } catch (e) {
        // User info is optional
      }
    }

    results.push({
      id: item.id,
      name: item.name,
      phone: item.phone,
      status: checkResult.status,
      jid: checkResult.jid || '',
      message: checkResult.message || '',
      pushName: (userInfo && userInfo.pushName) || '',
      verifiedName: (userInfo && userInfo.verifiedName) || ''
    });

    // Update contacts sheet
    if (checkResult.status === 'active' || checkResult.status === 'inactive') {
      var contactsSheet = config.CONTACTS_SHEET || 'Contacts';
      var now = formatTimestamp(new Date());
      updateRowByKey(contactsSheet, 'id', item.id, {
        waPhoneStatus: checkResult.status,
        waPhoneCheckedAt: now
      });
    }

    logAction(item.phone, 'wa_check_test', checkResult.status,
      'Test WA check: ' + item.name + ' (' + item.phone + ') = ' + checkResult.status,
      JSON.stringify(checkResult));

    if (t < testContacts.length - 1) {
      Utilities.sleep(2000);
    }
  }

  return JSON.stringify({
    success: true,
    tested: results.length,
    results: results
  });
}

/**
 * Get WhatsApp user info (pushName, verified name, etc.)
 * Uses GET /user/info endpoint.
 * @param {string} phone Normalized phone number.
 * @return {Object|null} User info or null.
 */
function getWaUserInfo(phone) {
  var config = loadConfig();
  if (config.WA_API_ENABLED !== 'true') return null;

  var normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;

  var baseUrl = config.WA_API_BASE_URL || 'http://localhost:3000';

  try {
    var options = buildFetchOptions('get', null);
    var response = UrlFetchApp.fetch(baseUrl + '/user/info?phone=' + encodeURIComponent(normalized), options);
    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

if (code === 200 && body.results) {  
  var userData = (body.results.data && body.results.data[0]) ? body.results.data[0] : body.results;  
  return {  
    pushName: userData.name || userData.push_name || userData.pushName || '',  
    verifiedName: userData.verified_name || userData.verifiedName || '',  
    status: userData.status || '',  
    pictureId: userData.picture_id || '',  
    devices: userData.devices || []  
  };  
}
  } catch (e) {
    // User info is optional, don't fail
  }
  return null;
}

/**
 * Get WhatsApp user avatar URL.
 * Uses GET /user/avatar endpoint.
 * @param {string} phone Normalized phone number.
 * @return {string|null} Avatar URL or null.
 */
function getWaUserAvatar(phone) {
  var config = loadConfig();
  if (config.WA_API_ENABLED !== 'true') return null;

  var normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;

  var baseUrl = config.WA_API_BASE_URL || 'http://localhost:3000';

  try {
    var options = buildFetchOptions('get', null);
    var response = UrlFetchApp.fetch(baseUrl + '/user/avatar?phone=' + encodeURIComponent(normalized), options);
    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 200 && body.results) {
      return body.results.url || body.results.avatar || null;
    }
  } catch (e) {
    // Avatar is optional
  }
  return null;
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
    var options = buildFetchOptions('get', null);
    var response = UrlFetchApp.fetch(baseUrl + '/user/check?phone=' + encodeURIComponent(normalized), options);
    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    // Debug: log raw response for troubleshooting
    if (config.DEBUG_MODE === 'true') {
      logAction(normalized, 'wa_debug', 'info', 
        'Raw response code=' + code + ' body.code=' + body.code + ' body.message=' + body.message,
        JSON.stringify(body).substring(0, 500));
    }

    if (code === 200 && (!body.code || body.code === 200 || body.code === '200' || String(body.code).toUpperCase() === 'SUCCESS')) {
      var isRegistered = false;
      if (body.results) {
        if (typeof body.results.is_on_whatsapp !== 'undefined') {  
          isRegistered = !!body.results.is_on_whatsapp;  
        } else if (typeof body.results.is_registered !== 'undefined') {  
          isRegistered = !!body.results.is_registered;  
        } else if (typeof body.results.registered !== 'undefined') {  
          isRegistered = !!body.results.registered;  
        } else if (body.results.jid) {  
          isRegistered = true;  
        } else if (typeof body.results === 'boolean') {  
          isRegistered = body.results;  
        }
      }
      return {
        status: isRegistered ? 'active' : 'inactive',
        message: body.message || (isRegistered ? 'Registered' : 'Not registered'),
        jid: (body.results && body.results.jid) ? body.results.jid : null
      };
    } else {
      return { status: 'error', message: 'API returned code ' + code + ' (body.code=' + body.code + '): ' + (body.message || response.getContentText()) };
    }
  } catch (e) {
    logAction('', 'waCheck', 'error', 'WA check failed for ' + normalized, e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Generate random delay with jitter for anti-detection.
 * @return {number} Delay in milliseconds.
 */
function getRandomDelay() {
  var config = loadConfig();
  var baseDelay = parseInt(config.WA_API_BATCH_DELAY_MS) || 5000;
  var jitter = parseInt(config.WA_API_JITTER_MS) || 3000;
  return baseDelay + Math.floor(Math.random() * jitter);
}

/**
 * Check how many WA checks have been done today.
 * @return {number} Count of checks today.
 */
function getTodayCheckCount() {
  var config = loadConfig();
  var logSheet = config.SYNCLOG_SHEET || 'SyncLog';
  var logs = readSheetAsObjects(logSheet);
  var today = formatTimestamp(new Date()).split(' ')[0];
  var count = 0;
  for (var i = 0; i < logs.length; i++) {
    if (String(logs[i].action || '') === 'wa_check' &&
        String(logs[i].timestamp || '').indexOf(today) === 0) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a number was already checked within recheck period.
 * @param {string} phone Normalized phone number.
 * @return {boolean} True if recently checked.
 */
function wasRecentlyChecked(phone) {
  var config = loadConfig();
  var recheckDays = parseInt(config.WA_API_RECHECK_DAYS) || 7;
  var logSheet = config.SYNCLOG_SHEET || 'SyncLog';
  var logs = readSheetAsObjects(logSheet);
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - recheckDays);

  for (var i = logs.length - 1; i >= 0; i--) {
    if (String(logs[i].action || '') === 'wa_check' &&
        String(logs[i].rowId || '') === phone) {
      var logDate = new Date(logs[i].timestamp);
      if (logDate >= cutoff) return true;
    }
  }
  return false;
}

/**
 * Batch check an array of phone numbers.
 * @param {Array<Object>} phoneList Array of { rowId, phone }.
 * @return {string} JSON result.
 */
function batchCheckNumbers(phoneList) {
  var config = loadConfig();
  var batchSize = parseInt(config.WA_API_BATCH_SIZE) || 10;
  var batchPause = parseInt(config.WA_API_BATCH_PAUSE_MS) || 60000;
  var startTime = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('SYNC_CANCEL');
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
  var consecutiveErrors = 0;
  var aborted = false;

  for (var i = startIndex; i < phoneList.length; i++) {
    // GAS 4.5-minute timeout guard
    var elapsed = new Date().getTime() - startTime;
    if (elapsed > WA_TIMEOUT_MS) {
      props.setProperty('batchCheck_progress', JSON.stringify({
        lastIndex: i,
        summary: summary
      }));
      return JSON.stringify({
        complete: false,
        checked: results.length,
        total: phoneList.length,
        results: results,
        summary: summary
      });
    }

    var cancelFlag = props.getProperty('SYNC_CANCEL');
    if (cancelFlag === 'true') {
      props.deleteProperty('SYNC_CANCEL');
      props.deleteProperty('batchCheck_progress');
      logAction('system', 'wa_check', 'warning', 'WA check cancelled by user at index ' + i, '');
      return JSON.stringify({
        complete: false,
        cancelled: true,
        checked: i,
        total: phoneList.length,
        results: results,
        summary: summary
      });
    }

    // Batch pause every batchSize checks
    if (i > startIndex && (i - startIndex) % batchSize === 0) {
      Utilities.sleep(batchPause);
    }

    // Random delay between each check with exponential backoff on errors
    var delay = getRandomDelay();
    if (consecutiveErrors > 0) {
      delay = delay * Math.pow(2, Math.min(consecutiveErrors, 5));
    }
    if (i > startIndex) {
      Utilities.sleep(delay);
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

    if (checkResult.status === 'error') {
      consecutiveErrors++;
      summary.error++;
      if (consecutiveErrors >= 5) {
        logAction(item.phone, 'wa_check', 'abort', 'Too many consecutive errors');
        aborted = true;
        break;
      }
    } else {
      consecutiveErrors = 0;
      if (checkResult.status === 'active') summary.active++;
      else if (checkResult.status === 'inactive') summary.inactive++;
      else if (checkResult.status === 'invalid') summary.invalid++;
      else summary.error++;
    }

    logAction(item.phone, 'wa_check', checkResult.status, checkResult.message || '');
  }

  var actualChecked = results.length;

  if (aborted) {
    props.setProperty('batchCheck_progress', JSON.stringify({
      lastIndex: startIndex + actualChecked,
      summary: summary
    }));
  } else {
    props.deleteProperty('batchCheck_progress');
  }

  return JSON.stringify({
    complete: !aborted,
    checked: actualChecked,
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
  var dailyLimit = parseInt(config.WA_API_DAILY_LIMIT) || 100;

  if (config.WA_API_ENABLED !== 'true') {
    return JSON.stringify({
      success: false,
      message: 'WA API is disabled. Enable it in Config first.'
    });
  }

  var todayCount = getTodayCheckCount();
  if (todayCount >= dailyLimit) {
    return JSON.stringify({
      success: false,
      message: 'Batas harian tercapai (' + dailyLimit + ' cek/hari). Coba lagi besok.'
    });
  }

  var remaining = dailyLimit - todayCount;
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var allPhones = [];
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
        allPhones.push({ rowId: contacts[i].id, phone: num });
      }
    }
  }

  // Filter out recently checked numbers
  var phoneList = [];
  var skipped = 0;
  for (var j = 0; j < allPhones.length && phoneList.length < remaining; j++) {
    var normalized = normalizePhoneNumber(allPhones[j].phone);
    if (normalized && !wasRecentlyChecked(normalized)) {
      phoneList.push(allPhones[j]);
    } else if (normalized) {
      skipped++;
    }
  }

  if (phoneList.length === 0) {
    return JSON.stringify({
      success: true,
      message: 'No phone numbers to check (skipped ' + skipped + ' recently checked)',
      summary: {},
      skipped: skipped,
      remainingToday: remaining
    });
  }

  // Clear stale progress from other callers (checkNumbersByClass) to avoid
  // resuming at the wrong index in this different phone list.
  PropertiesService.getScriptProperties().deleteProperty('batchCheck_progress');

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

  var checked = result.checked || 0;
  logAction('system', 'waCheckAll', result.complete ? 'success' : 'partial',
    'WA check: ' + (result.summary.active || 0) + ' active, ' + (result.summary.inactive || 0) + ' inactive',
    JSON.stringify(result.summary));

  return JSON.stringify({
    success: true,
    complete: result.complete,
    total: allPhones.length,
    checked: checked,
    skipped: skipped,
    remainingToday: remaining - checked,
    summary: result.summary
  });
}

/**
 * Check WA numbers filtered by grade and/or rombel.
 * Uses the same grade/rombel parsing as the Contacts filter pills.
 * @param {string} gradeFilter Grade filter (e.g., '7', '8', '9') or empty for all.
 * @param {string} rombelFilter Rombel filter (e.g., 'A', 'B', 'C') or empty for all.
 * @return {string} JSON result.
 */
function checkNumbersByClass(gradeFilter, rombelFilter) {
  var config = loadConfig();
  var dailyLimit = parseInt(config.WA_API_DAILY_LIMIT) || 100;

  if (config.WA_API_ENABLED !== 'true') {
    return JSON.stringify({
      success: false,
      message: 'WA API is disabled. Enable it in Config first.'
    });
  }

  var todayCount = getTodayCheckCount();
  if (todayCount >= dailyLimit) {
    return JSON.stringify({
      success: false,
      message: 'Batas harian tercapai (' + dailyLimit + ' cek/hari). Coba lagi besok.'
    });
  }

  var remaining = dailyLimit - todayCount;
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');

  // Filter contacts by grade and/or rombel
  var filtered = [];
  for (var i = 0; i < contacts.length; i++) {
    var cl = String(contacts[i].classLabel || '').trim();
    if (!cl) continue;

    // Parse classLabel into grade and rombel (same logic as Dashboard.js.html)
    var grade = cl.replace(/[A-Za-z]+$/, '').trim();
    var rombel = cl.replace(/^[0-9]+/, '').trim();

    var matchGrade = !gradeFilter || grade === gradeFilter;
    var matchRombel = !rombelFilter || rombel === rombelFilter;

    if (matchGrade && matchRombel) {
      filtered.push(contacts[i]);
    }
  }

  if (filtered.length === 0) {
    var filterDesc = '';
    if (gradeFilter) filterDesc += 'Kelas ' + gradeFilter;
    if (rombelFilter) filterDesc += (filterDesc ? ' ' : '') + 'Rombel ' + rombelFilter;
    return JSON.stringify({
      success: true,
      message: 'Tidak ada kontak untuk filter: ' + (filterDesc || '(kosong)'),
      summary: {},
      checked: 0
    });
  }

  // Collect unique phone numbers from filtered contacts
  var allPhones = [];
  var seen = {};
  for (var j = 0; j < filtered.length; j++) {
    var phones = [
      { field: 'phonePrimary', value: filtered[j].phonePrimary },
      { field: 'phoneSecondary', value: filtered[j].phoneSecondary },
      { field: 'parentPhone', value: filtered[j].parentPhone }
    ];
    for (var p = 0; p < phones.length; p++) {
      var num = String(phones[p].value || '').trim();
      if (num && !seen[num]) {
        seen[num] = true;
        allPhones.push({ rowId: filtered[j].id, phone: num });
      }
    }
  }

  // Filter out recently checked numbers
  var phoneList = [];
  var skipped = 0;
  for (var k = 0; k < allPhones.length && phoneList.length < remaining; k++) {
    var normalized = normalizePhoneNumber(allPhones[k].phone);
    if (normalized && !wasRecentlyChecked(normalized)) {
      phoneList.push(allPhones[k]);
    } else if (normalized) {
      skipped++;
    }
  }

  if (phoneList.length === 0) {
    return JSON.stringify({
      success: true,
      message: 'Semua nomor sudah dicek baru-baru ini (skipped ' + skipped + ')',
      summary: {},
      skipped: skipped,
      remainingToday: remaining
    });
  }

  // Clear stale progress from other callers (checkAllContactNumbers) to avoid
  // resuming at the wrong index in this different phone list.
  PropertiesService.getScriptProperties().deleteProperty('batchCheck_progress');

  var result = JSON.parse(batchCheckNumbers(phoneList));

  // Update Contacts sheet with WA status
  if (result.results) {
    var contactsSheet = config.CONTACTS_SHEET || 'Contacts';
    var now = formatTimestamp(new Date());
    var phoneStatusMap = {};
    for (var r = 0; r < result.results.length; r++) {
      phoneStatusMap[result.results[r].phone] = result.results[r].status;
    }

    for (var c = 0; c < filtered.length; c++) {
      var primary = String(filtered[c].phonePrimary || '').trim();
      if (primary && phoneStatusMap[primary]) {
        updateRowByKey(contactsSheet, 'id', filtered[c].id, {
          waPhoneStatus: phoneStatusMap[primary],
          waPhoneCheckedAt: now
        });
      }
    }
  }

  var filterLabel = '';
  if (gradeFilter) filterLabel += 'Kelas ' + gradeFilter;
  if (rombelFilter) filterLabel += (filterLabel ? ' ' : '') + rombelFilter;

  var checked = result.checked || 0;
  logAction('system', 'waCheckByClass', result.complete ? 'success' : 'partial',
    'WA check [' + filterLabel + ']: ' + (result.summary.active || 0) + ' active, ' +
    (result.summary.inactive || 0) + ' inactive (' + filtered.length + ' contacts)',
    JSON.stringify({ filter: filterLabel, summary: result.summary }));

  return JSON.stringify({
    success: true,
    complete: result.complete,
    filterLabel: filterLabel,
    totalContacts: filtered.length,
    totalPhones: allPhones.length,
    checked: checked,
    skipped: skipped,
    remainingToday: remaining - checked,
    summary: result.summary
  });
}
