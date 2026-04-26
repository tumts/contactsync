/**
 * Validation.gs — Data validation for ContactSync.
 */

/**
 * Validate a single contact row.
 * @param {Object} row Contact row object.
 * @return {Object} { valid: boolean, errors: string[] }
 */
function validateRow(row) {
  var errors = [];

  var fullName = String(row.fullName || '').trim();
  if (!fullName) {
    errors.push('fullName is required');
  }

  var classLabel = String(row.classLabel || '').trim();
  if (!classLabel) {
    errors.push('classLabel is empty');
  }

  var yearLabel = String(row.yearLabel || '').trim();
  if (!yearLabel) {
    errors.push('yearLabel is empty');
  }

  var phonePrimary = String(row.phonePrimary || '').trim();
  var emailPrimary = String(row.emailPrimary || '').trim();

  if (!phonePrimary && !emailPrimary) {
    errors.push('Either phonePrimary or emailPrimary is required');
  }

  if (emailPrimary) {
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(emailPrimary)) {
      errors.push('emailPrimary has invalid format');
    }
  }

  if (phonePrimary) {
    var phoneDigits = phonePrimary.replace(/\D/g, '');
    if (phoneDigits.indexOf('62') !== 0 || phoneDigits.length < 10 || phoneDigits.length > 15) {
      errors.push('phonePrimary must be 62xxx format (10-15 digits)');
    }
  }

  var emailSecondary = String(row.emailSecondary || '').trim();
  if (emailSecondary) {
    var emailPattern2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern2.test(emailSecondary)) {
      errors.push('emailSecondary has invalid format');
    }
  }

  if (row.parentPhone) {
    var parentPhoneDigits = String(row.parentPhone).replace(/\D/g, '');
    if (parentPhoneDigits && (parentPhoneDigits.indexOf('62') !== 0 || parentPhoneDigits.length < 10 || parentPhoneDigits.length > 15)) {
      errors.push('parentPhone must be 62xxx format (10-15 digits)');
    }
  }

  var studentStatus = String(row.studentStatus || '').trim();
  if (studentStatus && ['aktif', 'berhenti', 'lulus'].indexOf(studentStatus) === -1) {
    errors.push('studentStatus must be aktif, berhenti, or lulus');
  }

  var birthday = String(row.birthday || '').trim();
  if (birthday) {
    var bdayPattern = /^(\d{4}-\d{2}-\d{2}|--\d{2}-\d{2})$/;
    if (!bdayPattern.test(birthday)) {
      errors.push('birthday must be YYYY-MM-DD or --MM-DD format');
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

/**
 * Validate all rows in the Contacts sheet.
 * @return {string} JSON summary.
 */
function validateAllRows() {
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');

  var totalValid = 0;
  var totalInvalid = 0;
  var allErrors = [];

  for (var i = 0; i < contacts.length; i++) {
    var result = validateRow(contacts[i]);
    if (result.valid) {
      totalValid++;
    } else {
      totalInvalid++;
      allErrors.push({
        row: i + 2,
        fullName: contacts[i].fullName || '(empty)',
        errors: result.errors
      });
    }
  }

  logAction('system', 'validate', totalInvalid > 0 ? 'warning' : 'success',
    'Validation complete: ' + totalValid + ' valid, ' + totalInvalid + ' invalid',
    JSON.stringify({ errorCount: allErrors.length }));

  return JSON.stringify({
    total: contacts.length,
    valid: totalValid,
    invalid: totalInvalid,
    errors: allErrors
  });
}

/**
 * Find duplicate contacts based on email, phone, or name+organization.
 * @return {string} JSON summary.
 */
function findDuplicates() {
  var config = loadConfig();
  var contacts = readSheetAsObjects(config.CONTACTS_SHEET || 'Contacts');
  var duplicates = [];
  var dupId = 0;

  var emailMap = {};
  var phoneMap = {};
  var nameOrgMap = {};

  for (var i = 0; i < contacts.length; i++) {
    var c = contacts[i];
    var email = String(c.emailPrimary || '').trim().toLowerCase();
    var phone = String(c.phonePrimary || '').trim();
    var nameOrg = (String(c.fullName || '').trim().toLowerCase() + '|' +
      String(c.organization || '').trim().toLowerCase());

    if (email && emailMap[email] !== undefined) {
      dupId++;
      var prev = contacts[emailMap[email]];
      duplicates.push({
        id: dupId,
        name1: prev.fullName || '',
        name2: c.fullName || '',
        phone1: prev.phonePrimary || '',
        phone2: c.phonePrimary || '',
        email1: prev.emailPrimary || '',
        email2: c.emailPrimary || '',
        score: 90,
        status: 'pending',
        resolvedAt: ''
      });
    } else if (email) {
      emailMap[email] = i;
    }

    if (phone && phoneMap[phone] !== undefined) {
      dupId++;
      var prev2 = contacts[phoneMap[phone]];
      duplicates.push({
        id: dupId,
        name1: prev2.fullName || '',
        name2: c.fullName || '',
        phone1: prev2.phonePrimary || '',
        phone2: c.phonePrimary || '',
        email1: prev2.emailPrimary || '',
        email2: c.emailPrimary || '',
        score: 85,
        status: 'pending',
        resolvedAt: ''
      });
    } else if (phone) {
      phoneMap[phone] = i;
    }

    if (nameOrg && nameOrg !== '|' && nameOrgMap[nameOrg] !== undefined) {
      dupId++;
      var prev3 = contacts[nameOrgMap[nameOrg]];
      duplicates.push({
        id: dupId,
        name1: prev3.fullName || '',
        name2: c.fullName || '',
        phone1: prev3.phonePrimary || '',
        phone2: c.phonePrimary || '',
        email1: prev3.emailPrimary || '',
        email2: c.emailPrimary || '',
        score: 70,
        status: 'pending',
        resolvedAt: ''
      });
    } else if (nameOrg && nameOrg !== '|') {
      nameOrgMap[nameOrg] = i;
    }
  }

  if (duplicates.length > 0) {
    writeObjectsToSheet(config.DUPLICATES_SHEET || 'Duplicates', duplicates, DUPLICATES_HEADERS);
  }

  var byEmail = 0, byPhone = 0, byName = 0;
  for (var d = 0; d < duplicates.length; d++) {
    if (duplicates[d].score === 90) byEmail++;
    else if (duplicates[d].score === 85) byPhone++;
    else byName++;
  }

  logAction('system', 'findDuplicates', 'success',
    'Found ' + duplicates.length + ' duplicates',
    JSON.stringify({ byEmail: byEmail, byPhone: byPhone, byName: byName }));

  return JSON.stringify({
    total: duplicates.length,
    byEmail: byEmail,
    byPhone: byPhone,
    byName: byName
  });
}

/**
 * Check if all config keys are filled.
 * @return {Object} { complete: boolean, missing: string[] }
 */
function checkConfigCompleteness() {
  var config = loadConfig();
  var requiredKeys = Object.keys(CONFIG_DEFAULTS);
  var missing = [];

  for (var i = 0; i < requiredKeys.length; i++) {
    var key = requiredKeys[i];
    if (config[key] === undefined || config[key] === '') {
      if (key !== 'WA_API_BASIC_AUTH_USER' && key !== 'WA_API_BASIC_AUTH_PASS') {
        missing.push(key);
      }
    }
  }

  return { complete: missing.length === 0, missing: missing };
}

/**
 * Validate contacts and return result (server-callable).
 * @return {string} JSON result.
 */
function validateContacts() {
  return validateAllRows();
}
