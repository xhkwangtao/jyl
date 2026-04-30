function normalizeSelectionSource(source = '') {
  return String(source || '').trim().toLowerCase()
}

function shouldFocusViewportOnPointSelection(source = '') {
  const normalizedSource = normalizeSelectionSource(source)

  if (normalizedSource === 'markertap' || normalizedSource === 'marker_tap') {
    return false
  }

  return true
}

module.exports = {
  shouldFocusViewportOnPointSelection
}
