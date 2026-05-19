import {
  CHANNEL_NAME,
  CUSTOM_MODEL_RECORDS,
  MODEL_CATALOG,
  MODEL_IDS,
  SERVER_STATE_KEY,
  formatModelOption,
  makeModelListData,
  resolveModelId,
} from "./models.js";
import { mountLanguageSelect, t } from "./i18n.js";

const SFT_MODEL_ID = "sft_model_1.5B-q4f16_1-MLC (Hugging Face)";
const WEBLLM_RUNTIME = {
  default: "0.2.83",
  sft: "0.2.79",
};

const el = {
  serverStatus: document.querySelector("#serverStatus"),
  webgpuStatus: document.querySelector("#webgpuStatus"),
  modelSearch: document.querySelector("#modelSearch"),
  modelSelect: document.querySelector("#modelSelect"),
  modelComboButton: document.querySelector("#modelComboButton"),
  modelComboPanel: document.querySelector("#modelComboPanel"),
  modelOptionList: document.querySelector("#modelOptionList"),
  customModel: document.querySelector("#customModel"),
  autoDownload: document.querySelector("#autoDownload"),
  showRequests: document.querySelector("#showRequests"),
  showResponses: document.querySelector("#showResponses"),
  loadModel: document.querySelector("#loadModel"),
  unloadModel: document.querySelector("#unloadModel"),
  clearModelCache: document.querySelector("#clearModelCache"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  currentModel: document.querySelector("#currentModel"),
  gatewayUrl: document.querySelector("#gatewayUrl"),
  gatewayApiUrl: document.querySelector("#gatewayApiUrl"),
  serverPythonExample: document.querySelector("#serverPythonExample"),
  gatewayStatus: document.querySelector("#gatewayStatus"),
  connectGateway: document.querySelector("#connectGateway"),
  disconnectGateway: document.querySelector("#disconnectGateway"),
  logs: document.querySelector("#logs"),
  clearLogs: document.querySelector("#clearLogs"),
};

let engine = null;
let loadedModel = "";
let loadedRuntime = "";
let busy = false;
let gatewaySocket = null;
let gatewayConnected = false;
let prismFallbackLoading = false;
const webllmModules = new Map();

const channel = new BroadcastChannel(CHANNEL_NAME);

function init() {
  mountLanguageSelect();
  renderModelOptions();

  updateWebGPUStatus();
  setStatus(t("waiting"), "ready");
  announceReady();

  el.loadModel.addEventListener("click", () => {
    loadSelectedModel().catch((error) => logItem("error", error.message || String(error)));
  });
  el.unloadModel.addEventListener("click", unloadModel);
  el.clearModelCache?.addEventListener("click", () => {
    clearModelCache().catch((error) => logItem("error", error.message || String(error)));
  });
  el.clearLogs.addEventListener("click", () => (el.logs.innerHTML = ""));
  el.connectGateway?.addEventListener("click", connectGateway);
  el.disconnectGateway?.addEventListener("click", disconnectGateway);
  el.modelComboButton?.addEventListener("click", toggleModelCombo);
  el.modelSearch?.addEventListener("input", renderModelOptions);
  el.modelSelect.addEventListener("change", renderServerPythonExample);
  el.customModel.addEventListener("input", renderServerPythonExample);
  document.addEventListener("click", closeModelComboOnOutsideClick);
  document.addEventListener("keydown", closeModelComboOnEscape);
  window.addEventListener("webllm-language-change", refreshLocalizedState);
  window.addEventListener("load", highlightServerExamples);
  window.addEventListener("prism-ready", highlightServerExamples);
  window.addEventListener("load", highlightServerLogs);
  window.addEventListener("prism-ready", highlightServerLogs);
  channel.addEventListener("message", onBridgeMessage);
  window.setInterval(announceReady, 2000);
  renderServerPythonExample();
  initGatewayConfig().finally(connectGateway);
}

async function initGatewayConfig() {
  if (!el.gatewayUrl) {
    return;
  }

  try {
    const response = await fetch("./webllm-gateway-config.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const config = await response.json();
    if (config.bridge) {
      el.gatewayUrl.value = config.bridge;
    }
    if (config.base_url && el.gatewayApiUrl) {
      el.gatewayApiUrl.textContent = config.base_url;
      renderServerPythonExample();
    }
  } catch {
    // Static deployments may not have a generated gateway config.
  }
}

function updateWebGPUStatus() {
  el.webgpuStatus.textContent = navigator.gpu ? t("webgpuAvailable") : t("webgpuUnavailable");
}

function refreshLocalizedState() {
  updateWebGPUStatus();
  if (!loadedModel) {
    el.currentModel.textContent = t("notLoaded");
    el.progressText.textContent = t("progressIdle");
  }
  setGatewayStatus(gatewayConnected ? t("gatewayConnected") : t("disconnected"));
  setStatus(busy ? t("generating") : loadedModel ? t("serving") : t("waiting"), busy ? "busy" : "ready");
}

function getSelectedModel() {
  const custom = el.customModel.value.trim();
  return custom || el.modelSelect.value;
}

function renderModelOptions() {
  const selected = el.modelSelect.value;
  const query = (el.modelSearch?.value || "").trim().toLowerCase();
  const models = MODEL_CATALOG.filter((model) => {
    if (!query) {
      return true;
    }
    return model.alias.toLowerCase().includes(query) || model.id.toLowerCase().includes(query);
  });

  el.modelSelect.innerHTML = "";
  el.modelOptionList.innerHTML = "";
  for (const model of MODEL_CATALOG) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = formatModelOption(model);
    el.modelSelect.append(option);
  }

  if (selected && MODEL_CATALOG.some((model) => model.id === selected)) {
    el.modelSelect.value = selected;
  }

  const visibleModels = models;
  if (!visibleModels.length) {
    const empty = document.createElement("div");
    empty.className = "model-option model-option-empty";
    empty.textContent = t("modelNoMatches");
    el.modelOptionList.append(empty);
  }
  for (const model of visibleModels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "model-option";
    button.textContent = formatModelOption(model);
    button.dataset.modelId = model.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", model.id === selected ? "true" : "false");
    button.addEventListener("click", () => selectModel(model.id));
    el.modelOptionList.append(button);
  }

  updateModelComboButton();
  renderServerPythonExample();
}

function selectModel(modelId) {
  el.modelSelect.value = modelId;
  el.modelSearch.value = "";
  renderModelOptions();
  closeModelCombo();
  renderServerPythonExample();
}

function updateModelComboButton() {
  if (!el.modelComboButton) {
    return;
  }
  const selected = MODEL_CATALOG.find((model) => model.id === el.modelSelect.value) || MODEL_CATALOG[0];
  el.modelComboButton.textContent = selected ? formatModelOption(selected) : "";
}

function toggleModelCombo() {
  if (el.modelComboPanel.hidden) {
    openModelCombo();
  } else {
    closeModelCombo();
  }
}

function openModelCombo() {
  const rect = el.modelComboButton.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 16;
  const above = rect.top - 16;
  const openUp = below < 220 && above > below;
  const availableHeight = Math.max(120, openUp ? above : below);
  const listHeight = Math.max(80, Math.min(340, availableHeight - 72));
  el.modelComboPanel.classList.toggle("open-up", openUp);
  el.modelComboPanel.style.setProperty("--model-options-max-height", `${listHeight}px`);
  el.modelComboPanel.hidden = false;
  el.modelComboButton.setAttribute("aria-expanded", "true");
  el.modelSearch.focus();
}

function closeModelCombo() {
  el.modelComboPanel.hidden = true;
  el.modelComboButton.setAttribute("aria-expanded", "false");
}

function closeModelComboOnOutsideClick(event) {
  if (el.modelComboPanel.hidden || event.target.closest(".model-picker")) {
    return;
  }
  closeModelCombo();
}

function closeModelComboOnEscape(event) {
  if (event.key === "Escape" && !el.modelComboPanel.hidden) {
    closeModelCombo();
    el.modelComboButton.focus();
  }
}

function renderServerPythonExample() {
  if (!el.serverPythonExample) {
    return;
  }

  const baseUrl = (el.gatewayApiUrl?.textContent || "http://127.0.0.1:21434/v1").trim().replace(/\/$/, "");
  const model = loadedModel ? "loaded" : getSelectedModel() || "default";
  el.serverPythonExample.textContent = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="webllm-local",
)

response = client.chat.completions.create(
    model="${model}",
    messages=[
        {"role": "system", "content": "You are a concise local assistant."},
        {"role": "user", "content": "who are you"},
    ],
    max_tokens=128,
)

print(response.choices[0].message.content)`;
  highlightServerExamples();
}

function highlightServerExamples() {
  if (!el.serverPythonExample) {
    return;
  }
  if (!window.Prism || !window.Prism.languages?.python || !window.Prism.languages?.json) {
    loadPrismFallback();
    return;
  }
  window.Prism.highlightElement(el.serverPythonExample);
}

function loadPrismFallback() {
  if (prismFallbackLoading) {
    return;
  }
  prismFallbackLoading = true;
  const fallback = document.createElement("script");
  fallback.src = "./vendor/prism/prism.js";
  fallback.defer = true;
  fallback.onload = () => {
    prismFallbackLoading = false;
    window.dispatchEvent(new Event("prism-ready"));
  };
  fallback.onerror = () => {
    prismFallbackLoading = false;
  };
  document.head.append(fallback);
}

async function getWebLLM(modelId) {
  const version = getRuntimeVersion(modelId);
  if (!webllmModules.has(version)) {
    webllmModules.set(version, import(`https://esm.run/@mlc-ai/web-llm@${version}`));
  }

  return webllmModules.get(version);
}

