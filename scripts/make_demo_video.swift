import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

struct DemoFrame {
    let path: String
    let seconds: Double
    let cardOnly: Bool
}

let frames = [
    DemoFrame(path: "/tmp/wayfin-demo-frames/01-landing.png", seconds: 4, cardOnly: false),
    DemoFrame(path: "/tmp/wayfin-demo-frames/02-birthday-search.png", seconds: 7, cardOnly: false),
    DemoFrame(path: "/tmp/wayfin-demo-frames/03-visual-route.png", seconds: 8, cardOnly: false),
    DemoFrame(path: "/tmp/wayfin-demo-frames/04-price-fail.png", seconds: 4, cardOnly: true),
    DemoFrame(path: "/tmp/wayfin-demo-frames/05-price-result.png", seconds: 8, cardOnly: true),
]

let width = 1280
let height = 720
let fps: Int32 = 30
let output = URL(fileURLWithPath: "/tmp/wayfin-build-week-demo.mov")
try? FileManager.default.removeItem(at: output)

func loadImage(_ path: String) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func makeCanvas(from image: CGImage, cardOnly: Bool) -> CGImage? {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.setFillColor(CGColor(red: 0.04, green: 0.035, blue: 0.06, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))

    if cardOnly {
        let crop = CGRect(x: 0, y: 360, width: width, height: 360)
        context.draw(image, in: CGRect(x: 0, y: 180, width: width, height: 360))
    } else {
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    return context.makeImage()
}

let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
    ]
)
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func pixelBuffer(_ image: CGImage) -> CVPixelBuffer? {
    var buffer: CVPixelBuffer?
    CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, [
        kCVPixelBufferCGImageCompatibilityKey: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey: true,
    ] as CFDictionary, &buffer)
    guard let buffer else { return nil }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let base = CVPixelBufferGetBaseAddress(buffer), let context = CGContext(
        data: base,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    ) else { return nil }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return buffer
}

var frameNumber: Int64 = 0
for item in frames {
    guard let image = loadImage(item.path), let canvas = makeCanvas(from: image, cardOnly: item.cardOnly), let buffer = pixelBuffer(canvas) else { continue }
    let count = Int(item.seconds * Double(fps))
    for _ in 0..<count {
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.01) }
        adaptor.append(buffer, withPresentationTime: CMTime(value: frameNumber, timescale: fps))
        frameNumber += 1
    }
}
input.markAsFinished()
writer.finishWriting {
    if writer.status == .completed { print(output.path) }
    else if let error = writer.error { fputs("video error: \(error)\n", stderr) }
}
RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.5))
