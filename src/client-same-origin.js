import { MODEL_IDS, SAME_ORIGIN_CHANNEL_NAME, SAME_ORIGIN_SERVER_STATE_KEY } from "./models.js";

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

const channel = new BroadcastChannel(SAME_ORIGIN_CHANNEL_NAME);
const SERVER_STATE_KEY = SAME_ORIGIN_SERVER_STATE_KEY;
const pending = new Map();
let availableModels = [...MODEL_IDS];
let chatMessages = [];
let lastRaw = {};
let lastServerSeen = 0;
let heartbeatTimer = 0;
let serverLoadedModel = "";

function init() {
  renderMessages();
  updateConnectionStatus();
  channel.addEventListener("message", onBridgeMessage);
  readServerSnapshot();
  connectServer();

  el.connectServer.addEventListener("click", connectServer);
  el.refreshModels.addEventListener("click", refreshServerStatus);
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
}

function connectServer() {
  if (location.protocol === "file:") {
    setStatus("请用 http://127.0.0.1 打开，file:// 页面无法稳定互联");
    return;
  }

  setStatus("正在连接...");
  channel.postMessage({ type: "client.hello", at: Date.now() });
  channel.postMessage({ type: "client.ping", at: Date.now() });

  window.clearInterval(heartbeatTimer);
  heartbeatTimer = window.setInterval(() => {
    readServerSnapshot();
    channel.postMessage({ type: "client.ping", at: Date.now() });
    if (lastServerSeen && Date.now() - lastServerSeen > 6000) {
      setStatus("连接断开，请确认 server.html 仍打开");
    }
    if (!lastServerSeen) {
      setStatus("未连接：请打开同源 server.html");
    }
  }, 2000);
}

function readServerSnapshot() {
  try {
    const state = JSON.parse(localStorage.getItem(SERVER_STATE_KEY) || "null");
    if (!state || state.type !== "server.ready") {
      return;
    }
    if (Date.now() - Number(state.updatedAt || 0) > 10000) {
      return;
    }

    lastServerSeen = Number(state.updatedAt) || Date.now();
    serverLoadedModel = state.loadedModel || "";
    if (Array.isArray(state.models)) {
      availableModels = state.models;
    }
    updateConnectionStatus();
  } catch {
    // Ignore malformed snapshots; BroadcastChannel is the primary path.
  }
}

function onBridgeMessage(event) {
  const message = event.data || {};
  if (message.type === "server.ready" || message.type === "server.pong") {
    lastServerSeen = Date.now();
    serverLoadedModel = message.loadedModel || "";
    if (Array.isArray(message.models)) {
      availableModels = message.models;
    }
    updateConnectionStatus();
    return;
  }

  const task = pending.get(message.id);
  if (!task) return;

  if (message.type === "openai.response") {
    task.resolve(message.response);
    pending.delete(message.id);
  }

  if (message.type === "openai.error") {
    task.reject(new Error(message.error?.message || "请求失败"));
    pending.delete(message.id);
  }

  if (message.type === "openai.stream") {
    task.onChunk?.(message.chunk);
  }

  if (message.type === "openai.done") {
    task.resolve(task.streamResponse);
    pending.delete(message.id);
  }
}

function refreshServerStatus() {
  channel.postMessage({ type: "client.hello", at: Date.now() });
  channel.postMessage({ type: "client.ping", at: Date.now() });
}

async function submitMessage(event) {
  event.preventDefault();
  const content = el.userInput.value.trim();
  if (!content) return;

  if (!serverLoadedModel) {
    setStatus(lastServerSeen ? "服务端尚未加载模型" : "未连接：请打开同源 server.html");
    return;
  }

  el.userInput.value = "";
  chatMessages.push({ role: "user", content });
  const assistantMessage = { role: "assistant", content: "" };
  chatMessages.push(assistantMessage);
  renderMessages();

  const request = buildChatRequest();
  setRaw({ request, serverModel: serverLoadedModel });

  try {
    if (request.stream) {
      const response = await bridgeRequest("openai.chat.completions", request, (chunk) => {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        assistantMessage.content += delta;
        renderMessages();
        setRaw({ ...lastRaw, latestChunk: chunk });
      });
      setRaw({ ...lastRaw, response });
    } else {
      const response = await bridgeRequest("openai.chat.completions", request);
      assistantMessage.content = response.choices?.[0]?.message?.content || "";
      renderMessages();
      setRaw({ request, serverModel: serverLoadedModel, response });
    }
  } catch (error) {
    assistantMessage.content = `请求失败：${error.message}`;
    renderMessages();
    setRaw({ request, serverModel: serverLoadedModel, error: error.message });
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
    metadata: {
      api_key: el.apiKey.value.trim(),
    },
  };
}

function bridgeRequest(type, request, onChunk) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      onChunk,
      streamResponse: { id, object: "chat.completion.stream", done: true },
    });
    channel.postMessage({ type, id, request });
    window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("等待服务端响应超时，请确认 server.html 已打开。"));
      }
    }, 600000);
  });
}

function renderMessages() {
  el.messages.innerHTML = "";
  if (!chatMessages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "服务端页面加载模型后，在这里开始对话。";
    el.messages.append(empty);
    return;
  }

  for (const message of chatMessages) {
    const item = document.createElement("article");
    item.className = `message ${message.role}`;
    item.innerHTML = `<strong></strong><div></div>`;
    item.querySelector("strong").textContent = message.role;
    item.querySelector("div").textContent = message.content || "生成中...";
    el.messages.append(item);
  }
  el.messages.scrollTop = el.messages.scrollHeight;
}

function setStatus(text) {
  el.clientStatus.textContent = text;
  el.clientStatus.title = text;
}

function updateConnectionStatus() {
  el.serverModel.value = serverLoadedModel || "未加载";

  if (!lastServerSeen) {
    setStatus("未连接");
    return;
  }

  if (!serverLoadedModel) {
    setStatus("已连接；服务端未加载模型");
    return;
  }

  setStatus(`已连接：${serverLoadedModel}`);
}

function setRaw(value) {
  lastRaw = value;
  el.rawJson.textContent = JSON.stringify(value, null, 2);
}

init();
