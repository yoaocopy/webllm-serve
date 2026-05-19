package main

import "webllm-serve/gateway"

func main() {
	gateway.Run(staticFileSystem())
}
