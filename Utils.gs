/**
 * Utils.gs — Utility functions for ContactSync.
 */

/**
 * Normalize an Indonesian phone number to 62xxx format.
 * @param {string} phone Raw phone input.
 * @return {string|null} Normalized number or null if invalid.
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  var digits = String(phone).replace(/\D/g, '');

  if (digits.indexOf('620') === 0) {
    digits = '62' + digits.substring(3);
  }

  if (digits.charAt(0) === '0') {
    digits = '62' + digits.substring(1);
  } else if (digits.charAt(0) === '8') {
    digits = '62' + digits;
  }

  if (digits.length < 10 || digits.length > 15) {
    return null;
  }

  if (digits.indexOf('62') !== 0) {
    return null;
  }

  return digits;
}

/**
 * Clean and validate an email address.
 * @param {string} email Raw email.
 * @return {string} Cleaned email or empty string.
 */
function cleanEmail(email) {
  if (!email) return '';
  var cleaned = String(email).trim().toLowerCase();
  var pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(cleaned)) return '';
  return cleaned;
}

/**
 * Normalize a header string: lowercase, trim, replace spaces with underscores.
 * @param {string} header Raw header.
 * @return {string} Normalized header.
 */
function normalizeHeader(header) {
  return String(header).trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Map a source row from DataSiswa to Contacts format.
 * @param {Object} row Source row object with original column names.
 * @param {Object} headerMap Optional header mapping override.
 * @return {Object} Mapped contact object.
 */
function mapSourceColumns(row, headerMap) {
  var fullName = String(row['nama'] || '').trim();
  var nameParts = splitFullName(fullName);
  var kelas = String(row['kelas'] || '').trim();
  var rombel = String(row['rombel'] || '').trim();
  var classLabel = kelas + rombel;

  var studentStatus = String(row['status'] || '').trim().toLowerCase() || 'aktif';
  var birthday = String(row['tanggal_lahir'] || '').trim();

  var contact = {
    fullName: fullName,
    givenName: nameParts.givenName,
    familyName: nameParts.familyName,
    middleName: '',
    namePrefix: '',
    nameSuffix: '',
    nickname: '',
    fileAs: '',
    classLabel: classLabel,
    phonePrimary: normalizePhoneNumber(row['wa_siswa']),
    emailPrimary: cleanEmail(row['email_siswa']),
    nisn: String(row['nisn'] || '').trim(),
    studentStatus: studentStatus,
    birthday: birthday,
    phoneLabel: '',
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    parentRole: ''
  };

  var statusAyah = String(row['status_ayah'] || '').trim();
  var statusIbu = String(row['status_ibu'] || '').trim();

  if (statusAyah === 'Masih Hidup' && (row['wa_ayah'] || row['email_ayah'])) {
    contact.parentName = String(row['nama_ayah'] || '').trim();
    contact.parentPhone = normalizePhoneNumber(row['wa_ayah']);
    contact.parentEmail = cleanEmail(row['email_ayah']);
    contact.parentRole = 'Ayah';
  } else if (statusIbu === 'Masih Hidup' && (row['wa_ibu'] || row['email_ibu'])) {
    contact.parentName = String(row['nama_ibu'] || '').trim();
    contact.parentPhone = normalizePhoneNumber(row['wa_ibu']);
    contact.parentEmail = cleanEmail(row['email_ibu']);
    contact.parentRole = 'Ibu';
  }

  return contact;
}

/**
 * Build a labels string from classLabel, yearLabel, and studentStatus.
 * @param {string} classLabel Class label.
 * @param {string} yearLabel Year label.
 * @param {string} studentStatus Student status.
 * @return {string} Labels string separated by ' ::: '.
 */
function buildLabels(classLabel, yearLabel, studentStatus) {
  var parts = [];
  if (classLabel) parts.push('Kelas ' + String(classLabel).trim());
  if (yearLabel) parts.push('TA ' + String(yearLabel).trim());
  if (studentStatus) parts.push(String(studentStatus).trim());
  return parts.join(' ::: ');
}

/**
 * Split a full name into givenName and familyName.
 * @param {string} fullName Full name string.
 * @return {Object} { givenName, familyName }
 */
function splitFullName(fullName) {
  var parts = String(fullName).trim().split(/\s+/);
  if (parts.length <= 1) {
    return { givenName: parts[0] || '', familyName: '' };
  }
  return {
    givenName: parts[0],
    familyName: parts.slice(1).join(' ')
  };
}

/**
 * Generate a deduplication key from name, phone, and email.
 * @param {string} name Contact name.
 * @param {string} phone Phone number.
 * @param {string} email Email address.
 * @return {string} Deduplication key.
 */
function generateDedupeKey(name, phone, email) {
  var normalizedName = String(name || '').trim().toLowerCase().replace(/\s+/g, '');
  var normalizedPhone = normalizePhoneNumber(phone) || '';
  var normalizedEmail = cleanEmail(email) || '';
  return normalizedName + '|' + normalizedPhone + '|' + normalizedEmail;
}

/**
 * Escape HTML special characters.
 * @param {string} str Input string.
 * @return {string} Escaped string.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a Date to "YYYY-MM-DD HH:mm:ss".
 * @param {Date} date Date object.
 * @return {string} Formatted timestamp.
 */
function formatTimestamp(date) {
  if (!date) date = new Date();
  var y = date.getFullYear();
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  var d = ('0' + date.getDate()).slice(-2);
  var hh = ('0' + date.getHours()).slice(-2);
  var mm = ('0' + date.getMinutes()).slice(-2);
  var ss = ('0' + date.getSeconds()).slice(-2);
  return y + '-' + m + '-' + d + ' ' + hh + ':' + mm + ':' + ss;
}
