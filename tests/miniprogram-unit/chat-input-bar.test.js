const assert = require('node:assert/strict')
const fs = require('fs')

const tests = []
const componentModulePath = require.resolve('../../miniprogram/components/chat-input-bar/chat-input-bar.js')
const componentWxmlPath = require.resolve('../../miniprogram/components/chat-input-bar/chat-input-bar.wxml')
const componentWxssPath = require.resolve('../../miniprogram/components/chat-input-bar/chat-input-bar.wxss')

function test(name, run) {
  tests.push({ name, run })
}

function createRecorderHarness() {
  let startHandler = null
  let stopHandler = null
  let errorHandler = null
  const startCalls = []
  let stopCallCount = 0

  return {
    manager: {
      onStart(handler) {
        startHandler = handler
      },
      onStop(handler) {
        stopHandler = handler
      },
      onError(handler) {
        errorHandler = handler
      },
      start(options) {
        startCalls.push(options)
      },
      stop() {
        stopCallCount += 1
      }
    },
    triggerStart() {
      if (typeof startHandler === 'function') {
        startHandler()
      }
    },
    triggerStop(result = {}) {
      if (typeof stopHandler === 'function') {
        stopHandler(result)
      }
    },
    triggerError(error = {}) {
      if (typeof errorHandler === 'function') {
        errorHandler(error)
      }
    },
    get startCalls() {
      return startCalls
    },
    get stopCallCount() {
      return stopCallCount
    }
  }
}

function createWxHarness({
  authSetting = {},
  authorizeSucceeds = false,
  voiceButtonRect = {
    left: 100,
    right: 300,
    top: 100,
    bottom: 180
  }
} = {}) {
  const recorder = createRecorderHarness()
  const calls = {
    getSetting: 0,
    authorize: 0,
    openSetting: 0,
    showToast: [],
    showModal: [],
    vibrateShort: 0
  }

  const wxMock = {
    getRecorderManager() {
      return recorder.manager
    },
    getSetting({ success }) {
      calls.getSetting += 1
      success({
        authSetting
      })
    },
    authorize({ success, fail }) {
      calls.authorize += 1

      if (authorizeSucceeds) {
        success()
        return
      }

      fail({
        errMsg: 'authorize:fail auth deny'
      })
    },
    openSetting({ success } = {}) {
      calls.openSetting += 1
      if (typeof success === 'function') {
        success({
          authSetting: {
            'scope.record': true
          }
        })
      }
    },
    showToast(options = {}) {
      calls.showToast.push(options)
    },
    showModal(options = {}) {
      calls.showModal.push(options)
      if (typeof options.success === 'function') {
        options.success({
          confirm: true,
          cancel: false
        })
      }
    },
    vibrateShort() {
      calls.vibrateShort += 1
    },
    getSystemInfoSync() {
      return {
        windowWidth: 375
      }
    },
    getFileSystemManager() {
      return {
        readFile({ success }) {
          if (typeof success === 'function') {
            success({
              data: Buffer.from('mock-voice-data').toString('base64')
            })
          }
        }
      }
    },
    createSelectorQuery() {
      return {
        in() {
          return this
        },
        select() {
          return this
        },
        boundingClientRect() {
          return this
        },
        exec(callback) {
          if (typeof callback === 'function') {
            callback([voiceButtonRect])
          }
        }
      }
    }
  }

  return {
    wxMock,
    recorder,
    calls
  }
}

function loadComponentDefinition(wxMock) {
  const previousComponent = global.Component
  const previousWx = global.wx
  let componentDefinition = null

  global.wx = wxMock
  global.Component = (definition) => {
    componentDefinition = definition
  }

  delete require.cache[componentModulePath]
  require(componentModulePath)
  delete require.cache[componentModulePath]

  if (previousComponent === undefined) {
    delete global.Component
  } else {
    global.Component = previousComponent
  }

  return {
    componentDefinition,
    restore() {
      if (previousWx === undefined) {
        delete global.wx
      } else {
        global.wx = previousWx
      }
    }
  }
}

function createComponentInstance(componentDefinition, properties = {}) {
  const triggeredEvents = []
  const instance = {
    properties: {
      disabled: false,
      isGenerating: false,
      ...properties
    },
    data: {
      ...(componentDefinition.data || {})
    },
    setData(patch = {}) {
      this.data = {
        ...this.data,
        ...patch
      }
    },
    triggerEvent(name, detail) {
      triggeredEvents.push({
        name,
        detail
      })
    }
  }

  Object.assign(instance, componentDefinition.methods || {})

  if (componentDefinition.lifetimes && typeof componentDefinition.lifetimes.attached === 'function') {
    componentDefinition.lifetimes.attached.call(instance)
  }

  return {
    instance,
    triggeredEvents
  }
}