function getRuntimeVersion(modelId) {
  return modelId === SFT_MODEL_ID ? WEBLLM_RUNTIME.sft : WEBLLM_RUNTIME.default;
}

function makeAppConfig(webllm, modelId) {
  const dynamicRecord = makeDynamicModelRecord(el.customModel.value.trim());
  const knownRecords = dynamicRecord ? [...CUSTOM_MODEL_RECORDS, dynamicRecord] : CUSTOM_MODEL_RECORDS;
  const customById = new Map(knownRecords.map((record) => [record.model_id, record]));
  const usedCustomIds = new Set();
  const prebuiltRecords = (webllm.prebuiltAppConfig?.model_list || []).map((record) => {
    const custom = customById.get(record.model_id);
    if (!custom) {
      return record;
    }

    usedCustomIds.add(record.model_id);
    return {
      ...record,
      ...custom,
      overrides: {
        ...(record.overrides || {}),
        ...(custom.overrides || {}),
      },
    };
  });
  const extraRecords = knownRecords.filter((record) => !usedCustomIds.has(record.model_id));

  const appConfig = {
    ...webllm.prebuiltAppConfig,
    model_list: [...prebuiltRecords, ...extraRecords],
  };

  const cacheBackend = getCacheBackend(modelId);
  if (cacheBackend) {
    appConfig.cacheBackend = cacheBackend;
  }

  return appConfig;
}

