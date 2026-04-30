const assert = require('node:assert/strict')
const fs = require('fs')

const tests = []
const wxmlPath = require.resolve('../../miniprogram/subpackages/guide/pages/payment/subscribe/subscribe.wxml')
const jsPath = require.resolve('../../miniprogram/subpackages/guide/pages/payment/subscribe/subscribe.js')

function test(name, run) {
  tests.push({ name, run })
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

test('subscribe page copy uses study-prop wording instead of VIP wording', () => {
  const wxml = readFile(wxmlPath)
  const js = readFile(jsPath)

  assert.ok(wxml.includes('title="购买研学道具"'))
  assert.ok(wxml.includes('当前提供统一研学道具套装'))
  assert.ok(wxml.includes('购买成功后请去游客中心索取研学道具'))
  assert.ok(wxml.includes('统一套装'))
  assert.ok(wxml.includes('研学道具统一套装'))
  assert.ok(wxml.includes('确认购买'))
  assert.ok(!wxml.includes('title="开通VIP"'))
  assert.ok(!wxml.includes('请选择所需研学道具并完成支付'))
  assert.ok(!wxml.includes('抢购中'))
  assert.ok(!wxml.includes('立即购买'))

  assert.ok(js.includes('研学道具购买服务协议'))
  assert.ok(js.includes("title: '购买成功'"))
  assert.ok(!js.includes('本协议是您与九眼楼AI伴游助手之间关于使用VIP会员服务的协议'))
})

module.exports = tests
