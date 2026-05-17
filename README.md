# WebLLM Serve

Browser-first local WebLLM playground with an OpenAI-shaped message bridge.

This implementation is intentionally static: it can be served with
`python3 -m http.server` or published to GitHub Pages. Open `server.html` to
load and manage WebLLM, then open `client.html` to chat with it using
OpenAI-style messages.

## Run With Go Gateway

The main mode uses a small Go gateway to expose OpenAI-compatible local HTTP
APIs:

```text
http://127.0.0.1:21434/v1
```

Start it from the repository root with:

```bash
go run ./gateway
```

## Build Gateway Binaries

On a computer with Go installed, build a binary for the current platform:

```bash
go build -trimpath -ldflags="-s -w" -o dist/webllm-gateway ./gateway
```

On Windows, build the current platform binary:

```powershell
New-Item -ItemType Directory -Force dist
go build -trimpath -ldflags="-s -w" -o dist/webllm-gateway.exe ./gateway
```

Cross-compile common release targets from macOS/Linux:

```bash
sh scripts/build-gateway.sh
```

Cross-compile common release targets from Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-gateway.ps1
```

The scripts output binaries into `dist/`:

- `webllm-gateway-windows-amd64.exe`
- `webllm-gateway-windows-arm64.exe`
- `webllm-gateway-darwin-amd64`
- `webllm-gateway-darwin-arm64`
- `webllm-gateway-linux-amd64`
- `webllm-gateway-linux-arm64`

Distribute the gateway binary together with the project static files
(`server.html`, `client.html`, `src/`, etc.). Run the binary from the repository
or release folder root so it can serve those static files.

## Using Built Binaries

The gateway executable serves the HTML/CSS/JS files from its current working
directory. Do not distribute only the gateway binary unless you also embed or
otherwise provide the static files.

Recommended release layout:

```text
webllm-serve-release/
  webllm-gateway-windows-amd64.exe
  webllm-gateway-darwin-arm64
  webllm-gateway-linux-amd64
  index.html
  server.html
  client.html
  server-same-origin.html
  client-same-origin.html
  src/
  README.md
```

For a platform-specific package, include only the matching binary plus the
static files. For example, a Windows x64 package can look like:

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

Run the binary from that folder:

```bash
./webllm-gateway-linux-amd64
```

On macOS:

```bash
./webllm-gateway-darwin-arm64
```

On Windows:

```powershell
.\webllm-gateway.exe
```

Then open:

```text
http://127.0.0.1:21434/server.html
http://127.0.0.1:21434/client.html
```

If the binary is launched from another directory, it may not find `server.html`
and `src/`. In that case, start it from the release folder in a terminal. A
future version can use Go `embed` to produce a fully self-contained single
binary.

The default port is `21434`. To use another port:

```bash
./webllm-gateway -addr 127.0.0.1:21435
```

On Windows:

```powershell
.\webllm-gateway.exe -addr 127.0.0.1:21435
```

Then open:

- Server console: `http://127.0.0.1:21434/server.html`
- HTTP chat client: `http://127.0.0.1:21434/client.html`

Workflow:

1. Start the Go gateway.
2. Open `server.html`.
3. Click `连接 Gateway` if it is not already connected.
4. Load a WebLLM model in `server.html`.
5. Open `client.html`, or call the API from curl/OpenAI SDK.

The gateway serves static files and also exposes:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `GET /bridge` as the WebSocket bridge used by `server.html`

Example curl request:

```bash
curl http://127.0.0.1:21434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer webllm-local" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"你是谁\"}],\"stream\":false,\"max_tokens\":128}"
```

The HTTP API does not require the caller to be same-origin. CORS is enabled for
local browser clients.

The gateway accepts OpenAI-style `Authorization: Bearer ...` headers for
compatibility, but it does not enforce API-key authentication yet. The key is
currently passed through by clients for shape compatibility and future auth
support.

Streaming curl example:

```bash
curl -N http://127.0.0.1:21434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer webllm-local" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"用一句话介绍你自己\"}],\"stream\":false,\"max_tokens\":128}"
```

OpenAI Python SDK example:

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

The `model` field is accepted for OpenAI SDK compatibility. When omitted by the
browser client, the gateway/server uses the model currently loaded in
`server.html`.

OpenAI Node SDK example:

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

## Static Same-Origin Demo

```bash
python3 -m http.server 8000
```

If Python is not available, Node.js can serve the same files:

```bash
node scripts/static-server.mjs
```

Then open:

- Same-origin server console: `http://127.0.0.1:8000/server-same-origin.html`
- Same-origin chat client: `http://127.0.0.1:8000/client-same-origin.html`

Keep the server console tab open while using the client.

## Current Browser-Only Boundary

A plain browser page cannot listen on `127.0.0.1:21434` as an HTTP server. The
Go gateway provides that local HTTP server and forwards requests to
`server.html`, where WebLLM runs in the browser/WebGPU environment.

The old pure-browser same-origin demo is preserved as:

- `server-same-origin.html`
- `client-same-origin.html`
- `src/server-same-origin.js`
- `src/client-same-origin.js`

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
2. Open `http://127.0.0.1:21434/server.html`.
3. Select a model such as `Qwen3.5-0.8B-q4f16_1-MLC` and click load.
4. Open `http://127.0.0.1:21434/client.html`, or host `client.html` elsewhere.
5. Click `检查 Gateway`. The status should become connected or show the loaded model
   name.
6. Send a message.

The browser client does not choose a model. It always uses the model currently
loaded in `server.html` and sends chat requests without a `model` field.

The server does not override client sampling parameters. Values such as
`temperature`, `top_p`, `max_tokens`, and `stop` come from `client.html` or the
request payload.

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

Both pages must use the same origin. For example, do not mix
`localhost:8000` and `127.0.0.1:8000`.
