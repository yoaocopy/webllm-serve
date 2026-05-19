import { mountLanguageSelect } from "./i18n.js";

let currentBaseUrl = "http://127.0.0.1:21434/v1";

async function updateGatewayInfo() {
  try {
    const response = await fetch("./webllm-gateway-config.json", { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    if (config.base_url) {
      currentBaseUrl = config.base_url;
      document.querySelector("#apiUrl").textContent = config.base_url;
    }
    if (config.addr) {
      document.querySelector("#homeUrl").textContent = `http://${config.addr}/`;
    }
  } catch {
    // Static deployments may not have a generated gateway config.
  }
}

function renderApiExamples() {
  const chatUrl = `${currentBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const baseUrl = currentBaseUrl.replace(/\/$/, "");
  const question = "who are you";
  const windowsBody =
    `{"messages":[{"role":"user","content":"${question}"}],"stream":false,"max_tokens":128}`;

  document.querySelector("#windowsCmdExample").textContent = `curl "${chatUrl}" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer webllm-local" ^
  -d "${windowsBody.replaceAll('"', '\\"')}"`;

  document.querySelector("#windowsPowershellExample").textContent = `$body = @{
  messages = @(@{ role = "user"; content = "${question}" })
  stream = $false
  max_tokens = 128
} | ConvertTo-Json -Depth 6

$response = Invoke-RestMethod \`
  -Uri "${chatUrl}" \`
  -Method Post \`
  -Headers @{ Authorization = "Bearer webllm-local" } \`
  -ContentType "application/json" \`
  -Body $body

$response.choices[0].message.content`;

  document.querySelector("#windowsPowershellUtf8Example").textContent = `[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Net.Http

$bodyObject = @{
  messages = @(
    @{
      role = "user"
      content = "你是谁"
    }
  )
  stream = $false
  max_tokens = 128
}

$body = $bodyObject | ConvertTo-Json -Depth 10 -Compress

$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization =
  [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", "webllm-local")

$content = [System.Net.Http.StringContent]::new(
  $body,
  [System.Text.Encoding]::UTF8,
  "application/json"
)

$res = $client.PostAsync(
  "${chatUrl}",
  $content
).GetAwaiter().GetResult()

$bytes = $res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
$jsonText = [System.Text.Encoding]::UTF8.GetString($bytes)

$data = $jsonText | ConvertFrom-Json
$data.choices[0].message.content`;

  const port = new URL(baseUrl).port || "80";

  document.querySelector("#windowsTerminalExample").textContent = `Windows Terminal is only a terminal host. The command syntax depends on the profile you open:

- PowerShell profile: use the Windows 11 PowerShell example above.
- Command Prompt profile: use the Windows 11 CMD example above.
- Git Bash profile: this runs on Windows, so 127.0.0.1 usually works.
- WSL profile: 127.0.0.1 may not reach a gateway started on Windows. Try the first command. If it fails, run the gateway inside WSL, or start the Windows gateway with an address reachable from WSL.

# Git Bash, or WSL when localhost forwarding works:
curl ${chatUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer webllm-local" \\
  -d '{"messages":[{"role":"user","content":"${question}"}],"stream":false,"max_tokens":128}'

# WSL fallback when the gateway is running on Windows and is bound to an address reachable from WSL:
WIN_HOST=$(ip route | awk '/default/ {print $3}')
curl http://$WIN_HOST:${port}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer webllm-local" \\
  -d '{"messages":[{"role":"user","content":"${question}"}],"stream":false,"max_tokens":128}'`;

  document.querySelector("#curlExample").textContent = `curl ${chatUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer webllm-local" \\
  -d '{"messages":[{"role":"user","content":"${question}"}],"stream":false,"max_tokens":128}'`;

  document.querySelector("#cliExample").textContent = `OPENAI_BASE_URL="${baseUrl}" \\
OPENAI_API_KEY="webllm-local" \\
openai api chat.completions.create \\
  -m default \\
  -g user "${question}"`;

  document.querySelector("#pythonSdkExample").textContent = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="webllm-local",
)

response = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "${question}"}],
    max_tokens=128,
)

print(response.choices[0].message.content)`;

  document.querySelector("#nodeSdkExample").textContent = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "webllm-local",
});

const response = await client.chat.completions.create({
  model: "default",
  messages: [{ role: "user", content: "${question}" }],
  max_tokens: 128,
});

console.log(response.choices[0].message.content);`;
}

mountLanguageSelect();
renderApiExamples();
updateGatewayInfo().finally(renderApiExamples);
