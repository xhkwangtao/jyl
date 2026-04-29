const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const testsRoot = path.join(projectRoot, 'tests', 'miniprogram-unit')
const filter = process.argv[2] || ''

function toProjectRelativePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join('/')
}

function findTestFiles(directoryPath) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
  const files = []

  entries.forEach((entry) => {
    const entryPath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...findTestFiles(entryPath))
      return
    }

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(entryPath)
    }
  })

  return files.sort()
}

function reportFailure(relativePath, testName, error) {
  console.error(`not ok - ${relativePath} - ${testName}`)
  console.error(error.stack || String(error))
}

async function run() {
  let testFiles = []

  try {
    testFiles = findTestFiles(testsRoot)
  } catch (error) {
    console.error(error.stack || String(error))
    process.exitCode = 1
    return
  }

  const matchingFiles = testFiles.filter((filePath) => {
    return !filter || toProjectRelativePath(filePath).includes(filter)
  }).sort()

  if (matchingFiles.length === 0) {
    console.error('No matching test files found.')
    process.exitCode = 1
    return
  }

  let failureCount = 0

  for (const filePath of matchingFiles) {
    const relativePath = toProjectRelativePath(filePath)
    let testCases

    try {
      testCases = require(filePath)
    } catch (error) {
      failureCount += 1
      reportFailure(relativePath, '<load>', error)
      continue
    }

    if (!Array.isArray(testCases)) {
      failureCount += 1
      reportFailure(relativePath, '<load>', new TypeError('Test module must export an array of test cases.'))
      continue
    }

    for (const testCase of testCases) {
      try {
        await Promise.resolve(testCase.run())
        console.log(`ok - ${relativePath} - ${testCase.name}`)
      } catch (error) {
        failureCount += 1
        reportFailure(relativePath, testCase.name, error)
      }
    }
  }

  if (failureCount > 0) {
    process.exitCode = 1
  }
}

run()
