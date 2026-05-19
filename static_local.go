//go:build localstatic

package main

import "net/http"

func staticFileSystem() http.FileSystem {
	return nil
}
