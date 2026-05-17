param(
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$targets = @(
  @{ GOOS = "windows"; GOARCH = "amd64";  Name = "webllm-gateway-windows-amd64.exe" },
  @{ GOOS = "windows"; GOARCH = "arm64";  Name = "webllm-gateway-windows-arm64.exe" },
  @{ GOOS = "darwin";  GOARCH = "amd64";  Name = "webllm-gateway-darwin-amd64" },
  @{ GOOS = "darwin";  GOARCH = "arm64";  Name = "webllm-gateway-darwin-arm64" },
  @{ GOOS = "linux";   GOARCH = "amd64";  Name = "webllm-gateway-linux-amd64" },
  @{ GOOS = "linux";   GOARCH = "arm64";  Name = "webllm-gateway-linux-arm64" }
)

foreach ($target in $targets) {
  $env:GOOS = $target.GOOS
  $env:GOARCH = $target.GOARCH
  $output = Join-Path $OutDir $target.Name
  Write-Host "Building $($target.GOOS)/$($target.GOARCH) -> $output"
  go build -trimpath -ldflags="-s -w" -o $output ./gateway
}

Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue

Write-Host "Done. Binaries are in $OutDir"