function getCacheBackend(modelId) {
  return "indexeddb";
}

function makeDynamicModelRecord(value) {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return null;
  }

  const cleanUrl = value.replace(/\/$/, "");
  const modelId = cleanUrl
    .replace("/resolve/main", "")
    .split("/")
    .filter(Boolean)
    .at(-1);
  const baseUrl = cleanUrl.includes("/resolve/main") ? cleanUrl : `${cleanUrl}/resolve/main`;

  return {
    model: baseUrl,
    model_id: modelId,
    model_lib: `${baseUrl}/model.wasm`,
  };
}

async function ensureEngine(modelId) {
  if (loadedModel === modelId && engine) {
    return;
  }
  await loadModel(modelId);
}

async function loadSelectedModel() {
  await loadModel(getSelectedModel());
}

async function loadModel(modelId) {
  if (!navigator.gpu) {
    throw new Error("WebGPU is unavailable. Please use a recent Chrome or Edge browser.");
  }
  if (busy) {
    throw new Error("WebLLM is busy. Please wait for the current load or generation to finish.");
  }

  busy = true;
  setStatus(t("loading"), "busy");
  setProgress(0, t("loadProgress", { model: modelId }));

  try {
    const webllm = await getWebLLM(modelId);
    const runtimeVersion = getRuntimeVersion(modelId);
    const engineConfig = {
      appConfig: makeAppConfig(webllm, modelId),
      initProgressCallback: (progress) => {
        const percent = Math.round((progress.progress || 0) * 100);
        setProgress(percent, progress.text || `${t("loading")} ${percent}%`);
      },
    };
    const chatOptions = getReloadOptions(modelId);

    if (!engine || loadedRuntime !== runtimeVersion) {
      engine = new webllm.MLCEngine(engineConfig);
      loadedRuntime = runtimeVersion;
    }
    await engine.reload(modelId, chatOptions);

    loadedModel = modelId;
    el.currentModel.textContent = modelId;
    renderServerPythonExample();
    setProgress(100, t("loadedProgress", { model: modelId }));
    setStatus(t("serving"), "ready");
    logItem("system", t("loadedLog", { model: modelId }));
    announceReady();
  } catch (error) {
    setStatus(t("loadFailed"), "error");
    logItem("error", error.message || String(error));
    throw error;
  } finally {
    busy = false;
  }
}

