import { CHANNEL_NAME, CUSTOM_MODEL_RECORDS, MODEL_IDS, SERVER_STATE_KEY } from "./models.js";

const SFT_MODEL_ID = "sft_model_1.5B-q4f16_1-MLC (Hugging Face)";
const WEBLLM_RUNTIME = {
  default: "0.2.83",
  sft: "0.2.79",
};

const el = {
  serverStatus: document.querySelector("#serverStatus"),
  webgpuStatus: document.querySelector("#webgpuStatus"),
  modelSelect: document.querySelector("#modelSelect"),
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
const webllmModules = new Map();

const channel = new BroadcastChannel(CHANNEL_NAME);

function init() {
  for (const model of MODEL_IDS) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    el.modelSelect.append(option);
  }

  el.webgpuStatus.textContent = navigator.gpu ? "WebGPU available" : "WebGPU unavailable";
  setStatus("Waiting", "ready");
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
  channel.addEventListener("message", onBridgeMessage);
  window.setInterval(announceReady, 2000);
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
    }
  } catch {
    // Static deployments may not have a generated gateway config.
  }
}

function getSelectedModel() {
  const custom = el.customModel.value.trim();
  return custom || el.modelSelect.value;
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
  setStatus("Loading", "busy");
  setProgress(0, `Loading ${modelId}`);

  try {
    const webllm = await getWebLLM(modelId);
    const runtimeVersion = getRuntimeVersion(modelId);
    const engineConfig = {
      appConfig: makeAppConfig(webllm, modelId),
      initProgressCallback: (progress) => {
        const percent = Math.round((progress.progress || 0) * 100);
        setProgress(percent, progress.text || `Loading ${percent}%`);
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
    setProgress(100, `${modelId} loaded`);
    setStatus("Serving", "ready");
    logItem("system", `Loaded model: ${modelId}`);
    announceReady();
  } catch (error) {
    setStatus("Load failed", "error");
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
  el.currentModel.textContent = "Not loaded";
  setProgress(0, "Engine reference released. Browser model cache is kept.");
  setStatus("Waiting", "ready");
  announceReady();
}

async function clearModelCache() {
  if (busy) {
    throw new Error("WebLLM is busy. Please clear cache after loading or generation finishes.");
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

  setProgress(0, "Browser model caches cleared. Reload the model to download it again.");
  logItem("system", "Browser Cache API and IndexedDB model caches were cleared for this origin.");
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
        data: MODEL_IDS.map((id) => ({ id, object: "model", owned_by: "webllm" })),
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
  setStatus("Generating", "busy");

  try {
    const requestedModel = request.model || loadedModel || getSelectedModel();
    if (!engine || loadedModel !== requestedModel) {
      if (!el.autoDownload.checked) {
        throw new Error(`Model ${requestedModel} is not loaded and auto load is disabled.`);
      }
      busy = false;
      await ensureEngine(requestedModel);
      busy = true;
    }

    const engineRequest = { ...request, model: undefined };
    if (el.showRequests.checked) {
      logItem("request", request);
    }

    if (request.stream) {
      const chunks = await engine.chat.completions.create(engineRequest);
      for await (const chunk of chunks) {
        callbacks.stream(chunk);
        if (el.showResponses.checked) {
          logItem("stream", chunk);
        }
      }
      callbacks.done();
    } else {
      const response = await engine.chat.completions.create(engineRequest);
      callbacks.response(response);
      if (el.showResponses.checked) {
        logItem("response", response);
      }
    }
  } catch (error) {
    callbacks.error(error.message || String(error));
  } finally {
    busy = false;
    setStatus(loadedModel ? "Serving" : "Waiting", "ready");
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
  setGatewayStatus("连接中...");

  try {
    gatewaySocket = new WebSocket(el.gatewayUrl.value.trim());
  } catch (error) {
    setGatewayStatus(`连接失败：${error.message}`);
    return;
  }

  gatewaySocket.addEventListener("open", () => {
    gatewayConnected = true;
    setGatewayStatus("已连接");
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
    setGatewayStatus("未连接");
  });

  gatewaySocket.addEventListener("error", () => {
    gatewayConnected = false;
    setGatewayStatus("连接错误");
  });
}

function disconnectGateway() {
  if (gatewaySocket) {
    gatewaySocket.close();
  }
  gatewaySocket = null;
  gatewayConnected = false;
  setGatewayStatus("未连接");
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
  entry.innerHTML = `<header><strong>${kind}</strong><span>${time}</span></header><pre></pre>`;
  entry.querySelector("pre").textContent = body;
  el.logs.prepend(entry);
}

init();
