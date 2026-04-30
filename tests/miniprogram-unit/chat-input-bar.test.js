const assert = require('node:assert/strict')

const tests = []
const componentModulePath = require.resolve('../../miniprogram/components/chat-input-bar/chat-input-bar.js')

function test(name, run) {
  tests.push({ name, run })
}

function createRecorderHarness() {
  let stopHandler = null
  let errorHandler = null
  const startCalls = []
  let stopCallCount = 0

  return {
    manager: {
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
  authorizeSucceeds = false
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
    getFileSystemManager() {
      return {
        readFile() {}
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

test('onVoiceStart waits for microphone permission before starting recording', async () => {
  const {
    wxMock,
    recorder,
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
    await instance.onVoiceStart()

    assert.equal(calls.getSetting, 1)
    assert.equal(calls.authorize, 1)
    assert.equal(recorder.startCalls.length, 0)
    assert.equal(
      calls.showToast[calls.showToast.length - 1]?.title,
      '麦克风权限已开启，请重新按住说话'
    )
  } finally {
    runtime.restore()
  }
})

test('onVoiceStart opens settings guidance when microphone permission is denied', async () => {
  const {
    wxMock,
    recorder,
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
    await instance.onVoiceStart()

    assert.equal(calls.getSetting, 1)
    assert.equal(calls.authorize, 1)
    assert.equal(recorder.startCalls.length, 0)
    assert.equal(calls.showModal.length, 1)
    assert.equal(calls.showModal[0].title, '需要麦克风权限')
    assert.equal(calls.openSetting, 1)
  } finally {
    runtime.restore()
  }
})

test('onVoiceStart still starts recording immediately after permission is granted', async () => {
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
    await instance.onVoiceStart()

    assert.equal(calls.getSetting, 1)
    assert.equal(calls.authorize, 0)
    assert.equal(recorder.startCalls.length, 1)
    assert.equal(instance.data.isRecording, true)
    instance.clearRecordTimer()
  } finally {
    runtime.restore()
  }
})

module.exports = tests
