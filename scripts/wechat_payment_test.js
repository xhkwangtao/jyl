#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const ROOT_DIR = path.resolve(__dirname, '..')
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, 'wechat_payment_test.config.json')
const DEFAULT_EXAMPLE_CONFIG_PATH = path.resolve(__dirname, 'wechat_payment_test.config.example.json')
const DEFAULT_STATE_PATH = path.resolve(__dirname, '.wechat_payment_test.state.json')
const DEFAULT_API_BASE_URL = 'https://api.mch.weixin.qq.com'
const USER_AGENT = 'jyl-payment-test/1.0'

const HELP_TEXT = `
微信支付 Native 下单测试脚本

用法:
  node scripts/wechat_payment_test.js <command> [options]

命令:
  help            查看帮助
  native-prepay   生成 Native 支付订单，返回 code_url
  query-order     通过商户订单号查单，获取 transaction_id

常用参数:
  --config <path>          配置文件路径，默认 scripts/wechat_payment_test.config.json
  --amount <value>         覆盖金额，单位分
  --description <value>    覆盖商品描述
  --notify-url <value>     覆盖支付回调地址
  --out-trade-no <value>   指定商户订单号；不传时按前缀自动生成
  --dry-run                只打印请求，不实际调用微信支付接口

推荐流程:
  1. 复制示例配置:
     cp scripts/wechat_payment_test.config.example.json scripts/wechat_payment_test.config.json
  2. 执行下单:
     node scripts/wechat_payment_test.js native-prepay
  3. 将返回的 code_url 转成二维码后，用微信扫一扫完成支付
  4. 支付成功后查询订单:
     node scripts/wechat_payment_test.js query-order

说明:
  - 当前脚本按普通商户模式编写。
  - 为了让后续分账可测试，下单时默认会带 settle_info.profit_sharing=true。
  - notify_url 可以先用一个临时可访问地址；即使回调处理未就绪，也可以后续主动查单获取 transaction_id。
`.trim()

function parseArgs(argv) {
  const result = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (!current.startsWith('--')) {
      result._.push(current)
      continue
    }

    const raw = current.slice(2)
    const [key, inlineValue] = raw.split('=')

    if (inlineValue !== undefined) {
      result[key] = inlineValue
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      result[key] = true
      continue
    }

    result[key] = next
    index += 1
  }

  return result
}

function getNestedValue(object, keyPath) {
  return keyPath.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined
    }

    return current[key]
  }, object)
}

function getOptionOrConfig(options, config, optionKey, configKey, fallback = '') {
  const optionValue = options[optionKey]
  if (optionValue !== undefined && optionValue !== null && optionValue !== '') {
    return optionValue
  }

  const configValue = getNestedValue(config, configKey)
  if (configValue !== undefined && configValue !== null && configValue !== '') {
    return configValue
  }

  return fallback
}

function coerceBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }

  if (typeof value === 'boolean') {
    return value
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase())
}

function requireNonEmpty(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`缺少必填配置: ${label}`)
  }

  return String(value).trim()
}

