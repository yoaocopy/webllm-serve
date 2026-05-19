#!/usr/bin/env sh
# Build WebLLM Serve gateway binaries and runnable release folders.
#
# Default usage from the repository root:
#   sh scripts/build-gateway.sh
#
# Default outputs:
#   dist/      Bare gateway binaries.
#   release/   Runnable platform folders with one self-contained gateway binary and README.
#
# All configured platform targets are temporarily enabled by default.
#
# Package modes:
#   embedded  Build a self-contained binary that embeds the web pages. Default.
#   files     Build a binary that serves local files and package it with HTML/JS/CSS files.
#
# Use custom output folders:
#   sh scripts/build-gateway.sh dist release embedded

set -eu

OUT_DIR="${1:-dist}"
RELEASE_DIR="${2:-release}"
PACKAGE_MODE="${3:-embedded}"
if [ "$PACKAGE_MODE" != "embedded" ] && [ "$PACKAGE_MODE" != "files" ]; then
  echo "Package mode must be 'embedded' or 'files'" >&2
  exit 1
fi
mkdir -p "$OUT_DIR"
mkdir -p "$RELEASE_DIR"

build_one() {
  goos="$1"
  goarch="$2"
  name="$3"
  package="$4"
  binary="$5"
  if [ "$PACKAGE_MODE" = "embedded" ]; then
    ldflags="-s -w -X webllm-serve/gateway.DefaultStaticMode=embedded"
  else
    ldflags="-s -w"
  fi
  echo "Building ${goos}/${goarch} -> ${OUT_DIR}/${name}"
  if [ "$PACKAGE_MODE" = "files" ]; then
    GOOS="$goos" GOARCH="$goarch" go build -tags localstatic -trimpath -ldflags="$ldflags" -o "${OUT_DIR}/${name}" .
  else
    GOOS="$goos" GOARCH="$goarch" go build -trimpath -ldflags="$ldflags" -o "${OUT_DIR}/${name}" .
  fi

  package_dir="${RELEASE_DIR}/${package}"
  rm -rf "$package_dir"
  mkdir -p "$package_dir"
  if [ "$PACKAGE_MODE" = "files" ]; then
    cp README.md index.html server.html client.html server-same-origin.html client-same-origin.html "$package_dir/"
    cp -R src "$package_dir/"
    cp -R vendor "$package_dir/"
  else
    cp README.md "$package_dir/"
  fi
  cp "${OUT_DIR}/${name}" "${package_dir}/${binary}"
  echo "Packaged -> ${package_dir}"
}

# Default release packages. All configured targets are temporarily enabled.
# The most common ones are:
# - Windows x64: release/webllm-serve-windows-amd64/webllm-gateway.exe
# - macOS Apple Silicon: release/webllm-serve-macos-arm64/webllm-gateway
# - Linux x64: release/webllm-serve-linux-amd64/webllm-gateway
build_one windows amd64 webllm-gateway-windows-amd64.exe webllm-serve-windows-amd64 webllm-gateway.exe
build_one darwin arm64 webllm-gateway-darwin-arm64 webllm-serve-macos-arm64 webllm-gateway
build_one linux amd64 webllm-gateway-linux-amd64 webllm-serve-linux-amd64 webllm-gateway
build_one windows arm64 webllm-gateway-windows-arm64.exe webllm-serve-windows-arm64 webllm-gateway.exe
build_one darwin amd64 webllm-gateway-darwin-amd64 webllm-serve-macos-amd64 webllm-gateway
build_one linux arm64 webllm-gateway-linux-arm64 webllm-serve-linux-arm64 webllm-gateway

echo "Done. Binaries are in ${OUT_DIR}; runnable packages are in ${RELEASE_DIR}"
