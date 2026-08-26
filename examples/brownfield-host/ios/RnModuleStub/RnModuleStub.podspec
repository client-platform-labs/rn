Pod::Spec.new do |s|
  s.name             = 'RnModuleStub'
  s.version          = '0.1.0'
  s.summary          = 'Brownfield rn-module stub (map-a/#5) — source pod until XCFramework ships'
  s.homepage         = 'https://github.com/client-platform-labs/rn'
  s.license          = { :type => 'MIT' }
  s.author           = { 'client-platform' => 'dev@client-platform.local' }
  s.platform         = :ios, '15.0'
  s.source           = { :path => '.' }
  s.swift_version    = '5.9'
  s.source_files     = 'Sources/RnModuleStub/**/*.swift'
  # s.vendored_frameworks = 'RnModuleStub.xcframework'  # Map B / #5 depth
end
