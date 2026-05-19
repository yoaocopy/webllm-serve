<#
Build WebLLM Serve gateway binaries and runnable release folders.

Default usage from the repository root:
  powershell -ExecutionPolicy Bypass -File scripts\build-gateway.ps1

Default outputs:
  dist\       Bare gateway binaries.
  release\   Runnable platform folders with one self-contained gateway binary and README.

All configured platform targets are temporarily enabled by default.

Package modes:
  embedded  Build a self-contained binary that embeds the web pages. Default.
  files     Build a binary that serves local files and package it with HTML/JS/CSS files.

Use custom output folders:
  powershell -ExecutionPolicy Bypass -File scripts\build-gateway.ps1 -OutDir dist -ReleaseDir release
#>

param(
  [string]$OutDir = "dist",
  [string]$ReleaseDir = "release",
  [ValidateSet("embedded", "files")]
  [string]$PackageMode = "embedded",
  [switch]$AllTargets
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $true
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

# Default release packages. All configured targets are temporarily enabled.
# The most common ones are:
# - Windows x64: release/webllm-serve-windows-amd64/webllm-gateway.exe
# - macOS Apple Silicon: release/webllm-serve-macos-arm64/webllm-gateway
# - Linux x64: release/webllm-serve-linux-amd64/webllm-gateway
$targets = @(
  @{ GOOS = "windows"; GOARCH = "amd64"; Name = "webllm-gateway-windows-amd64.exe"; Package = "webllm-serve-windows-amd64"; Binary = "webllm-gateway.exe"; Enabled = $true },
  @{ GOOS = "darwin";  GOARCH = "arm64"; Name = "webllm-gateway-darwin-arm64";       Package = "webllm-serve-macos-arm64";   Binary = "webllm-gateway";     Enabled = $true },
  @{ GOOS = "linux";   GOARCH = "amd64"; Name = "webllm-gateway-linux-amd64";        Package = "webllm-serve-linux-amd64";   Binary = "webllm-gateway";     Enabled = $true },

  @{ GOOS = "windows"; GOARCH = "arm64"; Name = "webllm-gateway-windows-arm64.exe"; Package = "webllm-serve-windows-arm64"; Binary = "webllm-gateway.exe"; Enabled = $true },
  @{ GOOS = "darwin";  GOARCH = "amd64"; Name = "webllm-gateway-darwin-amd64";      Package = "webllm-serve-macos-amd64";   Binary = "webllm-gateway";     Enabled = $true },
  @{ GOOS = "linux";   GOARCH = "arm64"; Name = "webllm-gateway-linux-arm64";       Package = "webllm-serve-linux-arm64";   Binary = "webllm-gateway";     Enabled = $true }
)

$staticFiles = @("README.md")
$filePackageStaticFiles = @(
  "README.md",
  "index.html",
  "server.html",
  "client.html",
  "prebuilt-models.html",
  "server-same-origin.html",
  "client-same-origin.html"
)
$buildTags = if ($PackageMode -eq "files") { "localstatic" } else { "" }
$ldflags = if ($PackageMode -eq "embedded") {
  "-s -w -X webllm-serve/gateway.DefaultStaticMode=embedded"
} else {
  "-s -w"
}

foreach ($target in $targets) {
  if (-not $target.Enabled -and -not $AllTargets) {
    continue
  }

  $env:GOOS = $target.GOOS
  $env:GOARCH = $target.GOARCH
  $output = Join-Path $OutDir $target.Name
  Write-Host "Building $($target.GOOS)/$($target.GOARCH) -> $output"
  $buildArgs = @("build")
  if ($buildTags) {
    $buildArgs += @("-tags", $buildTags)
  }
  $buildArgs += @("-trimpath", "-ldflags", $ldflags, "-o", $output, ".")
  & go @buildArgs
  if ($LASTEXITCODE -ne 0) {
    throw "go build failed for $($target.GOOS)/$($target.GOARCH)"
  }

  $packageDir = Join-Path $ReleaseDir $target.Package
  if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
  }
  New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

  $filesToCopy = if ($PackageMode -eq "files") { $filePackageStaticFiles } else { $staticFiles }
  foreach ($file in $filesToCopy) {
    Copy-Item -Path $file -Destination $packageDir
  }
  if ($PackageMode -eq "files") {
    Copy-Item -Recurse -Path "src" -Destination $packageDir
    Copy-Item -Recurse -Path "vendor" -Destination $packageDir
  }
  Copy-Item -Path $output -Destination (Join-Path $packageDir $target.Binary)

  Write-Host "Packaged -> $packageDir"
}

Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue

Write-Host "Done. Binaries are in $OutDir; runnable packages are in $ReleaseDir"
