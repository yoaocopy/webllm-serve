import { CHANNEL_NAME, CUSTOM_MODEL_RECORDS, MODEL_IDS } from "./models.js";

const SFT_MODEL_ID = "sft_model_1.5B-q4f16_1-MLC (Hugging Face)";
const SERVER_STATE_KEY = "webllm-serve-state";
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
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  currentModel: document.querySelector("#currentModel"),
  logs: document.querySelector("#logs"),
  clearLogs: document.querySelector("#clearLogs"),
};

let engine = null;
let loadedModel = "";
let loadedRuntime = "";
let busy = false;
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
  el.clearLogs.addEventListener("click", () => (el.logs.innerHTML = ""));
  channel.addEventListener("message", onBridgeMessage);
  window.setInterval(announceReady, 2000);
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

function makeAppConfig(webllm) {
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

  return {
    ...webllm.prebuiltAppConfig,
    cacheBackend: "indexeddb",
    model_list: [...prebuiltRecords, ...extraRecords],
  };
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
      appConfig: makeAppConfig(webllm),
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
  if (busy) {
    sendError(id, "WebLLM is busy. Browser mode currently processes one task at a time.");
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
        channel.postMessage({ type: "openai.stream", id, chunk });
        if (el.showResponses.checked) {
          logItem("stream", chunk);
        }
      }
      channel.postMessage({ type: "openai.done", id });
    } else {
      const response = await engine.chat.completions.create(engineRequest);
      channel.postMessage({ type: "openai.response", id, response });
      if (el.showResponses.checked) {
        logItem("response", response);
      }
    }
  } catch (error) {
    sendError(id, error.message || String(error));
  } finally {
    busy = false;
    setStatus(loadedModel ? "Serving" : "Waiting", "ready");
  }
}

function sendError(id, message) {
  logItem("error", message);
  channel.postMessage({ type: "openai.error", id, error: { message } });
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
