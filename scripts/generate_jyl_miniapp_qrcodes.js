#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const https = require('https')

const { POI_SOURCE_CODE_ITEMS } = require('../miniprogram/utils/poi-source-code.js')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const PROJECT_CONFIG_PATH = path.join(PROJECT_ROOT, 'miniprogram', 'project.config.json')
const LOCAL_WECHAT_CONFIG_PATH = path.join(__dirname, 'wechat_config.json')
const TOKEN_CACHE_PATH = path.join(__dirname, '.wechat_token_cache.json')
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs', 'poi-qrcodes')

const DEFAULT_PAGE = 'pages/landing/index'
const DEFAULT_SOURCE = 'bsp'
const DEFAULT_WIDTH = 1280
const DEFAULT_ENV_VERSION = 'release'
const TOKEN_EXPIRE_BUFFER_SECONDS = 60

function loadJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`读取 JSON 失败: ${filePath}\n${error.message}`)
  }
}

function readProjectAppId() {
  const projectConfig = loadJsonFile(PROJECT_CONFIG_PATH)
  return projectConfig && projectConfig.appid ? String(projectConfig.appid).trim() : ''
}

function resolveWechatCredentials() {
  const localConfig = loadJsonFile(LOCAL_WECHAT_CONFIG_PATH) || {}
  const appid = String(
    process.env.WECHAT_APPID
      || localConfig.appid
      || readProjectAppId()
      || ''
  ).trim()
  const appsecret = String(
    process.env.WECHAT_APPSECRET
      || localConfig.appsecret
      || ''
  ).trim()

  if (!appid) {
    throw new Error('未找到小程序 AppID。可通过 WECHAT_APPID 或 miniprogram/project.config.json 提供。')
  }

  if (!appsecret) {
    throw new Error(
      [
        '未找到小程序 AppSecret。',
        '请通过环境变量 WECHAT_APPSECRET 提供，或在 scripts/wechat_config.json 中填写：',
        '{"appid":"你的AppID","appsecret":"你的AppSecret"}'
      ].join('\n')
    )
  }

  return { appid, appsecret }
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    page: DEFAULT_PAGE,
    source: DEFAULT_SOURCE,
    width: DEFAULT_WIDTH,
    envVersion: DEFAULT_ENV_VERSION,
    only: [],
    overwrite: false,
    dryRun: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--output-dir' || arg === '-o') {
      options.outputDir = path.resolve(argv[index + 1] || '')
      index += 1
      continue
    }

    if (arg === '--page') {
      options.page = String(argv[index + 1] || '').trim() || DEFAULT_PAGE
      index += 1
      continue
    }

    if (arg === '--source') {
      options.source = String(argv[index + 1] || '').trim() || DEFAULT_SOURCE
      index += 1
      continue
    }

    if (arg === '--env-version') {
      options.envVersion = String(argv[index + 1] || '').trim() || DEFAULT_ENV_VERSION
      index += 1
      continue
    }

    if (arg === '--width') {
      const width = Number(argv[index + 1])
      if (!Number.isFinite(width) || width <= 0 || width > 1280) {
        throw new Error('`--width` 必须是 1 到 1280 之间的数字。')
      }
      options.width = Math.round(width)
      index += 1
      continue
    }

    if (arg === '--only') {
      options.only = String(argv[index + 1] || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
      index += 1
      continue
    }

    if (arg === '--overwrite') {
      options.overwrite = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printHelpAndExit(0)
    }

    throw new Error(`未知参数: ${arg}`)
  }

  return options
}