function requirePositiveInteger(value, label) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} 必须是大于 0 的整数`)
  }

  return numeric
}

function resolveFilePath(filePath, baseDir) {
  if (!filePath) {
    return ''
  }

  if (path.isAbsolute(filePath)) {
    return filePath
  }

  return path.resolve(baseDir, filePath)
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `未找到配置文件: ${configPath}\n请先复制示例文件: cp ${path.relative(ROOT_DIR, DEFAULT_EXAMPLE_CONFIG_PATH)} ${path.relative(ROOT_DIR, DEFAULT_CONFIG_PATH)}`
    )
  }

  return loadJsonFile(configPath)
}

function loadState() {
  if (!fs.existsSync(DEFAULT_STATE_PATH)) {
    return {}
  }

  try {
    return loadJsonFile(DEFAULT_STATE_PATH)
  } catch (error) {
    return {}
  }
}

function saveState(state = {}) {
  saveJsonFile(DEFAULT_STATE_PATH, state)
}

function buildTimestampCode() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('')
}

function createOutTradeNo(prefix = 'jylpay') {
  const normalizedPrefix = String(prefix || 'jylpay')
    .replace(/[^0-9A-Za-z_\-|*@]/g, '')
    .slice(0, 24) || 'jylpay'
  const nonce = crypto.randomBytes(3).toString('hex')

  return `${normalizedPrefix}_${buildTimestampCode()}_${nonce}`
}

function buildQueryString(query = {}) {
  const searchParams = new URLSearchParams()

  Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .forEach(([key, value]) => {
      searchParams.append(key, String(value))
    })

  return searchParams.toString()
}

function parseResponseBody(rawText) {
  if (!rawText) {
    return null
  }

  try {
    return JSON.parse(rawText)
  } catch (error) {
    return rawText
  }
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2)
}

class WechatPayMerchantClient {
  constructor(config = {}, configPath, options = {}) {
    this.config = config
    this.configDir = path.dirname(configPath)
    this.skipCrypto = Boolean(options.skipCrypto)
    this.mode = String(config.mode || 'merchant').trim().toLowerCase() || 'merchant'

    if (this.mode !== 'merchant') {
      throw new Error(`当前脚本只支持普通商户模式，配置 mode 必须为 merchant，当前值为: ${config.mode}`)
    }

    this.apiBaseUrl = String(config.api_base_url || DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL
    this.mchid = requireNonEmpty(config.mchid, 'mchid')
    this.certificateSerialNo = this.skipCrypto
      ? String(config.certificate_serial_no || 'DRY_RUN_CERT_SERIAL').trim()
      : requireNonEmpty(config.certificate_serial_no, 'certificate_serial_no')
    this.privateKeyPath = resolveFilePath(String(config.private_key_path || '').trim(), this.configDir)
    this.privateKey = null

    if (!this.skipCrypto) {
      requireNonEmpty(config.private_key_path, 'private_key_path')
      this.privateKey = crypto.createPrivateKey(fs.readFileSync(this.privateKeyPath, 'utf8'))
    }
  }

  buildAuthorization(method, canonicalUrl, bodyText) {
    if (this.skipCrypto) {
      return 'WECHATPAY2-SHA256-RSA2048 mchid="DRY_RUN",nonce_str="DRY_RUN",timestamp="0",serial_no="DRY_RUN",signature="DRY_RUN"'
    }

    const nonce = crypto.randomBytes(16).toString('hex')
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const message = [
      method.toUpperCase(),
      canonicalUrl,
      timestamp,
      nonce,
      bodyText,
      ''
    ].join('\n')

    const signature = crypto.sign('RSA-SHA256', Buffer.from(message, 'utf8'), this.privateKey).toString('base64')

    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.certificateSerialNo}",signature="${signature}"`
  }

  async request(method, apiPath, options = {}) {
    const requestMethod = method.toUpperCase()
    const queryString = buildQueryString(options.query || {})
    const canonicalUrl = `${apiPath}${queryString ? `?${queryString}` : ''}`
    const bodyText = options.body ? JSON.stringify(options.body) : ''
    const urlObject = new URL(this.apiBaseUrl)
    const requestOptions = {
      protocol: urlObject.protocol,
      hostname: urlObject.hostname,
      port: urlObject.port || undefined,
      method: requestMethod,
      path: canonicalUrl,
      headers: {
        Accept: 'application/json',
        Authorization: this.buildAuthorization(requestMethod, canonicalUrl, bodyText),
        'User-Agent': USER_AGENT
      }
    }

    if (bodyText) {
      requestOptions.headers['Content-Type'] = 'application/json'
      requestOptions.headers['Content-Length'] = Buffer.byteLength(bodyText)
    }

    return new Promise((resolve, reject) => {
      const request = https.request(requestOptions, (response) => {
        const chunks = []

        response.on('data', (chunk) => {
          chunks.push(chunk)
        })

        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8')
          const parsedBody = parseResponseBody(rawBody)
          const payload = {
            statusCode: response.statusCode || 0,
            headers: response.headers,
            body: parsedBody
          }

          if ((response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300) {
            resolve(payload)
            return
          }

          const error = new Error(
            `微信支付接口请求失败 (${payload.statusCode})${rawBody ? `: ${typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody)}` : ''}`
          )
          error.response = payload
          reject(error)
        })
      })

      request.on('error', reject)

      if (bodyText) {
        request.write(bodyText)
      }

      request.end()
    })
  }
}

function buildDryRunPayload(method, apiPath, query, body) {
  return {
    method,
    apiPath,
    query: query || {},
    body: body || null
  }
}

async function executeCommandRequest(client, options, method, apiPath, query, body) {
  if (coerceBoolean(options['dry-run'], false)) {
    return {
      dryRun: true,
      request: buildDryRunPayload(method, apiPath, query, body)
    }
  }

  const response = await client.request(method, apiPath, { query, body })
  return {
    dryRun: false,
    response
  }
}

function printCommandResult(title, payload) {
  console.log(`\n=== ${title} ===`)

  if (payload.dryRun) {
    console.log('dry-run: true')
    console.log(prettyJson(payload.request))
    return
  }

  const requestId = payload.response?.headers?.['request-id']
    || payload.response?.headers?.['wechatpay-request-id']

  console.log(`HTTP ${payload.response.statusCode}`)
  if (requestId) {
    console.log(`Request-Id: ${requestId}`)
  }
  console.log(prettyJson(payload.response.body))
}

