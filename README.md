# WebLLM Serve

WebLLM Serve lets a browser-hosted WebLLM engine behave like a local
OpenAI-compatible service. The browser still runs WebLLM/WebGPU; a small Go
gateway exposes local HTTP APIs for clients, CLI tools, and SDKs.

## Quick Start

The easiest way is to clone this repository and run one of the prebuilt gateway
binaries from `dist/`. This does not require Go. The gateway binary is
self-contained: it embeds `index.html`, `server.html`, `client.html`, and `src/`.

Windows:

```powershell
.\dist\webllm-gateway-windows-amd64.exe
```

macOS Apple Silicon:

```bash
./dist/webllm-gateway-darwin-arm64
```

Linux x64:

```bash
./dist/webllm-gateway-linux-amd64
```

You can run the binary from the repository root as shown above. Because the
static pages are embedded, the same binary can also be copied elsewhere and run
by itself.

If you cloned the repository and have Go installed, run from the repository
root. This development command serves files from the working directory, so
changes to `index.html`, `server.html`, `client.html`, and `src/` are reflected
after browser refresh:

```bash
go run .
```

To test the compiled embedded snapshot behavior from source:

```bash
go run . -static embedded
```

If you downloaded a generated release package, enter that package folder and run
the included binary.

macOS/Linux release package:

```bash
./webllm-gateway
```

Windows release package:

```powershell
.\webllm-gateway.exe
```