function unloadModel() {
  engine = null;
  loadedModel = "";
  loadedRuntime = "";
  el.currentModel.textContent = t("notLoaded");
  renderServerPythonExample();
  setProgress(0, t("releasedProgress"));
  setStatus(t("waiting"), "ready");
  announceReady();
}

async function clearModelCache() {
  if (busy) {
    throw new Error(t("clearBusyError"));
  }

  unloadModel();
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }

  if (indexedDB.databases) {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter(Boolean)
        .map(
          (name) =>
            new Promise((resolve, reject) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
              request.onblocked = () => resolve();
            }),
        ),
    );
  }

  setProgress(0, t("cacheClearedProgress"));
  logItem("system", t("cacheClearedLog"));
}

function getReloadOptions(modelId) {
  if (modelId === SFT_MODEL_ID) {
    return {
      temperature: 1.0,
      top_p: 1,
      max_tokens: 512,
      stop: ["<|endoftext|>", "<|im_end|>"],
    };
  }

  return undefined;
}

function makeEngineRequest(request) {
  const {
    model: _model,
    ...engineRequest
  } = request || {};

  return engineRequest;
}

function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (content == null) {
    return "";
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part?.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content);
}

function normalizeCompletionResponse(response, request = {}) {
  const normalized = response && typeof response === "object" ? { ...response } : {};
  normalized.id = normalized.id || `chatcmpl-local-${Date.now().toString(36)}`;
  normalized.object = normalized.object || "chat.completion";
  normalized.created = normalized.created || Math.floor(Date.now() / 1000);
  normalized.model = normalized.model || request.model || loadedModel || getSelectedModel();
  normalized.choices = Array.isArray(normalized.choices) ? normalized.choices : [];
  normalized.choices = normalized.choices.map((choice) => {
    const normalizedChoice = choice && typeof choice === "object" ? { ...choice } : {};
    const message =
      normalizedChoice.message && typeof normalizedChoice.message === "object"
        ? { ...normalizedChoice.message }
        : {};
    message.role = typeof message.role === "string" ? message.role : "assistant";
    message.content = normalizeAssistantContent(message.content, normalizedChoice.text);
    normalizedChoice.message = message;
    normalizedChoice.index = Number.isInteger(normalizedChoice.index) ? normalizedChoice.index : 0;
    normalizedChoice.finish_reason = normalizedChoice.finish_reason || "stop";
    return normalizedChoice;
  });
  ensureFirstChoice(normalized);
  return normalized;
}

