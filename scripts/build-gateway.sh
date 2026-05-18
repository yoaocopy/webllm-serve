#!/usr/bin/env sh
# Build WebLLM Serve gateway binaries and runnable release folders.
#
# Default usage from the repository root:
#   sh scripts/build-gateway.sh
#
# Default outputs:
#   dist/      Bare gateway binaries.
#   release/   Runnable platform folders with HTML/JS files and one gateway binary.
#
# Build all configured optional targets:
#   ALL_TARGETS=1 sh scripts/build-gateway.sh
#
# Use custom output folders:
#   sh scripts/build-gateway.sh dist release

set -eu

OUT_DIR="${1:-dist}"
RELEASE_DIR="${2:-release}"
ALL_TARGETS="${ALL_TARGETS:-0}"
mkdir -p "$OUT_DIR"
mkdir -p "$RELEASE_DIR"

build_one() {
  goos="$1"
  goarch="$2"
  name="$3"
  package="$4"
  binary="$5"
  echo "Building ${goos}/${goarch} -> ${OUT_DIR}/${name}"
  GOOS="$goos" GOARCH="$goarch" go build -trimpath -ldflags="-s -w" -o "${OUT_DIR}/${name}" ./gateway

  package_dir="${RELEASE_DIR}/${package}"
  rm -rf "$package_dir"
  mkdir -p "$package_dir"
  cp README.md index.html server.html client.html server-same-origin.html client-same-origin.html "$package_dir/"
  cp -R src "$package_dir/"
  cp "${OUT_DIR}/${name}" "${package_dir}/${binary}"
  echo "Packaged -> ${package_dir}"
}

# Default release packages are the ones most users can run directly:
# - Windows x64: release/webllm-serve-windows-amd64/webllm-gateway.exe
# - macOS Apple Silicon: release/webllm-serve-macos-arm64/webllm-gateway
# - Linux x64: release/webllm-serve-linux-amd64/webllm-gateway
build_one windows amd64 webllm-gateway-windows-amd64.exe webllm-serve-windows-amd64 webllm-gateway.exe
build_one darwin arm64 webllm-gateway-darwin-arm64 webllm-serve-macos-arm64 webllm-gateway
build_one linux amd64 webllm-gateway-linux-amd64 webllm-serve-linux-amd64 webllm-gateway

# Optional release packages are kept for future publishing. Set ALL_TARGETS=1
# when you want to build every configured package.
if [ "$ALL_TARGETS" = "1" ]; then
  build_one windows arm64 webllm-gateway-windows-arm64.exe webllm-serve-windows-arm64 webllm-gateway.exe
  build_one darwin amd64 webllm-gateway-darwin-amd64 webllm-serve-macos-amd64 webllm-gateway
  build_one linux arm64 webllm-gateway-linux-arm64 webllm-serve-linux-arm64 webllm-gateway
fi

echo "Done. Binaries are in ${OUT_DIR}; runnable packages are in ${RELEASE_DIR}"
