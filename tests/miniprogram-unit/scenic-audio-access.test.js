const assert = require('node:assert/strict')

if (process.env.SCENIC_AUDIO_ACCESS_TEST_FORCE_LOAD_FAILURE === '1') {
  throw new Error('forced scenic audio access utils load failure')
}

const {
  SCENIC_AUDIO_SUBSCRIBE_DESCRIPTION,
  buildScenicAudioAccessOptions
} = require('../../miniprogram/utils/scenic-audio-access')

const tests = []

function test(name, run) {
  tests.push({ name, run })
}

test('buildScenicAudioAccessOptions provides scenic audio feature metadata defaults', () => {
  assert.deepEqual(
    buildScenicAudioAccessOptions(),
    {
      featureKey: 'vip',
      featureName: '景点讲解',
      productName: '景点讲解权限',
      description: SCENIC_AUDIO_SUBSCRIBE_DESCRIPTION
    }
  )
})

test('buildScenicAudioAccessOptions allows caller overrides', () => {
  assert.deepEqual(
    buildScenicAudioAccessOptions({
      successRedirect: '/subpackages/guide/pages/scenic-audio-list/scenic-audio-list?poiId=poi-01',
      showLoginToast: true
    }),
    {
      featureKey: 'vip',
      featureName: '景点讲解',
      productName: '景点讲解权限',
      description: SCENIC_AUDIO_SUBSCRIBE_DESCRIPTION,
      successRedirect: '/subpackages/guide/pages/scenic-audio-list/scenic-audio-list?poiId=poi-01',
      showLoginToast: true
    }
  )
})

module.exports = process.env.SCENIC_AUDIO_ACCESS_TEST_FORCE_INVALID_EXPORT === '1'
  ? { invalid: true }
  : tests