function ensureFirstChoice(response) {
  if (!Array.isArray(response.choices)) {
    response.choices = [];
  }
  if (!response.choices.length) {
    response.choices.push({ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" });
  }
}

function normalizeStreamChunk(chunk) {
  if (!chunk || typeof chunk !== "object" || !Array.isArray(chunk.choices)) {
    return chunk;
  }

  return {
    ...chunk,
    choices: chunk.choices.map((choice) => {
      if (!choice || typeof choice !== "object" || !choice.delta || typeof choice.delta !== "object") {
        return choice;
      }
      const delta = { ...choice.delta };
      if ("content" in delta) {
        delta.content = normalizeAssistantContent(delta.content);
      }
      return { ...choice, delta };
    }),
  };
}

function completionToStreamChunks(response) {
  const id = response.id || `chatcmpl-local-${Date.now().toString(36)}`;
  const created = response.created || Math.floor(Date.now() / 1000);
  const model = response.model || loadedModel || getSelectedModel();
  const choice = response.choices?.[0] || {};
  const message = choice.message || {};
  const base = { id, object: "chat.completion.chunk", created, model };
  const chunks = [];

  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    chunks.push({
      ...base,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", tool_calls: message.tool_calls.map((toolCall, index) => ({ index, ...toolCall })) },
          finish_reason: null,
        },
      ],
    });
    chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
    return chunks;
  }

  chunks.push({
    ...base,
    choices: [{ index: 0, delta: { role: "assistant", content: message.content || "" }, finish_reason: null }],
  });
  chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason || "stop" }] });
  return chunks;
}

function normalizeAssistantContent(content, fallback = "") {
  if (typeof content === "string") {
    return content === "undefined" ? "" : content;
  }
  if (content == null) {
    return typeof fallback === "string" ? fallback : "";
  }
  return String(content);
}

function makeRequestDiagnostics(request) {
  const messages = Array.isArray(request?.messages) ? request.messages : [];
  const tools = Array.isArray(request?.tools) ? request.tools : [];
  const messageChars = messages.map((message) => normalizeMessageContent(message?.content).length);
  const systemChars = messages
    .filter((message) => message?.role === "system")
    .reduce((sum, message) => sum + normalizeMessageContent(message?.content).length, 0);
  const toolsText = tools.length ? JSON.stringify(tools) : "";
  return {
    model: request?.model || "",
    stream: Boolean(request?.stream),
    tool_choice: request?.tool_choice ?? null,
    messageCount: messages.length,
    messageChars,
    systemChars,
    toolCount: tools.length,
    toolsChars: toolsText.length,
    requestChars: safeJSONStringify(request).length,
    hasToolResult: messages.some((message) => message?.role === "tool"),
  };
}

function makeEngineTransformReport(request, engineRequest) {
  const droppedFields = [];
  const reasons = {};
  if ("model" in (request || {})) {
    droppedFields.push("model");
    reasons.model = "WebLLM engine uses the model loaded in server.html.";
  }
  return {
    droppedFields,
    reasons,
  };
}

function safeJSONStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

async function onBridgeMessage(event) {
  const message = event.data || {};
  if (message.type === "client.hello") {
    announceReady();
    return;
  }

  if (message.type === "client.ping") {
    channel.postMessage({
      type: "server.pong",
      models: MODEL_IDS,
      loadedModel,
      selectedModel: getSelectedModel(),
      at: Date.now(),
    });
    return;
  }

  if (message.type === "openai.models") {
    channel.postMessage({
      type: "openai.response",
      id: message.id,
      response: {
        object: "list",
        data: makeModelListData(),
      },
    });
    return;
  }

  if (message.type === "openai.chat.completions") {
    await handleChatCompletion(message.id, message.request);
  }
}

