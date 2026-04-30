const assert = require('node:assert/strict')

const {
  shouldFocusViewportOnPointSelection
} = require('../../miniprogram/utils/map-point-selection')

const tests = []

function test(name, run) {
  tests.push({ name, run })
}

test('shouldFocusViewportOnPointSelection keeps marker taps stable and preserves other selection flows', () => {
  assert.equal(shouldFocusViewportOnPointSelection('markerTap'), false)
  assert.equal(shouldFocusViewportOnPointSelection('audioList'), true)
  assert.equal(shouldFocusViewportOnPointSelection(''), true)
})

module.exports = tests
