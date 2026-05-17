#!/usr/bin/env sh
set -eu

OUT_DIR="${1:-dist}"
mkdir -p "$OUT_DIR"

build_one() {
  goos="$1"
  goarch="$2"
  name="$3"
  echo "Building ${goos}/${goarch} -> ${OUT_DIR}/${name}"
  GOOS="$goos" GOARCH="$goarch" go build -trimpath -ldflags="-s -w" -o "${OUT_DIR}/${name}" ./gateway
}

build_one windows amd64 webllm-gateway-windows-amd64.exe
build_one windows arm64 webllm-gateway-windows-arm64.exe
build_one darwin amd64 webllm-gateway-darwin-amd64
build_one darwin arm64 webllm-gateway-darwin-arm64
build_one linux amd64 webllm-gateway-linux-amd64
build_one linux arm64 webllm-gateway-linux-arm64

echo "Done. Binaries are in ${OUT_DIR}"

