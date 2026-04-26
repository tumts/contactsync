/**
 * NamingService.gs — Contact naming engine with 3 presets (pure names only).
 */

/**
 * Get all naming preset definitions.
 * @return {Array<Object>} Array of preset objects.
 */
function getNamePresets() {
  return [
    { id: 1, label: 'First Last', pattern: '{givenName} {familyName}' },
    { id: 2, label: 'Last, First', pattern: '{familyName}, {givenName}' },
    { id: 3, label: 'Full Name', pattern: '{fullName}' }
  ];
}

/**
 * Apply a naming preset to a data row.
 * Only replaces givenName, familyName, fullName — no metadata.
 * @param {number} presetId Preset ID (1-3).
 * @param {Object} data Row data with fullName, givenName, familyName.
 * @return {string} Formatted contact name.
 */
function applyNamingPreset(presetId, data) {
  var fullName = String(data.fullName || '').trim();
  var givenName = String(data.givenName || '').trim();
  var familyName = String(data.familyName || '').trim();

  var presets = getNamePresets();
  var preset = null;
  for (var i = 0; i < presets.length; i++) {
    if (presets[i].id === Number(presetId)) {
      preset = presets[i];
      break;
    }
  }

  if (!preset) preset = presets[0];

  var result = preset.pattern
    .replace('{fullName}', fullName)
    .replace('{givenName}', givenName)
    .replace('{familyName}', familyName);

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Preview naming results for all presets.
 * @param {number} presetId Optional specific preset to preview.
 * @return {string} JSON with preview results.
 */
function previewNaming(presetId) {
  var sampleData = {
    fullName: 'Ahmad Fauzi',
    givenName: 'Ahmad',
    familyName: 'Fauzi'
  };

  var presets = getNamePresets();
  var results = [];

  for (var i = 0; i < presets.length; i++) {
    var result = applyNamingPreset(presets[i].id, sampleData);
    results.push({
      id: presets[i].id,
      label: presets[i].label,
      pattern: presets[i].pattern,
      example: result,
      selected: presets[i].id === Number(presetId || 1)
    });
  }

  return JSON.stringify({ presets: results });
}
