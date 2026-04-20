#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const ROOT_DIR = path.resolve(__dirname, '..')
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, 'wechat_profitsharing_test.config.json')
const DEFAULT_EXAMPLE_CONFIG_PATH = path.resolve(__dirname, 'wechat_profitsharing_test.config.example.json')
const DEFAULT_STATE_PATH = path.resolve(__dirname, '.wechat_profitsharing_test.state.json')
const DEFAULT_API_BASE_URL = 'https://api.mch.weixin.qq.com'
const USER_AGENT = 'jyl-profitsharing-test/1.0'

const HELP_TEXT = `
微信支付分账测试脚本

用法:
  node scripts/wechat_profitsharing_test.js <command> [options]

命令:
  help                   查看帮助
  query-max-ratio        查询最大分账比例（仅服务商模式）
  query-amount           查询订单剩余待分金额
  add-receiver           添加分账接收方
  profitsharing          发起分账
  query-order            查询分账结果
  unfreeze               解冻剩余待分金额

常用参数:
  --config <path>            配置文件路径，默认 scripts/wechat_profitsharing_test.config.json
  --transaction-id <value>   覆盖配置中的 transaction_id
  --out-order-no <value>     指定商户分账单号；不传时按前缀自动生成
  --amount <value>           覆盖分账金额，单位分
  --description <value>      覆盖描述
  --receiver-account <value> 覆盖接收方账号
  --receiver-name <value>    覆盖接收方名称
  --receiver-type <value>    覆盖接收方类型
  --relation-type <value>    覆盖接收方关系类型
  --dry-run                  只打印请求，不实际调用微信支付接口

 推荐流程:
  1. 复制示例配置:
     cp scripts/wechat_profitsharing_test.config.example.json scripts/wechat_profitsharing_test.config.json
  2. 将私钥、公钥文件放入 .local-secrets/
  3. 先查询:
     node scripts/wechat_profitsharing_test.js query-max-ratio
     node scripts/wechat_profitsharing_test.js query-amount
  4. 添加接收方:
     node scripts/wechat_profitsharing_test.js add-receiver
  5. 发起分账:
     node scripts/wechat_profitsharing_test.js profitsharing
  6. 查询结果:
     node scripts/wechat_profitsharing_test.js query-order

说明:
  - 当前脚本支持普通商户 merchant 和普通服务商 partner 两种模式。
  - 查询类命令默认优先读取配置；query-order 若未传 --out-order-no，会回退到上一次成功请求写入的状态文件。
  - 分账相关真实能力要求原支付订单在下单时已声明需要分账。
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

  const normalized = String(value).trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized)
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

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
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
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ]

  return parts.join('')
}

function createOutOrderNo(prefix = 'jylps') {
  const normalizedPrefix = String(prefix || 'jylps')
    .replace(/[^0-9A-Za-z_\-|*@]/g, '')
    .slice(0, 24) || 'jylps'
  const nonce = crypto.randomBytes(3).toString('hex')

  return `${normalizedPrefix}_${buildTimestampCode()}_${nonce}`
}

function sortQueryEntries(query = {}) {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
}

function buildQueryString(query = {}) {
  const searchParams = new URLSearchParams()

  sortQueryEntries(query).forEach(([key, value]) => {
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

function normalizeMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase()

  if (!normalized) {
    return 'merchant'
  }

  if (normalized === 'partner') {
    return 'partner'
  }

  if (normalized === 'merchant') {
    return 'merchant'
  }

  throw new Error(`不支持的 mode: ${value}，仅支持 merchant 或 partner`)
}

class WechatPayClient {
  constructor(config = {}, configPath, options = {}) {
    this.config = config
    this.configDir = path.dirname(configPath)
    this.skipCrypto = Boolean(options.skipCrypto)
    this.mode = normalizeMode(config.mode)
    this.apiBaseUrl = String(config.api_base_url || DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL
    this.mchid = requireNonEmpty(config.mchid, 'mchid')
    this.subMchid = this.mode === 'partner'
      ? requireNonEmpty(config.sub_mchid, 'sub_mchid')
      : String(config.sub_mchid || '').trim()
    this.certificateSerialNo = this.skipCrypto
      ? String(config.certificate_serial_no || 'DRY_RUN_CERT_SERIAL').trim()
      : requireNonEmpty(config.certificate_serial_no, 'certificate_serial_no')
    this.wechatpaySerial = this.skipCrypto
      ? String(config.wechatpay_serial || 'DRY_RUN_WECHATPAY_SERIAL').trim()
      : requireNonEmpty(config.wechatpay_serial, 'wechatpay_serial')
    this.privateKeyPath = resolveFilePath(String(config.private_key_path || '').trim(), this.configDir)
    this.wechatpayPublicKeyPath = resolveFilePath(String(config.wechatpay_public_key_path || '').trim(), this.configDir)
    this.privateKey = null
    this.wechatpayPublicKey = null

    if (!this.skipCrypto) {
      requireNonEmpty(config.private_key_path, 'private_key_path')
      requireNonEmpty(config.wechatpay_public_key_path, 'wechatpay_public_key_path')
      this.privateKey = crypto.createPrivateKey(fs.readFileSync(this.privateKeyPath, 'utf8'))
      this.wechatpayPublicKey = crypto.createPublicKey(fs.readFileSync(this.wechatpayPublicKeyPath, 'utf8'))
    }
  }

  encryptSensitiveValue(value) {
    if (this.skipCrypto) {
      return `DRY_RUN_ENCRYPTED(${String(value)})`
    }

    return crypto.publicEncrypt({
      key: this.wechatpayPublicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1'
    }, Buffer.from(String(value), 'utf8')).toString('base64')
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
      requestOptions.headers['Wechatpay-Serial'] = this.wechatpaySerial
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

function buildReceiverConfig(config, options) {
  const type = requireNonEmpty(
    getOptionOrConfig(options, config, 'receiver-type', 'receiver.type'),
    'receiver.type / --receiver-type'
  )
  const account = requireNonEmpty(
    getOptionOrConfig(options, config, 'receiver-account', 'receiver.account'),
    'receiver.account / --receiver-account'
  )
  const name = getOptionOrConfig(options, config, 'receiver-name', 'receiver.name')
  const relationType = requireNonEmpty(
    getOptionOrConfig(options, config, 'relation-type', 'receiver.relation_type'),
    'receiver.relation_type / --relation-type'
  )
  const customRelation = getOptionOrConfig(options, config, 'custom-relation', 'receiver.custom_relation')

  return {
    type,
    account,
    name,
    relationType,
    customRelation
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

function buildCommonContext(config, options, state) {
  const transactionId = getOptionOrConfig(options, config, 'transaction-id', 'transaction_id')
  const appid = getOptionOrConfig(options, config, 'appid', 'appid')
  const subAppid = getOptionOrConfig(options, config, 'sub-appid', 'sub_appid')

  return {
    transactionId,
    appid,
    subAppid,
    outOrderNo: options['out-order-no'] || state.last_out_order_no || ''
  }
}

async function handleQueryMaxRatio(client, options) {
  if (client.mode !== 'partner') {
    throw new Error('query-max-ratio 仅适用于服务商模式，普通商户请在商户平台的“产品中心 -> 分账 -> 分账管理比例”中查看')
  }

  return executeCommandRequest(client, options, 'GET', `/v3/profitsharing/merchant-configs/${encodeURIComponent(client.subMchid)}`, {}, null)
}

async function handleQueryAmount(client, config, options) {
  const { transactionId } = buildCommonContext(config, options, {})
  const resolvedTransactionId = requireNonEmpty(transactionId, 'transaction_id / --transaction-id')

  return executeCommandRequest(
    client,
    options,
    'GET',
    `/v3/profitsharing/transactions/${encodeURIComponent(resolvedTransactionId)}/amounts`,
    {},
    null
  )
}

async function handleAddReceiver(client, config, options) {
  const { appid, subAppid } = buildCommonContext(config, options, {})
  const resolvedAppid = requireNonEmpty(appid, 'appid / --appid')
  const receiver = buildReceiverConfig(config, options)
  const body = {
    appid: resolvedAppid,
    type: receiver.type,
    account: receiver.account,
    relation_type: receiver.relationType
  }

  if (client.mode === 'partner') {
    body.sub_mchid = client.subMchid
  }

  if (subAppid) {
    body.sub_appid = subAppid
  }

  if (receiver.customRelation) {
    body.custom_relation = receiver.customRelation
  }

  if (receiver.type === 'MERCHANT_ID') {
    body.name = client.encryptSensitiveValue(requireNonEmpty(receiver.name, 'receiver.name / --receiver-name'))
  } else if (receiver.name) {
    body.name = client.encryptSensitiveValue(receiver.name)
  }

  return executeCommandRequest(client, options, 'POST', '/v3/profitsharing/receivers/add', {}, body)
}

async function handleProfitsharing(client, config, options, state) {
  const context = buildCommonContext(config, options, state)
  const receiver = buildReceiverConfig(config, options)
  const transactionId = requireNonEmpty(context.transactionId, 'transaction_id / --transaction-id')
  const amount = requirePositiveInteger(
    getOptionOrConfig(options, config, 'amount', 'profitsharing.amount'),
    'profitsharing.amount / --amount'
  )
  const description = requireNonEmpty(
    getOptionOrConfig(options, config, 'description', 'profitsharing.description'),
    'profitsharing.description / --description'
  )
  const outOrderNo = options['out-order-no']
    || createOutOrderNo(getOptionOrConfig(options, config, 'out-order-no-prefix', 'profitsharing.out_order_no_prefix', 'jylps'))
  const body = {
    transaction_id: transactionId,
    out_order_no: outOrderNo,
    receivers: [
      {
        type: receiver.type,
        account: receiver.account,
        amount,
        description
      }
    ],
    unfreeze_unsplit: coerceBoolean(
      getOptionOrConfig(options, config, 'unfreeze-unsplit', 'profitsharing.unfreeze_unsplit', false),
      false
    )
  }

  if (client.mode === 'partner') {
    body.sub_mchid = client.subMchid
  }

  if (context.appid) {
    body.appid = context.appid
  }

  if (context.subAppid) {
    body.sub_appid = context.subAppid
  }

  const result = await executeCommandRequest(client, options, 'POST', '/v3/profitsharing/orders', {}, body)

  if (!result.dryRun) {
    saveState({
      last_command: 'profitsharing',
      last_out_order_no: outOrderNo,
      last_transaction_id: transactionId,
      updated_at: new Date().toISOString()
    })
  }

  return result
}

async function handleQueryOrder(client, config, options, state) {
  const context = buildCommonContext(config, options, state)
  const transactionId = requireNonEmpty(context.transactionId || state.last_transaction_id, 'transaction_id / --transaction-id')
  const outOrderNo = requireNonEmpty(context.outOrderNo, 'out_order_no / --out-order-no 或上一次状态文件')

  return executeCommandRequest(
    client,
    options,
    'GET',
    `/v3/profitsharing/orders/${encodeURIComponent(outOrderNo)}`,
    client.mode === 'partner'
      ? {
        sub_mchid: client.subMchid,
        transaction_id: transactionId
      }
      : {
        transaction_id: transactionId
      },
    null
  )
}

async function handleUnfreeze(client, config, options, state) {
  const context = buildCommonContext(config, options, state)
  const transactionId = requireNonEmpty(context.transactionId || state.last_transaction_id, 'transaction_id / --transaction-id')
  const outOrderNo = options['out-order-no']
    || createOutOrderNo(getOptionOrConfig(options, config, 'out-order-no-prefix', 'unfreeze.out_order_no_prefix', 'jyluf'))
  const description = requireNonEmpty(
    getOptionOrConfig(options, config, 'description', 'unfreeze.description'),
    'unfreeze.description / --description'
  )
  const body = {
    transaction_id: transactionId,
    out_order_no: outOrderNo,
    description
  }

  if (client.mode === 'partner') {
    body.sub_mchid = client.subMchid
  }

  const result = await executeCommandRequest(client, options, 'POST', '/v3/profitsharing/orders/unfreeze', {}, body)

  if (!result.dryRun) {
    saveState({
      last_command: 'unfreeze',
      last_out_order_no: outOrderNo,
      last_transaction_id: transactionId,
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
  config.mode = normalizeMode(config.mode)

  const client = new WechatPayClient(config, configPath, {
    skipCrypto: dryRun
  })
  const state = loadState()
  let result
  let title = command

  switch (command) {
    case 'query-max-ratio':
      title = '查询最大分账比例'
      result = await handleQueryMaxRatio(client, options)
      break
    case 'query-amount':
      title = '查询剩余待分金额'
      result = await handleQueryAmount(client, config, options)
      break
    case 'add-receiver':
      title = '添加分账接收方'
      result = await handleAddReceiver(client, config, options)
      break
    case 'profitsharing':
      title = '发起分账'
      result = await handleProfitsharing(client, config, options, state)
      break
    case 'query-order':
      title = '查询分账结果'
      result = await handleQueryOrder(client, config, options, state)
      break
    case 'unfreeze':
      title = '解冻剩余待分金额'
      result = await handleUnfreeze(client, config, options, state)
      break
    default:
      throw new Error(`未知命令: ${command}\n\n${HELP_TEXT}`)
  }

  printCommandResult(title, result)
}

main().catch((error) => {
  console.error('\n❌ 分账测试脚本执行失败')
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