function printHelpAndExit(exitCode) {
  const helpText = `
九眼楼小程序码批量生成脚本

用法：
  node scripts/generate_jyl_miniapp_qrcodes.js [options]

选项：
  --output-dir, -o   输出目录，默认 docs/poi-qrcodes
  --page             小程序页面路径，默认 ${DEFAULT_PAGE}
  --source           固定来源码，默认 ${DEFAULT_SOURCE}
  --env-version      release | trial | develop，默认 ${DEFAULT_ENV_VERSION}
  --width            二维码宽度，默认 ${DEFAULT_WIDTH}
  --only             仅生成指定 scene 码，逗号分隔，例如 jqdm,jyl,mtz
  --overwrite        已存在同名文件时覆盖重生成
  --dry-run          仅输出清单，不调用微信接口
  --help, -h         显示帮助

鉴权方式：
  1. 优先读取环境变量 WECHAT_APPID / WECHAT_APPSECRET
  2. 其次读取 scripts/wechat_config.json（已加入 .gitignore）
  3. AppID 若未显式提供，则回退读取 miniprogram/project.config.json

固定生成规则：
  page  = ${DEFAULT_PAGE}
  width = ${DEFAULT_WIDTH}
  每个二维码的 scene payload 形如：s=${DEFAULT_SOURCE}&scene=jqdm
`.trim()

  console.log(helpText)
  process.exit(exitCode)
}

function sanitizeFilename(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildScenePayload(source, sceneCode) {
  return `s=${source}&scene=${sceneCode}`
}

function ensureSceneLength(scenePayload) {
  if (scenePayload.length > 32) {
    throw new Error(`scene 超过 32 字符限制: ${scenePayload}`)
  }
}

function buildPoiRecords(options) {
  const sortedItems = [...POI_SOURCE_CODE_ITEMS].sort((left, right) => {
    return Number(left.markerId) - Number(right.markerId)
  })

  const filteredItems = options.only.length
    ? sortedItems.filter((item) => options.only.includes(item.canonicalSourceCode))
    : sortedItems

  return filteredItems.map((item) => {
    const sceneCode = item.canonicalSourceCode
    const scenePayload = buildScenePayload(options.source, sceneCode)

    ensureSceneLength(scenePayload)

    const fileBaseName = `${String(item.markerId).padStart(2, '0')}-${sceneCode}-${sanitizeFilename(item.name)}`
    const pngFileName = `${fileBaseName}.png`

    return {
      markerId: item.markerId,
      pointId: item.pointId,
      name: item.name,
      sceneCode,
      source: options.source,
      scenePayload,
      landingPath: `${options.page}?s=${options.source}&scene=${sceneCode}`,
      fileBaseName,
      pngFileName
    }
  })
}

function requestJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, options, (response) => {
      const chunks = []

      response.on('data', (chunk) => {
        chunks.push(chunk)
      })

      response.on('end', () => {
        const payload = Buffer.concat(chunks).toString('utf8')

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${payload}`))
          return
        }

        try {
          resolve(JSON.parse(payload))
        } catch (error) {
          reject(new Error(`解析 JSON 失败: ${error.message}\n原始返回: ${payload.slice(0, 200)}`))
        }
      })
    })

    request.on('error', reject)

    if (body) {
      request.write(body)
    }

    request.end()
  })
}

function requestBinary(url, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload))
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(body.length)
      }
    }, (response) => {
      const chunks = []

      response.on('data', (chunk) => {
        chunks.push(chunk)
      })

      response.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const contentType = String(response.headers['content-type'] || '')

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${buffer.toString('utf8')}`))
          return
        }

        if (contentType.includes('application/json') || contentType.includes('text/plain')) {
          let parsedError = null

          try {
            parsedError = JSON.parse(buffer.toString('utf8'))
          } catch (error) {
            parsedError = buffer.toString('utf8')
          }

          reject(new Error(`微信接口返回错误: ${JSON.stringify(parsedError)}`))
          return
        }

        resolve(buffer)
      })
    })

    request.on('error', reject)
    request.write(body)
    request.end()
  })
}

function loadCachedToken() {
  const cache = loadJsonFile(TOKEN_CACHE_PATH)

  if (!cache || !cache.access_token || !cache.expire_time) {
    return ''
  }

  if (Number(cache.expire_time) <= Date.now() / 1000 + TOKEN_EXPIRE_BUFFER_SECONDS) {
    return ''
  }

  return String(cache.access_token)
}

