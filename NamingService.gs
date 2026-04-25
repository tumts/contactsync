/**
 * NamingService.gs — Contact naming engine with 5 presets.
 */

/**
 * Get all naming preset definitions.
 * @return {Array<Object>} Array of preset objects.
 */
function getNamePresets() {
  return [
    { id: 1, label: 'Dash separated', pattern: '{fullName} - {classLabel} - {yearLabel}' },
    { id: 2, label: 'Slash separated', pattern: '{fullName} / {classLabel} / {yearLabel}' },
    { id: 3, label: 'Parenthesized', pattern: '{fullName} ({classLabel} {yearLabel})' },
    { id: 4, label: 'Organization style', pattern: '{fullName} - {organization} {classLabel}' },
    { id: 5, label: 'Bracketed', pattern: '{fullName} [{classLabel}] {yearLabel}' }
  ];
}

/**
 * Apply a naming preset to a data row.
 * @param {number} presetId Preset ID (1-5).
 * @param {Object} data Row data with fullName, classLabel, yearLabel, organization.
 * @return {string} Formatted contact name.
 */
function applyNamingPreset(presetId, data) {
  var config = loadConfig();
  var fullName = String(data.fullName || '').trim();
  var classLabel = String(data.classLabel || config.DEFAULT_CLASS_LABEL || '').trim();
  var yearLabel = String(data.yearLabel || config.DEFAULT_YEAR_LABEL || '').trim();
  var organization = String(data.organization || config.DEFAULT_ORGANIZATION || '').trim();

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
    .replace('{classLabel}', classLabel)
    .replace('{yearLabel}', yearLabel)
    .replace('{organization}', organization);

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
    classLabel: '7A',
    yearLabel: '2026',
    organization: 'MTs Al Amin'
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