async function handleChatCompletion(id, request) {
  await processChatCompletion(request, {
    response: (response) => channel.postMessage({ type: "openai.response", id, response }),
    stream: (chunk) => channel.postMessage({ type: "openai.stream", id, chunk }),
    done: () => channel.postMessage({ type: "openai.done", id }),
    error: (message) => sendError(id, message),
  });
}

async function processChatCompletion(request, callbacks) {
  if (busy) {
    callbacks.error("WebLLM is busy. Browser mode currently processes one task at a time.");
    return;
  }

  busy = true;
  setStatus(t("generating"), "busy");

  try {
    if (el.showRequests.checked) {
      logItem("request", request);
      logItem("diagnostics", makeRequestDiagnostics(request));
    }

    const requestedModel = resolveModelId(request.model, { loadedModel, selectedModel: getSelectedModel() });
    request = { ...request, model: requestedModel };
    if (!engine || loadedModel !== requestedModel) {
      if (!el.autoDownload.checked) {
        throw new Error(`Model ${requestedModel} is not loaded and auto load is disabled.`);
      }
      busy = false;
      await ensureEngine(requestedModel);
      busy = true;
    }

    const engineRequest = makeEngineRequest(request);
    if (el.showRequests.checked) {
      logItem("engine diagnostics", makeRequestDiagnostics(engineRequest));
      logItem("engine transforms", makeEngineTransformReport(request, engineRequest));
    }

    if (request.stream) {
      const streamLog = el.showResponses.checked ? startStreamLog() : null;
      const chunks = await engine.chat.completions.create(engineRequest);
      for await (const chunk of chunks) {
        const normalizedChunk = normalizeStreamChunk(chunk);
        callbacks.stream(normalizedChunk);
        appendStreamLog(streamLog, normalizedChunk);
      }
      finishStreamLog(streamLog);
      callbacks.done();
    } else {
      const response = await engine.chat.completions.create(engineRequest);
      callbacks.response(normalizeCompletionResponse(response, request));
      if (el.showResponses.checked) {
        logItem("response", response);
      }
    }
  } catch (error) {
    callbacks.error(error.message || String(error));
  } finally {
    busy = false;
    setStatus(loadedModel ? t("serving") : t("waiting"), "ready");
  }
}

function sendError(id, message) {
  logItem("error", message);
  channel.postMessage({ type: "openai.error", id, error: { message } });
}

function connectGateway() {
  if (!el.gatewayUrl) {
    return;
  }

  disconnectGateway();
  setGatewayStatus(t("gatewayConnecting"));

  try {
    gatewaySocket = new WebSocket(el.gatewayUrl.value.trim());
  } catch (error) {
    setGatewayStatus(t("gatewayConnectFailed", { message: error.message }));
    return;
  }

  gatewaySocket.addEventListener("open", () => {
    gatewayConnected = true;
    setGatewayStatus(t("gatewayConnected"));
    sendGatewayStatus();
    logItem("system", `Gateway connected: ${el.gatewayUrl.value.trim()}`);
  });

  gatewaySocket.addEventListener("message", (event) => {
    onGatewayMessage(event.data).catch((error) => {
      logItem("error", error.message || String(error));
    });
  });

  gatewaySocket.addEventListener("close", () => {
    gatewayConnected = false;
    setGatewayStatus(t("disconnected"));
  });

  gatewaySocket.addEventListener("error", () => {
    gatewayConnected = false;
    setGatewayStatus(t("gatewayError"));
  });
}

function disconnectGateway() {
  if (gatewaySocket) {
    gatewaySocket.close();
  }
  gatewaySocket = null;
  gatewayConnected = false;
  setGatewayStatus(t("disconnected"));
}

