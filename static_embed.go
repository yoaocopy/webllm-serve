//go:build !localstatic

package main

import (
	"embed"
	"net/http"
)

//go:embed index.html server.html client.html prebuilt-models.html server-same-origin.html client-same-origin.html src/* vendor/*
var staticFiles embed.FS

func staticFileSystem() http.FileSystem {
	return http.FS(staticFiles)
}
