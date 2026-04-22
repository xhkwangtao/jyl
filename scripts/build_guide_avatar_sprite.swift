#!/usr/bin/env swift

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct PixelBounds: Codable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int

  var maxX: Int { x + width - 1 }
  var maxY: Int { y + height - 1 }

  func padded(maxWidth: Int, maxHeight: Int, padding: Int) -> PixelBounds {
    let minX = max(0, x - padding)
    let minY = max(0, y - padding)
    let maxX = min(maxWidth - 1, self.maxX + padding)
    let maxY = min(maxHeight - 1, self.maxY + padding)
    return PixelBounds(
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    )
  }

  func union(with other: PixelBounds) -> PixelBounds {
    let minX = min(x, other.x)
    let minY = min(y, other.y)
    let maxX = max(self.maxX, other.maxX)
    let maxY = max(self.maxY, other.maxY)
    return PixelBounds(
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    )
  }
}

struct RGBAImage {
  let width: Int
  let height: Int
  var pixels: [UInt8]

  init(width: Int, height: Int, pixels: [UInt8]) {
    self.width = width
    self.height = height
    self.pixels = pixels
  }

  mutating func removeWhiteBackground(threshold: UInt8) {
    let pixelCount = width * height
    var visited = [Bool](repeating: false, count: pixelCount)
    var queue = [Int]()
    queue.reserveCapacity((width * 2) + (height * 2))
    var head = 0

    func isBackgroundPixel(_ pixels: [UInt8], _ index: Int, _ threshold: UInt8) -> Bool {
      let offset = index * 4
      let alpha = pixels[offset + 3]
      if alpha == 0 {
        return true
      }

      return pixels[offset] >= threshold
        && pixels[offset + 1] >= threshold
        && pixels[offset + 2] >= threshold
    }

    func enqueue(_ x: Int, _ y: Int) {
      let index = (y * width) + x
      if visited[index] {
        return
      }
      if !isBackgroundPixel(pixels, index, threshold) {
        return
      }
      visited[index] = true
      queue.append(index)
    }

    for x in 0..<width {
      enqueue(x, 0)
      enqueue(x, height - 1)
    }

    for y in 0..<height {
      enqueue(0, y)
      enqueue(width - 1, y)
    }

    while head < queue.count {
      let index = queue[head]
      head += 1

      let offset = index * 4
      pixels[offset + 3] = 0

      let x = index % width
      let y = index / width

      if x > 0 {
        enqueue(x - 1, y)
      }
      if x + 1 < width {
        enqueue(x + 1, y)
      }
      if y > 0 {
        enqueue(x, y - 1)
      }
      if y + 1 < height {
        enqueue(x, y + 1)
      }
    }
  }

  func visibleBounds(alphaThreshold: UInt8 = 8) -> PixelBounds? {
    var minX = width
    var minY = height
    var maxX = -1
    var maxY = -1

    for y in 0..<height {
      for x in 0..<width {
        let offset = ((y * width) + x) * 4
        if pixels[offset + 3] <= alphaThreshold {
          continue
        }

        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }

    guard maxX >= minX, maxY >= minY else {
      return nil
    }

    return PixelBounds(
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    )
  }

  func cropped(to bounds: PixelBounds) -> RGBAImage {
    var croppedPixels = [UInt8](repeating: 0, count: bounds.width * bounds.height * 4)

    for row in 0..<bounds.height {
      let sourceStart = (((bounds.y + row) * width) + bounds.x) * 4
      let sourceEnd = sourceStart + (bounds.width * 4)
      let destinationStart = row * bounds.width * 4
      croppedPixels[destinationStart..<(destinationStart + bounds.width * 4)] = pixels[sourceStart..<sourceEnd]
    }

    return RGBAImage(width: bounds.width, height: bounds.height, pixels: croppedPixels)
  }
}

struct OutputMetadata: Codable {
  let frameCount: Int
  let columns: Int
  let rows: Int
  let croppedFrameWidth: Int
  let croppedFrameHeight: Int
  let outputFrameWidth: Int
  let outputFrameHeight: Int
  let outputWidth: Int
  let outputHeight: Int
  let sourceWidth: Int
  let sourceHeight: Int
  let cropBounds: PixelBounds
  let backgroundThreshold: UInt8
}

enum ScriptError: Error, CustomStringConvertible {
  case invalidArguments(String)
  case noFramesFound(String)
  case invalidFrame(String)
  case inconsistentFrameSize(expected: String, actual: String)
  case imageReadFailure(String)
  case imageWriteFailure(String)