async function onGatewayMessage(raw) {
  const message = JSON.parse(raw);
  if (message.type === "gateway.hello") {
    sendGatewayStatus();
    return;
  }

  if (message.type === "gateway.chat.completions") {
    await processChatCompletion(message.request || {}, {
      response: (response) => sendGatewayMessage({ type: "gateway.response", id: message.id, response }),
      stream: (chunk) => sendGatewayMessage({ type: "gateway.stream", id: message.id, chunk }),
      done: () => sendGatewayMessage({ type: "gateway.done", id: message.id }),
      error: (text) =>
        sendGatewayMessage({
          type: "gateway.error",
          id: message.id,
          error: { message: text },
        }),
    });
  }
}

function sendGatewayStatus() {
  sendGatewayMessage({
    type: "gateway.status",
    models: MODEL_IDS,
    loadedModel,
    selectedModel: getSelectedModel(),
  });
}

function sendGatewayMessage(message) {
  if (!gatewaySocket || gatewaySocket.readyState !== WebSocket.OPEN) {
    return;
  }
  gatewaySocket.send(JSON.stringify(message));
}

function setGatewayStatus(text) {
  if (el.gatewayStatus) {
    el.gatewayStatus.textContent = text;
  }
}


function announceReady() {
  const state = {
    type: "server.ready",
    models: MODEL_IDS,
    loadedModel,
    selectedModel: getSelectedModel(),
    updatedAt: Date.now(),
  };
  localStorage.setItem(SERVER_STATE_KEY, JSON.stringify(state));
  channel.postMessage(state);
  sendGatewayStatus();
}

function setStatus(text, state) {
  el.serverStatus.textContent = text;
  el.serverStatus.dataset.state = state;
}

function setProgress(percent, text) {
  el.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  el.progressText.textContent = text;
}

function logItem(kind, value) {
  const entry = document.createElement("article");
  entry.className = `log-entry ${kind}`;
  const time = new Date().toLocaleTimeString();
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const isJson = typeof value !== "string";
  entry.innerHTML = `<header><strong>${kind}</strong><span>${time}</span></header><pre><code></code></pre>`;
  const code = entry.querySelector("code");
  if (isJson) {
    code.className = "language-json";
  }
  code.textContent = body;
  el.logs.prepend(entry);
  highlightLogCode(code);
}

function startStreamLog() {
  const entry = document.createElement("article");
  entry.className = "log-entry stream";
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `
    <header><strong>stream response</strong><span>${time}</span></header>
    <div class="stream-log-content"></div>
    <details>
      <summary>latest chunk</summary>
      <pre><code class="language-json"></code></pre>
    </details>
  `;
  el.logs.prepend(entry);
  return {
    entry,
    content: entry.querySelector(".stream-log-content"),
    latest: entry.querySelector("code"),
  };
}

function appendStreamLog(streamLog, chunk) {
  if (!streamLog) {
    return;
  }

  const delta = extractStreamDelta(chunk);
  if (delta) {
    streamLog.content.textContent += delta;
  }
  streamLog.latest.textContent = JSON.stringify(chunk, null, 2);
  highlightLogCode(streamLog.latest);
}

function finishStreamLog(streamLog) {
  if (!streamLog || streamLog.content.textContent.trim()) {
    return;
  }
  streamLog.content.textContent = "(no text delta)";
}

function highlightLogCode(code) {
  if (!code?.classList.contains("language-json")) {
    return;
  }
  if (!window.Prism || !window.Prism.languages?.json) {
    loadPrismFallback();
    return;
  }
  window.Prism.highlightElement(code);
}

function highlightServerLogs() {
  el.logs.querySelectorAll("code.language-json").forEach(highlightLogCode);
}

function extractStreamDelta(chunk) {
  const choice = chunk?.choices?.[0];
  const delta = choice?.delta?.content;
  if (typeof delta === "string") {
    return delta;
  }
  if (Array.isArray(delta)) {
    return delta
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }
  return "";
}

init();
