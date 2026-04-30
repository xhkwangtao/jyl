const assert = require('node:assert/strict')
const fs = require('fs')

const tests = []
const mapCoreJsPath = require.resolve('../../miniprogram/components/map-core/map-core.js')
const mapCoreWxmlPath = require.resolve('../../miniprogram/components/map-core/map-core.wxml')

function test(name, run) {
  tests.push({ name, run })
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

test('map-core forwards boundary limit into the native map component', () => {
  const js = readFile(mapCoreJsPath)
  const wxml = readFile(mapCoreWxmlPath)

  assert.ok(js.includes('boundaryLimit'))
  assert.ok(wxml.includes('boundary-limit="{{boundaryLimit}}"'))
})

module.exports = tests
