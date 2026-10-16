Pod::Spec.new do |s|
  s.name         = "OtaAdapter"
  s.version      = "0.0.1"
  s.summary      = "On-device OTA native adapter (same Ota module as Android)"
  s.homepage     = "https://github.com/client-platform-labs/rn"
  s.license      = "UNLICENSED"
  s.authors      = "client-platform-labs"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/client-platform-labs/rn.git" }
  s.source_files = "*.{swift,m}"
  s.dependency "React-Core"
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }
end
