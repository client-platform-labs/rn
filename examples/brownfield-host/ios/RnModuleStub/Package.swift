// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "RnModuleStub",
  platforms: [.iOS(.v15)],
  products: [
    .library(name: "RnModuleStub", targets: ["RnModuleStub"]),
  ],
  targets: [
    .target(
      name: "RnModuleStub",
      path: "Sources/RnModuleStub",
    ),
  ],
)
