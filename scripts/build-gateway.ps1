<#
Build WebLLM Serve gateway binaries and runnable release folders.

Default usage from the repository root:
  powershell -ExecutionPolicy Bypass -File scripts\build-gateway.ps1

Default outputs:
  dist\       Bare gateway binaries.
  release\   Runnable platform folders with HTML/JS files and one gateway binary.

Build all configured optional targets:
  powershell -ExecutionPolicy Bypass -File scripts\build-gateway.ps1 -AllTargets

Use custom output folders:
  powershell -ExecutionPolicy Bypass -File scripts\build-gateway.ps1 -OutDir dist -ReleaseDir release
#>

param(
  [string]$OutDir = "dist",
  [string]$ReleaseDir = "release",
  [switch]$AllTargets
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

# Default release packages are the ones most users can run directly:
# - Windows x64: release/webllm-serve-windows-amd64/webllm-gateway.exe
# - macOS Apple Silicon: release/webllm-serve-macos-arm64/webllm-gateway
# - Linux x64: release/webllm-serve-linux-amd64/webllm-gateway
#
# The disabled entries below are kept for future publishing. Enable one by
# changing Enabled to $true, or build all configured packages with -AllTargets.
$targets = @(
  @{ GOOS = "windows"; GOARCH = "amd64"; Name = "webllm-gateway-windows-amd64.exe"; Package = "webllm-serve-windows-amd64"; Binary = "webllm-gateway.exe"; Enabled = $true },
  @{ GOOS = "darwin";  GOARCH = "arm64"; Name = "webllm-gateway-darwin-arm64";       Package = "webllm-serve-macos-arm64";   Binary = "webllm-gateway";     Enabled = $true },
  @{ GOOS = "linux";   GOARCH = "amd64"; Name = "webllm-gateway-linux-amd64";        Package = "webllm-serve-linux-amd64";   Binary = "webllm-gateway";     Enabled = $true },

  @{ GOOS = "windows"; GOARCH = "arm64"; Name = "webllm-gateway-windows-arm64.exe"; Package = "webllm-serve-windows-arm64"; Binary = "webllm-gateway.exe"; Enabled = $false },
  @{ GOOS = "darwin";  GOARCH = "amd64"; Name = "webllm-gateway-darwin-amd64";      Package = "webllm-serve-macos-amd64";   Binary = "webllm-gateway";     Enabled = $false },
  @{ GOOS = "linux";   GOARCH = "arm64"; Name = "webllm-gateway-linux-arm64";       Package = "webllm-serve-linux-arm64";   Binary = "webllm-gateway";     Enabled = $false }
)

$staticFiles = @(
  "README.md",
  "index.html",
  "server.html",
  "client.html",
  "server-same-origin.html",
  "client-same-origin.html"
)

foreach ($target in $targets) {
  if (-not $target.Enabled -and -not $AllTargets) {
    continue
  }

  $env:GOOS = $target.GOOS
  $env:GOARCH = $target.GOARCH
  $output = Join-Path $OutDir $target.Name
  Write-Host "Building $($target.GOOS)/$($target.GOARCH) -> $output"
  go build -trimpath -ldflags="-s -w" -o $output ./gateway

  $packageDir = Join-Path $ReleaseDir $target.Package
  if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
  }
  New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

  foreach ($file in $staticFiles) {
    Copy-Item -Path $file -Destination $packageDir
  }
  Copy-Item -Recurse -Path "src" -Destination $packageDir
  Copy-Item -Path $output -Destination (Join-Path $packageDir $target.Binary)

  Write-Host "Packaged -> $packageDir"
}

Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue

Write-Host "Done. Binaries are in $OutDir; runnable packages are in $ReleaseDir"