test('onModeChange requests microphone permission before switching into voice mode', async () => {
  const {
    wxMock,
    calls
  } = createWxHarness({
    authSetting: {},
    authorizeSucceeds: true
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const { instance } = createComponentInstance(componentDefinition)
    await instance.onModeChange()

    assert.equal(calls.getSetting, 1)
    assert.equal(calls.authorize, 1)
    assert.equal(
      calls.showToast[calls.showToast.length - 1]?.title,
      '录音权限已获取'
    )
    assert.equal(instance.data.isVoiceMode, true)
  } finally {
    runtime.restore()
  }
})

test('voice mode markup no longer injects a recording hint block above the button', () => {
  const wxml = fs.readFileSync(componentWxmlPath, 'utf8')

  assert.equal(
    wxml.includes('voice-cancel-hint'),
    false
  )
})

test('onModeChange opens settings guidance when microphone permission is denied', async () => {
  const {
    wxMock,
    calls
  } = createWxHarness({
    authSetting: {},
    authorizeSucceeds: false
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const { instance } = createComponentInstance(componentDefinition)
    await instance.onModeChange()

    assert.equal(calls.getSetting, 1)
    assert.equal(calls.authorize, 1)
    assert.equal(calls.showModal.length, 1)
    assert.equal(calls.showModal[0].title, '需要录音权限')
    assert.equal(calls.openSetting, 1)
    assert.equal(instance.data.isVoiceMode, false)
  } finally {
    runtime.restore()
  }
})

test('onVoiceStart starts recording immediately once voice mode is available', async () => {
  const {
    wxMock,
    recorder,
    calls
  } = createWxHarness({
    authSetting: {
      'scope.record': true
    }
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const { instance } = createComponentInstance(componentDefinition)
    await instance.onModeChange()
    await instance.onVoiceStart()

    assert.equal(calls.getSetting >= 2, true)
    assert.equal(calls.authorize, 0)
    assert.equal(recorder.startCalls.length, 1)
    assert.equal(instance.data.isRecording, true)
    instance.clearRecordingTimer()
  } finally {
    runtime.restore()
  }
})

test('onVoiceMove force stops the recording when the finger leaves the button bounds', async () => {
  const {
    wxMock,
    recorder
  } = createWxHarness({
    authSetting: {
      'scope.record': true
    }
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const { instance } = createComponentInstance(componentDefinition)
    await instance.onModeChange()
    await instance.onVoiceStart()
    recorder.triggerStart()

    instance.onVoiceMove({
      touches: [{
        pageX: 20,
        pageY: 20
      }]
    })

    assert.equal(instance.data.isRecording, false)
    assert.equal(recorder.stopCallCount, 1)
  } finally {
    runtime.restore()
  }
})

test('onVoiceCancel stops an active recording immediately', async () => {
  const {
    wxMock,
    recorder
  } = createWxHarness({
    authSetting: {
      'scope.record': true
    }
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const { instance } = createComponentInstance(componentDefinition)
    await instance.onModeChange()
    await instance.onVoiceStart()

    assert.equal(instance.data.isRecording, true)
    assert.equal(recorder.stopCallCount, 0)

    instance.onVoiceCancel()

    assert.equal(instance.data.isRecording, false)
    assert.equal(recorder.stopCallCount, 1)
  } finally {
    runtime.restore()
  }
})

test('forceStopVoiceRecordingFromPage stops an active recording when release is caught by the page fallback', async () => {
  const {
    wxMock,
    recorder
  } = createWxHarness({
    authSetting: {
      'scope.record': true
    }
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const { instance } = createComponentInstance(componentDefinition)
    await instance.onModeChange()
    await instance.onVoiceStart()

    assert.equal(instance.data.isRecording, true)
    assert.equal(recorder.stopCallCount, 0)

    instance.forceStopVoiceRecordingFromPage()

    assert.equal(instance.data.isRecording, false)
    assert.equal(recorder.stopCallCount, 1)
  } finally {
    runtime.restore()
  }
})

test('onVoiceEnd still sends voice when release happens before recorder onStart callback arrives', async () => {
  const {
    wxMock,
    recorder
  } = createWxHarness({
    authSetting: {
      'scope.record': true
    }
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const {
      instance,
      triggeredEvents
    } = createComponentInstance(componentDefinition)
    await instance.onModeChange()
    await instance.onVoiceStart()

    instance.onVoiceEnd()
    recorder.triggerStart()
    recorder.triggerStop({
      tempFilePath: '/tmp/release-before-start.mp3',
      duration: 1800
    })

    assert.equal(
      triggeredEvents.some((event) => event.name === 'voiceSend'),
      true
    )
  } finally {
    runtime.restore()
  }
})

test('onVoiceMove cancellation prevents the follow-up recorder stop from sending voice data', async () => {
  const {
    wxMock,
    recorder
  } = createWxHarness({
    authSetting: {
      'scope.record': true
    }
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const {
      instance,
      triggeredEvents
    } = createComponentInstance(componentDefinition)
    await instance.onModeChange()
    await instance.onVoiceStart()
    recorder.triggerStart()

    instance.onVoiceMove({
      touches: [{
        pageX: 20,
        pageY: 20
      }]
    })
    recorder.triggerStop({
      tempFilePath: '/tmp/out-of-bounds.mp3',
      duration: 1800
    })

    assert.equal(instance.data.isRecording, false)
    assert.equal(recorder.stopCallCount, 1)
    assert.equal(
      triggeredEvents.some((event) => event.name === 'voiceSend'),
      false
    )
  } finally {
    runtime.restore()
  }
})

test('handleRecorderStop ignores cancelled recordings instead of sending voice data', async () => {
  const {
    wxMock,
    recorder
  } = createWxHarness({
    authSetting: {
      'scope.record': true
    }
  })
  const runtime = loadComponentDefinition(wxMock)

  try {
    const { componentDefinition } = runtime
    assert.ok(componentDefinition, 'expected chat-input-bar component definition to load')

    const {
      instance,
      triggeredEvents
    } = createComponentInstance(componentDefinition)
    await instance.onModeChange()
    await instance.onVoiceStart()

    instance.onVoiceCancel()
    recorder.triggerStop({
      tempFilePath: '/tmp/cancelled.mp3',
      duration: 1200
    })

    assert.equal(
      triggeredEvents.some((event) => event.name === 'voiceSend'),
      false
    )
  } finally {
    runtime.restore()
  }
})

module.exports = tests