  var description: String {
    switch self {
    case .invalidArguments(let message),
      .noFramesFound(let message),
      .invalidFrame(let message),
      .imageReadFailure(let message),
      .imageWriteFailure(let message):
      return message
    case .inconsistentFrameSize(let expected, let actual):
      return "frame size mismatch, expected \(expected), got \(actual)"
    }
  }
}

func usage() -> String {
  """
  Usage:
    swift scripts/build_guide_avatar_sprite.swift \
      --input <zip-or-frame-dir> \
      --output <sprite.png> \
      [--columns 5] \
      [--padding 12] \
      [--target-height 280] \
      [--threshold 248]
  """
}

func parseArguments() throws -> (input: URL, output: URL, columns: Int, padding: Int, targetHeight: Int, threshold: UInt8) {
  let arguments = Array(CommandLine.arguments.dropFirst())
  var index = 0

  var inputPath: String?
  var outputPath: String?
  var columns = 5
  var padding = 12
  var targetHeight = 280
  var threshold: UInt8 = 248

  while index < arguments.count {
    let argument = arguments[index]

    guard index + 1 < arguments.count else {
      throw ScriptError.invalidArguments(usage())
    }

    let value = arguments[index + 1]
    switch argument {
    case "--input":
      inputPath = value
    case "--output":
      outputPath = value
    case "--columns":
      guard let parsedColumns = Int(value), parsedColumns > 0 else {
        throw ScriptError.invalidArguments("`--columns` must be a positive integer\n\(usage())")
      }
      columns = parsedColumns
    case "--padding":
      guard let parsedPadding = Int(value), parsedPadding >= 0 else {
        throw ScriptError.invalidArguments("`--padding` must be a non-negative integer\n\(usage())")
      }
      padding = parsedPadding
    case "--target-height":
      guard let parsedTargetHeight = Int(value), parsedTargetHeight > 0 else {
        throw ScriptError.invalidArguments("`--target-height` must be a positive integer\n\(usage())")
      }
      targetHeight = parsedTargetHeight
    case "--threshold":
      guard let parsedThreshold = UInt8(value) else {
        throw ScriptError.invalidArguments("`--threshold` must be between 0 and 255\n\(usage())")
      }
      threshold = parsedThreshold
    default:
      throw ScriptError.invalidArguments("Unknown argument: \(argument)\n\(usage())")
    }

    index += 2
  }

  guard let inputPath, let outputPath else {
    throw ScriptError.invalidArguments(usage())
  }

  return (
    input: URL(fileURLWithPath: inputPath),
    output: URL(fileURLWithPath: outputPath),
    columns: columns,
    padding: padding,
    targetHeight: targetHeight,
    threshold: threshold
  )
}

func numericSuffix(for url: URL) -> Int {
  let baseName = url.deletingPathExtension().lastPathComponent
  guard let lastComponent = baseName.split(separator: "_").last,
        let value = Int(lastComponent) else {
    return Int.max
  }
  return value
}

func loadImage(from url: URL) throws -> RGBAImage {
  let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
  guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions),
        let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    throw ScriptError.imageReadFailure("failed to read image: \(url.path)")
  }

  let width = cgImage.width
  let height = cgImage.height
  var pixels = [UInt8](repeating: 0, count: width * height * 4)

  let colorSpace = CGColorSpaceCreateDeviceRGB()
  let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue

  guard let context = pixels.withUnsafeMutableBytes({ bufferPointer in
    CGContext(
      data: bufferPointer.baseAddress,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: colorSpace,
      bitmapInfo: bitmapInfo
    )
  }) else {
    throw ScriptError.imageReadFailure("failed to build bitmap context: \(url.path)")
  }

  context.interpolationQuality = .none
  context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

  return RGBAImage(width: width, height: height, pixels: pixels)
}