function buildOrderContext(config, options, state) {
  return {
    appid: getOptionOrConfig(options, config, 'appid', 'appid'),
    amount: requirePositiveInteger(
      getOptionOrConfig(options, config, 'amount', 'payment.amount.total'),
      'payment.amount.total / --amount'
    ),
    currency: getOptionOrConfig(options, config, 'currency', 'payment.amount.currency', 'CNY'),
    description: requireNonEmpty(
      getOptionOrConfig(options, config, 'description', 'payment.description'),
      'payment.description / --description'
    ),
    notifyUrl: requireNonEmpty(
      getOptionOrConfig(options, config, 'notify-url', 'payment.notify_url'),
      'payment.notify_url / --notify-url'
    ),
    outTradeNo: options['out-trade-no'] || state.last_out_trade_no || '',
    outTradeNoPrefix: getOptionOrConfig(options, config, 'out-trade-no-prefix', 'payment.out_trade_no_prefix', 'jylpay'),
    profitSharing: coerceBoolean(
      getOptionOrConfig(options, config, 'profit-sharing', 'payment.settle_info.profit_sharing', true),
      true
    )
  }
}

async function handleNativePrepay(client, config, options) {
  const context = buildOrderContext(config, options, {})
  const outTradeNo = options['out-trade-no'] || createOutTradeNo(context.outTradeNoPrefix)
  const body = {
    appid: requireNonEmpty(context.appid, 'appid / --appid'),
    mchid: client.mchid,
    description: context.description,
    out_trade_no: outTradeNo,
    notify_url: context.notifyUrl,
    amount: {
      total: context.amount,
      currency: context.currency
    },
    settle_info: {
      profit_sharing: context.profitSharing
    }
  }

  const result = await executeCommandRequest(client, options, 'POST', '/v3/pay/transactions/native', {}, body)

  if (!result.dryRun) {
    saveState({
      last_command: 'native-prepay',
      last_out_trade_no: outTradeNo,
      last_code_url: result.response?.body?.code_url || '',
      updated_at: new Date().toISOString()
    })
  }

  return result
}

async function handleQueryOrder(client, config, options, state) {
  const context = buildOrderContext(config, options, state)
  const outTradeNo = requireNonEmpty(
    options['out-trade-no'] || context.outTradeNo,
    'out_trade_no / --out-trade-no 或上一次状态文件'
  )
  const result = await executeCommandRequest(
    client,
    options,
    'GET',
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}`,
    {
      mchid: client.mchid
    },
    null
  )

  if (!result.dryRun) {
    saveState({
      last_command: 'query-order',
      last_out_trade_no: outTradeNo,
      last_transaction_id: result.response?.body?.transaction_id || '',
      updated_at: new Date().toISOString()
    })
  }

  return result
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const command = options._[0] || 'help'

  if (command === 'help' || options.help) {
    console.log(HELP_TEXT)
    return
  }

  const configPath = resolveFilePath(options.config || DEFAULT_CONFIG_PATH, process.cwd())
  const config = loadConfig(configPath)
  const dryRun = coerceBoolean(options['dry-run'], false)
  const client = new WechatPayMerchantClient(config, configPath, {
    skipCrypto: dryRun
  })
  const state = loadState()
  let result
  let title = command

  switch (command) {
    case 'native-prepay':
      title = '生成 Native 支付订单'
      result = await handleNativePrepay(client, config, options)
      break
    case 'query-order':
      title = '通过商户订单号查询支付订单'
      result = await handleQueryOrder(client, config, options, state)
      break
    default:
      throw new Error(`未知命令: ${command}\n\n${HELP_TEXT}`)
  }

  printCommandResult(title, result)

  if (!result.dryRun && command === 'native-prepay') {
    console.log('\n后续操作:')
    console.log('1. 将上面的 code_url 转成二维码')
    console.log('2. 用微信扫一扫完成支付')
    console.log('3. 支付后执行: node scripts/wechat_payment_test.js query-order')
  }
}

main().catch((error) => {
  console.error('\n❌ 支付测试脚本执行失败')
  console.error(error.message)

  if (error.response) {
    const requestId = error.response?.headers?.['request-id']
      || error.response?.headers?.['wechatpay-request-id']

    console.error(`HTTP ${error.response.statusCode}`)
    if (requestId) {
      console.error(`Request-Id: ${requestId}`)
    }
    console.error(prettyJson(error.response.body))
  }

  process.exit(1)
})