function cacheToken(accessToken, expiresInSeconds) {
  const payload = {
    access_token: accessToken,
    expire_time: Math.floor(Date.now() / 1000) + Number(expiresInSeconds || 7200)
  }

  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(payload, null, 2))
}

async function fetchAccessToken(credentials) {
  const cachedToken = loadCachedToken()

  if (cachedToken) {
    return cachedToken
  }

  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(credentials.appid)}&secret=${encodeURIComponent(credentials.appsecret)}`
  const tokenResponse = await requestJson(tokenUrl, { method: 'GET' })

  if (!tokenResponse.access_token) {
    throw new Error(`获取 access_token 失败: ${JSON.stringify(tokenResponse)}`)
  }

  cacheToken(tokenResponse.access_token, tokenResponse.expires_in)
  return tokenResponse.access_token
}

function ensureOutputDir(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true })
}

function writeManifest(outputDir, records) {
  const manifestPath = path.join(outputDir, 'manifest.json')
  const csvPath = path.join(outputDir, 'manifest.csv')

  fs.writeFileSync(manifestPath, JSON.stringify(records, null, 2))

  const csvHeader = [
    'markerId',
    'pointId',
    'name',
    'source',
    'sceneCode',
    'scenePayload',
    'landingPath',
    'pngFileName'
  ]

  const csvLines = [
    csvHeader.join(','),
    ...records.map((record) => {
      return [
        record.markerId,
        record.pointId,
        record.name,
        record.source,
        record.sceneCode,
        record.scenePayload,
        record.landingPath,
        record.pngFileName
      ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')
    })
  ]

  fs.writeFileSync(csvPath, `${csvLines.join('\n')}\n`)
}

async function generateQrcode(accessToken, record, options) {
  const requestUrl = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`
  const payload = {
    scene: record.scenePayload,
    page: options.page,
    env_version: options.envVersion,
    width: options.width,
    check_path: false
  }

  return requestBinary(requestUrl, payload)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const records = buildPoiRecords(options)

  if (!records.length) {
    throw new Error('没有可生成的点位记录，请检查 `--only` 参数。')
  }

  ensureOutputDir(options.outputDir)
  writeManifest(options.outputDir, records)

  console.log(`📦 输出目录: ${options.outputDir}`)
  console.log(`🧭 页面路径: ${options.page}`)
  console.log(`🔖 固定来源码: ${options.source}`)
  console.log(`🖼️ 二维码宽度: ${options.width}`)
  console.log(`📝 待生成数量: ${records.length}`)

  if (options.dryRun) {
    console.log('🧪 dry-run 模式，不调用微信接口。')
    return
  }

  const credentials = resolveWechatCredentials()
  const accessToken = await fetchAccessToken(credentials)

  console.log(`🔑 access_token 已就绪: ${accessToken.slice(0, 20)}...`)

  const failures = []

  for (const record of records) {
    const outputPath = path.join(options.outputDir, record.pngFileName)

    if (!options.overwrite && fs.existsSync(outputPath)) {
      console.log(`⏭️ 已存在，跳过: ${record.pngFileName}`)
      continue
    }

    try {
      const imageBuffer = await generateQrcode(accessToken, record, options)
      fs.writeFileSync(outputPath, imageBuffer)
      console.log(`✅ 已生成: ${record.name} -> ${record.pngFileName}`)
    } catch (error) {
      failures.push({
        name: record.name,
        sceneCode: record.sceneCode,
        message: error.message
      })
      console.error(`❌ 生成失败: ${record.name} (${record.sceneCode})\n${error.message}`)
    }
  }

  if (failures.length) {
    const failurePath = path.join(options.outputDir, 'failures.json')
    fs.writeFileSync(failurePath, JSON.stringify(failures, null, 2))
    throw new Error(`生成完成，但有 ${failures.length} 个二维码失败。详情见 ${failurePath}`)
  }

  console.log(`🎉 全部完成，共生成 ${records.length} 个点位二维码。`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
