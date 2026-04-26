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

  // === Cross-check: Student phone vs Parent phone ===
  var parentPhoneMap = {};
  var parentEmailMap = {};

  for (var i = 0; i < contacts.length; i++) {
    var pp = String(contacts[i].parentPhone || '').trim();
    var pe = String(contacts[i].parentEmail || '').trim().toLowerCase();
    if (pp) {
      if (!parentPhoneMap[pp]) parentPhoneMap[pp] = [];
      parentPhoneMap[pp].push(i);
    }
    if (pe) {
      if (!parentEmailMap[pe]) parentEmailMap[pe] = [];
      parentEmailMap[pe].push(i);
    }
  }

  // Check if student phone matches any parent phone
  for (var i = 0; i < contacts.length; i++) {
    var studentPhone = String(contacts[i].phonePrimary || '').trim();
    if (studentPhone && parentPhoneMap[studentPhone]) {
      for (var p = 0; p < parentPhoneMap[studentPhone].length; p++) {
        var parentIdx = parentPhoneMap[studentPhone][p];
        if (parentIdx !== i) {
          dupId++;
          duplicates.push({
            id: dupId,
            name1: contacts[i].fullName + ' (siswa)',
            name2: contacts[parentIdx].parentName + ' (' + (contacts[parentIdx].parentRole || 'orangtua') + ' dari ' + contacts[parentIdx].fullName + ')',
            phone1: studentPhone,
            phone2: contacts[parentIdx].parentPhone,
            email1: contacts[i].emailPrimary || '',
            email2: contacts[parentIdx].parentEmail || '',
            score: 95,
            status: 'pending',
            resolvedAt: ''
          });
        }
      }
    }

    // Check if student email matches any parent email
    var studentEmail = String(contacts[i].emailPrimary || '').trim().toLowerCase();
    if (studentEmail && parentEmailMap[studentEmail]) {
      for (var p = 0; p < parentEmailMap[studentEmail].length; p++) {
        var parentIdx2 = parentEmailMap[studentEmail][p];
        if (parentIdx2 !== i) {
          dupId++;
          duplicates.push({
            id: dupId,
            name1: contacts[i].fullName + ' (siswa)',
            name2: contacts[parentIdx2].parentName + ' (' + (contacts[parentIdx2].parentRole || 'orangtua') + ' dari ' + contacts[parentIdx2].fullName + ')',
            phone1: contacts[i].phonePrimary || '',
            phone2: contacts[parentIdx2].parentPhone || '',
            email1: studentEmail,
            email2: contacts[parentIdx2].parentEmail || '',
            score: 93,
            status: 'pending',
            resolvedAt: ''
          });
        }
      }
    }
  }

  // Check parent phone vs parent phone (siblings — same parent)
  var seenParentPairs = {};
  var parentPhoneKeys = Object.keys(parentPhoneMap);
  for (var pk = 0; pk < parentPhoneKeys.length; pk++) {
    var indices = parentPhoneMap[parentPhoneKeys[pk]];
    if (indices.length > 1) {
      for (var a = 0; a < indices.length; a++) {
        for (var b = a + 1; b < indices.length; b++) {
          var pairKey = indices[a] + '-' + indices[b];
          if (!seenParentPairs[pairKey]) {
            seenParentPairs[pairKey] = true;
            dupId++;
            duplicates.push({
              id: dupId,
              name1: contacts[indices[a]].fullName + ' (orangtua: ' + contacts[indices[a]].parentName + ')',
              name2: contacts[indices[b]].fullName + ' (orangtua: ' + contacts[indices[b]].parentName + ')',
              phone1: contacts[indices[a]].parentPhone,
              phone2: contacts[indices[b]].parentPhone,
              email1: contacts[indices[a]].parentEmail || '',
              email2: contacts[indices[b]].parentEmail || '',
              score: 80,
              status: 'pending',
              resolvedAt: ''
            });
          }
        }
      }
    }
  }

  if (duplicates.length > 0) {
    writeObjectsToSheet(config.DUPLICATES_SHEET || 'Duplicates', duplicates, DUPLICATES_HEADERS);
  }

  var byEmail = 0, byPhone = 0, byName = 0, byParentPhone = 0, byParentEmail = 0, bySibling = 0;
  for (var d = 0; d < duplicates.length; d++) {
    if (duplicates[d].score === 95) byParentPhone++;
    else if (duplicates[d].score === 93) byParentEmail++;
    else if (duplicates[d].score === 90) byEmail++;
    else if (duplicates[d].score === 85) byPhone++;
    else if (duplicates[d].score === 80) bySibling++;
    else byName++;
  }

  logAction('system', 'findDuplicates', 'success',
    'Found ' + duplicates.length + ' duplicates',
    JSON.stringify({ byEmail: byEmail, byPhone: byPhone, byName: byName, byParentPhone: byParentPhone, byParentEmail: byParentEmail, bySibling: bySibling }));

  return JSON.stringify({
    total: duplicates.length,
    byEmail: byEmail,
    byPhone: byPhone,
    byName: byName,
    byParentPhone: byParentPhone,
    byParentEmail: byParentEmail,
    bySibling: bySibling
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