func prepareInputDirectory(from inputURL: URL) throws -> (directory: URL, cleanup: () -> Void) {
  let fileManager = FileManager.default
  let resourceValues = try inputURL.resourceValues(forKeys: [.isDirectoryKey])

  if resourceValues.isDirectory == true {
    return (inputURL, {})
  }

  guard inputURL.pathExtension.lowercased() == "zip" else {
    throw ScriptError.invalidArguments("`--input` must be a directory of PNG frames or a `.zip` file")
  }

  let temporaryDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    .appendingPathComponent("guide-avatar-\(UUID().uuidString)", isDirectory: true)
  try fileManager.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)

  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/bsdtar")
  process.arguments = ["-xf", inputURL.path, "-C", temporaryDirectory.path]
  var environment = ProcessInfo.processInfo.environment
  environment["LANG"] = environment["LANG"] ?? "en_US.UTF-8"
  environment["LC_ALL"] = environment["LC_ALL"] ?? "en_US.UTF-8"
  process.environment = environment
  try process.run()
  process.waitUntilExit()

  guard process.terminationStatus == 0 else {
    throw ScriptError.invalidArguments("failed to extract zip with bsdtar: \(inputURL.path)")
  }

  return (
    temporaryDirectory,
    {
      try? fileManager.removeItem(at: temporaryDirectory)
    }
  )
}

func makeCGImage(from image: RGBAImage) throws -> CGImage {
  let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
    .union(.byteOrder32Big)
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  let data = Data(image.pixels)

  guard let provider = CGDataProvider(data: data as CFData),
        let cgImage = CGImage(
          width: image.width,
          height: image.height,
          bitsPerComponent: 8,
          bitsPerPixel: 32,
          bytesPerRow: image.width * 4,
          space: colorSpace,
          bitmapInfo: bitmapInfo,
          provider: provider,
          decode: nil,
          shouldInterpolate: false,
          intent: .defaultIntent
        ) else {
    throw ScriptError.imageWriteFailure("failed to create sprite CGImage")
  }

  return cgImage
}

func resized(image: RGBAImage, toWidth width: Int, height: Int) throws -> RGBAImage {
  if image.width == width && image.height == height {
    return image
  }

  var resizedPixels = [UInt8](repeating: 0, count: width * height * 4)
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue

  guard let context = resizedPixels.withUnsafeMutableBytes({ bufferPointer in
    CGContext(
      data: bufferPointer.baseAddress,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: colorSpace,
      bitmapInfo: bitmapInfo
    )
  }) else {
    throw ScriptError.imageWriteFailure("failed to build resize context")
  }

  context.interpolationQuality = .high
  let cgImage = try makeCGImage(from: image)
  context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

  return RGBAImage(width: width, height: height, pixels: resizedPixels)
}

func writePNG(image: RGBAImage, to url: URL) throws {
  let cgImage = try makeCGImage(from: image)

  guard let destination = CGImageDestinationCreateWithURL(
    url as CFURL,
    UTType.png.identifier as CFString,
    1,
    nil
  ) else {
    throw ScriptError.imageWriteFailure("failed to create image destination: \(url.path)")
  }

  CGImageDestinationAddImage(destination, cgImage, nil)
  if !CGImageDestinationFinalize(destination) {
    throw ScriptError.imageWriteFailure("failed to finalize PNG: \(url.path)")
  }
}