If you cloned the repository but have not built binaries yet, the release
package binaries above will not exist. Build them first with the commands in
the [Build Gateway Binaries](#build-gateway-binaries) section.

The gateway prints the actual URLs at startup. Use those printed URLs as the
source of truth, especially if the default port is already occupied.

Example startup information:

```text
WebLLM Serve gateway started
Listening:   http://127.0.0.1:21434
Home:        http://127.0.0.1:21434/
Server UI:   http://127.0.0.1:21434/server.html
Client UI:   http://127.0.0.1:21434/client.html
OpenAI API:  http://127.0.0.1:21434/v1
Bridge WS:   ws://127.0.0.1:21434/bridge
```

Then:

1. Open the printed `Home` or `Server UI` URL.
2. In `server.html`, connect to the gateway if needed.
3. Load a WebLLM model.
4. Open the printed `Client UI` URL, or call the printed `OpenAI API` URL from
   curl, CLI tools, or SDKs.

## Ports

If no `-addr` is provided, the gateway starts at:

```text
127.0.0.1:21434
```

If that port is busy, it searches upward until it finds an available port, up
to:

```text
127.0.0.1:21534
```

The selected address is written to:

```text
webllm-gateway-config.json
```

`server.html` and `client.html` read this file on startup, so they can follow
the actual selected gateway port automatically.

To force a specific port:

From source:

```bash
go run . -addr 127.0.0.1:21440
```

From a macOS/Linux release package:

```bash
./webllm-gateway -addr 127.0.0.1:21440
```

From a Windows release package:

```powershell
.\webllm-gateway.exe -addr 127.0.0.1:21440
```

## Build Gateway Binaries

On a computer with Go installed, build a binary for the current platform:

```bash
go build -trimpath -ldflags="-s -w" -o dist/webllm-gateway .
```

On Windows, build the current platform binary:

```powershell
New-Item -ItemType Directory -Force dist
go build -trimpath -ldflags="-s -w" -o dist/webllm-gateway.exe .
```

Cross-compile common release targets from macOS/Linux:

```bash
sh scripts/build-gateway.sh
```

Cross-compile common release targets from Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-gateway.ps1
```

The default package mode is `embedded`. It builds a self-contained gateway
binary with the web pages embedded. The build scripts set the binary default to
`-static embedded`, so users can run the release binary from any folder.

To build the older file-based release layout, use `files` mode. In this mode the
gateway binary is built with `-tags localstatic` and the release folder includes
the HTML/JS/CSS files:

macOS/Linux:

```bash
sh scripts/build-gateway.sh dist release files
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-gateway.ps1 -PackageMode files
```

By default, the scripts currently build all configured release targets:

- `webllm-gateway-windows-amd64.exe`
- `webllm-gateway-windows-arm64.exe`
- `webllm-gateway-darwin-amd64`
- `webllm-gateway-darwin-arm64`
- `webllm-gateway-linux-amd64`
- `webllm-gateway-linux-arm64`

They also create runnable platform packages under `release/`:

- `release/webllm-serve-windows-amd64/`
- `release/webllm-serve-windows-arm64/`
- `release/webllm-serve-macos-amd64/`
- `release/webllm-serve-macos-arm64/`
- `release/webllm-serve-linux-amd64/`
- `release/webllm-serve-linux-arm64/`

In `embedded` mode, each package contains the matching self-contained gateway
binary and `README.md`. In `files` mode, each package also contains
`index.html`, `server.html`, `client.html`, same-origin pages, and `src/`.
A user can download one package folder and run the gateway directly from that
folder.

The build scripts previously supported a smaller default target set. The
platform list is currently enabled in full for release testing; reduce the
enabled targets in the scripts again if artifact size becomes a concern.

## Using Built Binaries

In the default `embedded` package mode, the gateway executable embeds the
HTML/CSS/JS files, so the binary can run by itself. It still writes
`webllm-gateway-config.json` to the current working directory so browser pages
can discover the actual selected port.

Recommended package layout:

```text
webllm-serve-windows-amd64/
  webllm-gateway.exe
  README.md
```

The generated `release/` folders already follow this layout. For example:

```text
release/
  webllm-serve-windows-amd64/
    webllm-gateway.exe
    README.md

  webllm-serve-macos-arm64/
    webllm-gateway
    README.md

  webllm-serve-linux-amd64/
    webllm-gateway
    README.md
```

Run the binary from the matching release package folder.

Windows:

```powershell
cd release\webllm-serve-windows-amd64
.\webllm-gateway.exe
```

macOS:

```bash
cd release/webllm-serve-macos-arm64
./webllm-gateway
```

Linux:

```bash
cd release/webllm-serve-linux-amd64
./webllm-gateway
```

If you manually create a package, include the matching binary. README is useful
but optional for running:

```text
webllm-serve-windows-amd64/
  webllm-gateway.exe
  README.md
```

Then open the URLs printed by the gateway.

If you build with `files` package mode, the release folder uses the older layout:

```text
webllm-serve-windows-amd64/
  webllm-gateway.exe
  index.html
  server.html
  client.html
  server-same-origin.html
  client-same-origin.html
  src/
  README.md
```

Run the binary from that folder so it can serve the local files.

For frontend development, `go run .` serves files from the current working
directory by default:

```bash
go run .
```

To test the embedded snapshot mode locally:

```bash
go run . -static embedded
```

## Gateway APIs

The gateway serves static files and exposes:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `GET /bridge` as the WebSocket bridge used by `server.html`

The HTTP API does not require the caller to be same-origin. CORS is enabled for
local browser clients.

The gateway accepts OpenAI-style `Authorization: Bearer ...` headers for
compatibility, but it does not enforce API-key authentication yet. The key is
currently passed through by clients for shape compatibility and future auth
support.

## Jupyter AI Compatibility

Jupyter AI can call the gateway as an OpenAI-compatible chat provider:

```text
http://127.0.0.1:21434/v1
```

Use the actual port printed by the gateway. The API key can be any non-empty
placeholder, such as `webllm-local`.

The gateway's role is transport and minimal OpenAI/WebLLM format compatibility.
It does not decide which Jupyter tool to call, rewrite Jupyter AI prompts, or
execute notebook, file, kernel, browser, or skill commands itself.

When Jupyter AI sends OpenAI `tools`, the request is forwarded to the browser
WebLLM runtime after internal routing fields such as `model` are handled. Tool
calling then depends on whether the loaded WebLLM model/runtime combination
supports the OpenAI tool-calling fields well enough for Jupyter AI's protocol.
Response objects are still normalized to include OpenAI-style fields such as
`id`, `object`, `created`, `model`, `choices`, and `finish_reason`.

WebLLM documents OpenAI-style function calling as WIP/preliminary support using
`tools` and `tool_choice`. Some model-specific implementations may still reject
certain combinations. For example, Hermes 2 Pro has been observed to reject
`tools` when a custom Jupyter AI system prompt is also present. In that case the
gateway reports the WebLLM error instead of rewriting the prompt or silently
choosing tools itself.

For explicit compatibility testing, `server.html` includes a manual switch:

```text
Drop system messages when tools are present
```

It is off by default. When enabled, and only when the incoming request contains
OpenAI `tools`, `server.html` removes `role: "system"` messages before calling
WebLLM. This is useful for testing model-specific restrictions such as Hermes 2
Pro's tool-calling limitation with custom system prompts. The conversion is
reported in the request logs under `engine transforms`.

## Curl And SDK Examples

Use the actual port printed by the gateway. The examples below assume `21434`.

Non-streaming curl:

```bash
curl http://127.0.0.1:21434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer webllm-local" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"你是谁\"}],\"stream\":false,\"max_tokens\":128}"
```

Streaming curl:

```bash
curl -N http://127.0.0.1:21434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer webllm-local" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"用一句话介绍你自己\"}],\"stream\":true,\"max_tokens\":128}"
```

OpenAI Python SDK:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:21434/v1",
    api_key="webllm-local",
)

response = client.chat.completions.create(
    model="server-loaded-model",
    messages=[{"role": "user", "content": "你是谁"}],
    max_tokens=128,
)

print(response.choices[0].message.content)
```

OpenAI Node SDK:

```js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:21434/v1",
  apiKey: "webllm-local",
});

const response = await client.chat.completions.create({
  model: "server-loaded-model",
  messages: [{ role: "user", content: "你是谁" }],
  max_tokens: 128,
});

console.log(response.choices[0].message.content);
```

The `model` field is accepted for OpenAI SDK compatibility. When omitted by the
browser client, the gateway/server uses the model currently loaded in
`server.html`.

## Static Same-Origin Demo

The old pure-browser same-origin demo is preserved:

- `server-same-origin.html`
- `client-same-origin.html`
- `src/server-same-origin.js`
- `src/client-same-origin.js`

Run any static server:

```bash
python3 -m http.server 8000
```

Or:

```bash
node scripts/static-server.mjs
```

Then open:

- Same-origin server console: `http://127.0.0.1:8000/server-same-origin.html`
- Same-origin chat client: `http://127.0.0.1:8000/client-same-origin.html`

The same-origin demo uses BroadcastChannel and cannot be called by curl, CLI
tools, or OpenAI SDKs.

## Browser Boundary

A plain browser page cannot listen on a local TCP port as an HTTP server. The Go
gateway provides that local HTTP server and forwards requests to `server.html`,
where WebLLM runs in the browser/WebGPU environment.

## Models

The server page includes these preset model IDs:

- `Qwen3.5-0.8B-q4f16_1-MLC`
- `Qwen3.5-2B-q4f16_1-MLC`
- `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`
- `Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC`
- `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`
- `gemma3-1b-it-q4f16_1-MLC`
- `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`
- `Llama-3.2-1B-Instruct-q4f16_1-MLC`
- `sft_model_1.5B-q4f16_1-MLC (Hugging Face)`

The custom Hugging Face model is registered as a WebLLM `ModelRecord` in
`src/models.js` and reuses the Qwen2 1.5B WebGPU wasm library from `v0_2_48`:

`https://huggingface.co/yoaocopy/sft_model_1.5B-q4f16_1-MLC`

The browser server uses WebLLM's `indexeddb` cache backend for model downloads.
This matches the earlier same-origin version and avoids `Cache.add()` network
errors seen with the browser Cache API in some environments. If a page refresh
interrupts a large model download and later causes `Failed to read large
IndexedDB value`, use `server.html`'s `清理模型缓存` button or clear the site's
browser storage, then download the model again.

The server selects the WebLLM runtime by model:

- `sft_model_1.5B-q4f16_1-MLC (Hugging Face)` uses `@mlc-ai/web-llm@0.2.79`
  to match the `v0_2_48` model library.
- Other preset models use `@mlc-ai/web-llm@0.2.83` so newer built-in model
  records such as Qwen3.5 are available.

## Browser Client Usage

1. Start the Go gateway.
2. Open the `Server UI` URL printed by the gateway.
3. Select a model such as `Qwen3.5-0.8B-q4f16_1-MLC` and click load.
4. Open the `Client UI` URL printed by the gateway, or host `client.html`
   elsewhere.
5. Click `检查 Gateway`. The status should become connected or show the loaded
   model name.
6. Send a message.

The browser client does not choose a model. It always uses the model currently
loaded in `server.html` and sends chat requests without a `model` field.

The server does not override client sampling parameters. Values such as
`temperature`, `top_p`, `max_tokens`, and `stop` come from `client.html` or the
request payload.

## Language Switching

The main pages support Chinese and English without a build step:

- `index.html`
- `server.html`
- `client.html`

Translations live in `src/i18n.js`. Static page text uses `data-i18n` attributes,
and dynamic JavaScript messages use the shared `t(key)` helper. The selected
language is stored in `localStorage`, so changing it on one main page also
applies to the other main pages.

When adding new UI text, add a key to both `zh` and `en` in `src/i18n.js`, then
reference it from HTML with `data-i18n="key"` or from JavaScript with `t("key")`.

## Model Loading Notes

This project has a few model-specific compatibility rules. Keep these in mind
when adding or changing WebLLM models.

### sft_model_1.5B

The custom model:

`sft_model_1.5B-q4f16_1-MLC (Hugging Face)`

uses this `ModelRecord`:

```js
{
  model: "https://huggingface.co/yoaocopy/sft_model_1.5B-q4f16_1-MLC",
  model_id: "sft_model_1.5B-q4f16_1-MLC (Hugging Face)",
  model_lib:
    "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_48/Qwen2-1.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
  vram_required_MB: 1629.75,
  low_resource_required: true,
  overrides: {
    context_window_size: 4096,
  },
}
```

Important details:

- It needs the `v0_2_48` Qwen2 1.5B WebGPU wasm library.
- It is loaded with `@mlc-ai/web-llm@0.2.79`.
- Loading it with a newer WebLLM runtime can fail with wasm ABI/import errors
  such as `TVMWasmPackedCFunc`.
- Do not replace the Hugging Face source with a mirror unless the user
  explicitly asks for that. The model source itself is valid.

### Qwen3.5

`Qwen3.5-0.8B-q4f16_1-MLC` and `Qwen3.5-2B-q4f16_1-MLC` are newer built-in
WebLLM models.

Important details:

- They are loaded with `@mlc-ai/web-llm@0.2.83`.
- Older runtimes such as `0.2.79` may fail with:

```text
Cannot find model record in appConfig
```

- The server therefore chooses WebLLM runtime by model family.
- The 0.8B Qwen3.5 model may repeat or run until `max_tokens` for some prompts.
  Treat that as a model/parameter behavior unless request construction is
  clearly wrong.
- The server should not silently override sampling parameters. Expose advanced
  options in `client.html` if tighter control is needed.

For Jupyter AI tool-enabled requests, the default context window can be too
small for the Jupyternaut system prompt plus OpenAI tool schemas. This project
overrides the recommended Qwen models to:

```js
{
  model_id: "Qwen3.5-2B-q4f16_1-MLC",
  overrides: {
    context_window_size: 8192,
  },
}

{
  model_id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
  overrides: {
    context_window_size: 8192,
  },
}
```

This addresses errors such as:

```text
Prompt tokens exceed context window size: number of prompt tokens: 5145; context window size: 4096
```

The override changes only WebLLM chat configuration. It should not require
downloading model weights again. Reload the page and reload the model. If GPU
memory becomes tight, lower the override to `6144`.

### Gemma3

`gemma3-1b-it-q4f16_1-MLC` is available as a WebLLM built-in model, but its
record can hit this configuration conflict:

```text
Only one of context_window_size and sliding_window_size can be positive.
Got: context_window_size: 4096, sliding_window_size: 512
```

The fix is to override only the conflicting fields:

```js
{
  model_id: "gemma3-1b-it-q4f16_1-MLC",
  overrides: {
    context_window_size: 4096,
    sliding_window_size: -1,
  },
}
```

Important details:

- Do not guess or hard-code Gemma's `model_lib` URL.
- Keep WebLLM's built-in `model` and `model_lib`, and merge only the override.
- A guessed wasm URL can fail with:

```text
Failed to store ...webgpu.wasm
Network response was not ok
```

### Hermes 2 Pro Mistral 7B

`Hermes-2-Pro-Mistral-7B-q4f16_1-MLC` is included as a WebLLM built-in model.
By default, its context window comes from the model's bundled
`mlc-chat-config.json`. This project currently does not override Hermes'
context window.

If you need to test a larger Jupyter AI prompt budget, you can add a temporary
override in `src/models.js`:

```js
{
  model_id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC",
  overrides: {
    context_window_size: 8192,
  },
}
```

This can help with Jupyter AI requests where the Jupyternaut system prompt plus
OpenAI tool schemas are several thousand characters before the user message.

Changing this override does not change the model weights or `model_lib`, so it
should not require downloading the model again. Reload the page and reload the
model so WebLLM applies the new chat configuration. If the browser becomes slow
or runs out of GPU memory, lower the override to `6144` or remove it to use
Hermes' bundled default.

### ModelRecord Merge Rule

`src/server.js` merges custom records with WebLLM built-ins this way:

- If a custom `model_id` does not exist in WebLLM's built-in list, append it.
- If a custom `model_id` already exists, merge it into the built-in record.
- Preserve built-in fields such as `model` and `model_lib` unless the custom
  record explicitly provides replacements.
- Merge `overrides` shallowly, so model-specific fixes can patch only the
  problematic fields.

This is important for Gemma3: its custom record intentionally contains only
`model_id` and `overrides`.

### Adding New Models

Before adding a new model:

1. Confirm the exact `model_id` expected by WebLLM.
2. Check whether the model is already in the selected WebLLM runtime's
   `prebuiltAppConfig`.
3. If it is built-in, prefer the built-in `model` and `model_lib`.
4. If it is custom, provide a complete `ModelRecord`, including a compatible
   `model_lib`.
5. Match the WebLLM runtime version with the wasm library version.
6. Avoid changing runtime versions globally just to fix one model; use
   model-specific runtime selection when necessary.
7. Do not add hidden generation defaults in the server. Let the client/request
   own `temperature`, `top_p`, `max_tokens`, `stop`, and related parameters.

### Common Error Map

```text
Cannot find model record in appConfig
```

Usually means the active WebLLM runtime does not include that `model_id`.
Use a newer runtime or add a correct `ModelRecord`.

```text
TVMWasmPackedCFunc: function import requires a callable
```

Usually means the WebLLM JS runtime and the `model_lib` wasm were built for
incompatible versions. Match the runtime to the wasm library version.

```text
Only one of context_window_size and sliding_window_size can be positive
```

Patch `ModelRecord.overrides` and set one of them to `-1`.

```text
Failed to store ...webgpu.wasm with error: Network response was not ok
```

Usually means the `model_lib` URL is wrong or unavailable. Do not infer wasm
names unless verified.

```text
Failed to store ...tensor-cache.json with error: Network response was not ok
```

Usually means the model weight manifest URL is not reachable or the model path
is wrong. For a valid Hugging Face model, first verify the `model` URL and
runtime/model_lib compatibility before changing hosts.
