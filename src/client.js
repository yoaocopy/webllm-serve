import { mountLanguageSelect, t } from "./i18n.js";

const el = {
  clientStatus: document.querySelector("#clientStatus"),
  baseUrl: document.querySelector("#baseUrl"),
  apiKey: document.querySelector("#apiKey"),
  serverModel: document.querySelector("#serverModel"),
  systemPrompt: document.querySelector("#systemPrompt"),
  maxTokens: document.querySelector("#maxTokens"),
  temperature: document.querySelector("#temperature"),
  topP: document.querySelector("#topP"),
  stream: document.querySelector("#stream"),
  connectServer: document.querySelector("#connectServer"),
  refreshModels: document.querySelector("#refreshModels"),
  clearChat: document.querySelector("#clearChat"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  userInput: document.querySelector("#userInput"),
  rawJson: document.querySelector("#rawJson"),
};

let chatMessages = [];
let lastRaw = {};
let loadedModel = "";
let gatewayReachable = false;
let bridgeConnected = false;

function init() {
  mountLanguageSelect();
  renderMessages();
  setRaw({});
  initGatewayConfig().finally(checkGateway);

  el.connectServer.addEventListener("click", checkGateway);
  el.refreshModels.addEventListener("click", refreshModels);
  el.clearChat.addEventListener("click", () => {
    chatMessages = [];
    renderMessages();
    setRaw({});
  });
  el.chatForm.addEventListener("submit", submitMessage);
  el.userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      el.chatForm.requestSubmit();
    }
  });
  window.addEventListener("webllm-language-change", () => {
    renderMessages();
    if (!loadedModel) {
      el.serverModel.value = t("notLoaded");
    }
    setStatus(languageAwareStatus());
  });
}

async function initGatewayConfig() {
  try {
    const response = await fetch("./webllm-gateway-config.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const config = await response.json();
    if (config.base_url) {
      el.baseUrl.value = config.base_url;
    }
  } catch {
    // Static deployments may not have a generated gateway config.
  }
}

async function checkGateway() {
  try {
    setStatus(t("checkingGateway"));
    const healthUrl = `${getGatewayRoot()}/health`;
    const response = await fetch(healthUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    gatewayReachable = true;
    bridgeConnected = Boolean(data.bridge_connected);
    loadedModel = data.loaded_model || "";
    el.serverModel.value = loadedModel || t("notLoaded");
    setStatus(bridgeConnected ? statusText() : t("gatewayNeedsServer"));
  } catch (error) {
    gatewayReachable = false;
    bridgeConnected = false;
    loadedModel = "";
    el.serverModel.value = t("notLoaded");
    setStatus(t("gatewayCheckFailed", { message: error.message }));
  }
}

async function refreshModels() {
  await checkGateway();
  try {
    const response = await fetch(`${getBaseUrl()}/models`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    setRaw({ models: data });
  } catch (error) {
    setStatus(t("modelsFetchFailed", { message: error.message }));
  }
}

async function submitMessage(event) {
  event.preventDefault();
  const content = el.userInput.value.trim();
  if (!content) return;

  el.userInput.value = "";
  chatMessages.push({ role: "user", content });
  const assistantMessage = { role: "assistant", content: "" };
  chatMessages.push(assistantMessage);
  renderMessages();

  const request = buildChatRequest();
  setRaw({ request });

  try {
    const response = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    if (request.stream) {
      const streamResult = await readSSE(response, (chunk) => {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) {
          assistantMessage.content += delta;
          renderMessages();
          setRaw({ ...lastRaw, latestChunk: chunk });
        }
      });
      setRaw({ ...lastRaw, response: streamResult });
    } else {
      const data = await response.json();
      assistantMessage.content = data.choices?.[0]?.message?.content || "";
      renderMessages();
      setRaw({ request, response: data });
    }

    await checkGateway();
  } catch (error) {
    assistantMessage.content = t("requestFailed", { message: error.message });
    renderMessages();
    setRaw({ request, error: error.message });
  }
}

function buildChatRequest() {
  const messages = [];
  const system = el.systemPrompt.value.trim();
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push(...chatMessages.filter((message) => message.content.trim()));

  return {
    messages,
    max_tokens: Number(el.maxTokens.value) || 512,
    temperature: Number(el.temperature.value),
    top_p: Number(el.topP.value),
    stream: el.stream.value === "true",
  };
}

async function readSSE(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventText = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleSSEEvent(eventText, onChunk);
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    handleSSEEvent(buffer, onChunk);
  }

  return { object: "chat.completion.stream", done: true };
}

function handleSSEEvent(eventText, onChunk) {
  for (const line of eventText.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    onChunk(JSON.parse(data));
  }
}

function getBaseUrl() {
  return el.baseUrl.value.trim().replace(/\/$/, "");
}

function getGatewayRoot() {
  return getBaseUrl().replace(/\/v1$/, "");
}

function authHeaders() {
  const key = el.apiKey.value.trim();
  return key ? { authorization: `Bearer ${key}` } : {};
}

function renderMessages() {
  el.messages.innerHTML = "";
  if (!chatMessages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("emptyChat");
    el.messages.append(empty);
    return;
  }

  for (const message of chatMessages) {
    const item = document.createElement("article");
    item.className = `message ${message.role}`;
    item.innerHTML = `<strong></strong><div></div>`;
    item.querySelector("strong").textContent = message.role;
    item.querySelector("div").textContent = message.content || t("thinking");
    el.messages.append(item);
  }
  el.messages.scrollTop = el.messages.scrollHeight;
}

function statusText() {
  return loadedModel
    ? t("clientConnectedWithModel", { model: loadedModel })
    : t("clientConnectedNoModel");
}

function languageAwareStatus() {
  if (!gatewayReachable) {
    return t("disconnected");
  }
  return bridgeConnected ? statusText() : t("gatewayNeedsServer");
}

function setStatus(text) {
  el.clientStatus.textContent = text;
  el.clientStatus.title = text;
}

function setRaw(value) {
  lastRaw = value;
  el.rawJson.textContent = JSON.stringify(value, null, 2);
}

init();