do {
  let options = try parseArguments()
  let fileManager = FileManager.default
  let preparedInput = try prepareInputDirectory(from: options.input)
  defer {
    preparedInput.cleanup()
  }

  let frameURLs = try fileManager.contentsOfDirectory(
    at: preparedInput.directory,
    includingPropertiesForKeys: nil,
    options: [.skipsHiddenFiles]
  )
  .filter { $0.pathExtension.lowercased() == "png" }
  .sorted {
    let leftIndex = numericSuffix(for: $0)
    let rightIndex = numericSuffix(for: $1)
    if leftIndex == rightIndex {
      return $0.lastPathComponent < $1.lastPathComponent
    }
    return leftIndex < rightIndex
  }

  guard !frameURLs.isEmpty else {
    throw ScriptError.noFramesFound("no PNG frames found in \(options.input.path)")
  }

  var processedFrames = [RGBAImage]()
  processedFrames.reserveCapacity(frameURLs.count)

  var sourceWidth = 0
  var sourceHeight = 0
  var unionBounds: PixelBounds?

  for frameURL in frameURLs {
    var image = try loadImage(from: frameURL)

    if sourceWidth == 0 && sourceHeight == 0 {
      sourceWidth = image.width
      sourceHeight = image.height
    } else if image.width != sourceWidth || image.height != sourceHeight {
      throw ScriptError.inconsistentFrameSize(
        expected: "\(sourceWidth)x\(sourceHeight)",
        actual: "\(image.width)x\(image.height)"
      )
    }

    image.removeWhiteBackground(threshold: options.threshold)
    guard let bounds = image.visibleBounds() else {
      throw ScriptError.invalidFrame("frame became empty after background cleanup: \(frameURL.lastPathComponent)")
    }

    unionBounds = unionBounds.map { $0.union(with: bounds) } ?? bounds
    processedFrames.append(image)
  }

  guard let visibleBounds = unionBounds?.padded(
    maxWidth: sourceWidth,
    maxHeight: sourceHeight,
    padding: options.padding
  ) else {
    throw ScriptError.invalidFrame("unable to compute visible bounds")
  }

  let rows = Int(ceil(Double(processedFrames.count) / Double(options.columns)))
  let croppedFrameWidth = visibleBounds.width
  let croppedFrameHeight = visibleBounds.height
  let outputFrameHeight = min(croppedFrameHeight, options.targetHeight)
  let outputFrameWidth = max(
    1,
    Int(round(Double(croppedFrameWidth) * Double(outputFrameHeight) / Double(croppedFrameHeight)))
  )
  let spriteWidth = outputFrameWidth * options.columns
  let spriteHeight = outputFrameHeight * rows

  var sprite = RGBAImage(
    width: spriteWidth,
    height: spriteHeight,
    pixels: [UInt8](repeating: 0, count: spriteWidth * spriteHeight * 4)
  )

  for (frameIndex, frame) in processedFrames.enumerated() {
    let croppedFrame = frame.cropped(to: visibleBounds)
    let outputFrame = try resized(
      image: croppedFrame,
      toWidth: outputFrameWidth,
      height: outputFrameHeight
    )
    let row = frameIndex / options.columns
    let column = frameIndex % options.columns

    for y in 0..<outputFrameHeight {
      let sourceStart = y * outputFrameWidth * 4
      let sourceEnd = sourceStart + outputFrameWidth * 4
      let destinationStart = ((((row * outputFrameHeight) + y) * spriteWidth) + (column * outputFrameWidth)) * 4
      sprite.pixels[destinationStart..<(destinationStart + outputFrameWidth * 4)] = outputFrame.pixels[sourceStart..<sourceEnd]
    }
  }

  try fileManager.createDirectory(
    at: options.output.deletingLastPathComponent(),
    withIntermediateDirectories: true
  )
  try writePNG(image: sprite, to: options.output)

  let metadata = OutputMetadata(
    frameCount: processedFrames.count,
    columns: options.columns,
    rows: rows,
    croppedFrameWidth: croppedFrameWidth,
    croppedFrameHeight: croppedFrameHeight,
    outputFrameWidth: outputFrameWidth,
    outputFrameHeight: outputFrameHeight,
    outputWidth: spriteWidth,
    outputHeight: spriteHeight,
    sourceWidth: sourceWidth,
    sourceHeight: sourceHeight,
    cropBounds: visibleBounds,
    backgroundThreshold: options.threshold
  )

  let metadataURL = options.output.deletingPathExtension().appendingPathExtension("meta.json")
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  let metadataData = try encoder.encode(metadata)
  try metadataData.write(to: metadataURL)

  let summary = [
    "source frames: \(processedFrames.count)",
    "source size: \(sourceWidth)x\(sourceHeight)",
    "sprite size: \(spriteWidth)x\(spriteHeight)",
    "cropped frame size: \(croppedFrameWidth)x\(croppedFrameHeight)",
    "output frame size: \(outputFrameWidth)x\(outputFrameHeight)",
    "columns x rows: \(options.columns)x\(rows)",
    "output: \(options.output.path)",
    "metadata: \(metadataURL.path)"
  ]
  print(summary.joined(separator: "\n"))
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
