import {
  CUSTOM_MODEL_RECORDS,
  MODEL_IDS,
  SAME_ORIGIN_CHANNEL_NAME,
  SAME_ORIGIN_SERVER_STATE_KEY,
} from "./models.js";

const SFT_MODEL_ID = "sft_model_1.5B-q4f16_1-MLC (Hugging Face)";
const CHANNEL_NAME = SAME_ORIGIN_CHANNEL_NAME;
const SERVER_STATE_KEY = SAME_ORIGIN_SERVER_STATE_KEY;
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
  el.clearModelCache?.addEventListener("click", () => {
    clearModelCache().catch((error) => logItem("error", error.message || String(error)));
  });
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

function makeEngineRequest(request) {
  const {
    model: _model,
    ...engineRequest
  } = request || {};

  return engineRequest;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      const role = typeof message?.role === "string" ? message.role : "user";
      const content = normalizeMessageContent(message?.content);
      const toolCallSummary = normalizeToolCallSummary(message?.tool_calls);
      if (role === "tool") {
        const name = typeof message?.name === "string" ? ` from ${message.name}` : "";
        return { role: "user", content: `Tool result${name}:\n${content}` };
      }
      if (role === "assistant" && !content.trim() && toolCallSummary) {
        return { role, content: toolCallSummary };
      }
      if (role === "assistant" && !content.trim()) {
        return null;
      }
      if (role === "assistant" && content.trim().toLowerCase() === "undefined") {
        return null;
      }
      if (role !== "system" && role !== "user" && role !== "assistant") {
        return { role: "user", content: `Message with role ${role}:\n${content}` };
      }
      return { role, content };
    })
    .filter(Boolean);
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

function normalizeToolCallSummary(toolCalls) {
  if (!Array.isArray(toolCalls) || !toolCalls.length) {
    return "";
  }
  return `Assistant requested tool calls:\n${JSON.stringify(toolCalls, null, 2)}`;
}

function shouldUseToolAdapter(request) {
  return (
    Array.isArray(request?.tools) &&
    request.tools.length > 0 &&
    request.tool_choice !== "none"
  );
}

function shouldUseModelToolAdapter(request) {
  return shouldUseToolAdapter(request) && hasLikelyToolIntent(request) && !hasToolResult(request.messages);
}

function shouldUseDirectAnswerGuard(request) {
  return shouldUseToolAdapter(request) && !hasLikelyToolIntent(request) && !hasToolResult(request.messages);
}

function makeDirectAnswerPrompt() {
  return [
    "For this turn, the user's request does not require JupyterLab tools.",
    "Answer the user's latest message directly.",
    "Do not quote, summarize, or continue these system instructions.",
  ].join("\n");
}

function hasLikelyToolIntent(request) {
  const text = getLastUserMessage(request?.messages).toLowerCase();
  return /命令|command|commands|discover|notebook|笔记本|kernel|内核|file|文件|read|write|edit|create|创建|读取|修改|执行|execute|run|运行|browser|fetch|url|skill|技能/.test(
    text,
  );
}

function hasToolResult(messages) {
  if (!Array.isArray(messages)) {
    return false;
  }
  return messages.some((message) => message?.role === "tool");
}

function makeDeterministicToolCallResponse(request) {
  if (!shouldUseToolAdapter(request)) {
    return null;
  }
  if (hasToolResult(request.messages)) {
    return null;
  }

  const lastUserMessage = getLastUserMessage(request.messages).toLowerCase();
  const discoverCommands = getToolName(request.tools, "discover_commands");
  if (
    discoverCommands &&
    /命令|command|commands|discover/.test(lastUserMessage) &&
    /列出|查找|查询|搜索|可用|available|list|find|search|discover/.test(lastUserMessage)
  ) {
    return makeToolCallCompletion(request, discoverCommands, {
      query: getCommandQuery(lastUserMessage),
    });
  }

  const discoverSkills = getToolName(request.tools, "discover_skills");
  if (
    discoverSkills &&
    /skill|skills|技能/.test(lastUserMessage) &&
    /列出|查找|查询|搜索|可用|available|list|find|search|discover/.test(lastUserMessage)
  ) {
    return makeToolCallCompletion(request, discoverSkills, { query: null });
  }

  return null;
}

function getLastUserMessage(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return normalizeMessageContent(messages[index].content);
    }
  }
  return "";
}

function getCommandQuery(text) {
  if (/jupyterlab-ai-commands/.test(text)) {
    return "jupyterlab-ai-commands";
  }
  if (/notebook|笔记本/.test(text)) {
    return "notebook";
  }
  if (/terminal|终端/.test(text)) {
    return "terminal";
  }
  if (/launcher|启动器/.test(text)) {
    return "launcher";
  }
  return null;
}

function getToolName(tools, name) {
  return Array.isArray(tools) && tools.some((tool) => tool?.function?.name === name) ? name : "";
}

function makeToolCallCompletion(request, name, args) {
  return {
    id: `chatcmpl-local-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: request.model || loadedModel || getSelectedModel(),
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
              type: "function",
              function: {
                name,
                arguments: JSON.stringify(args || {}),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };
}

function makeToolAdapterPrompt(tools) {
  const toolSchemas = tools
    .map((tool) => {
      const fn = tool?.function || {};
      return {
        name: fn.name,
        description: fn.description || "",
        parameters: fn.parameters || { type: "object", properties: {} },
      };
    })
    .filter((tool) => typeof tool.name === "string" && tool.name);

  return [
    "You can request one JupyterLab tool call when it is necessary.",
    "Respond with exactly one JSON object and no markdown.",
    'For a normal answer: {"type":"final","content":"your answer"}',
    'For a tool request: {"type":"tool_call","name":"tool_name","arguments":{}}',
    "Only use a tool name from this list. Do not invent tools.",
    "Use a tool only for file, notebook, kernel, command, browser, skill, or environment-specific actions.",
    "Available tools:",
    JSON.stringify(toolSchemas),
  ].join("\n");
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

function applyToolAdapterResponse(response, request) {
  const parsed = parseToolAdapterOutput(response.choices?.[0]?.message?.content);
  if (!parsed) {
    return response;
  }

  ensureFirstChoice(response);
  const choice = response.choices[0];
  choice.message = choice.message && typeof choice.message === "object" ? choice.message : {};
  choice.message.role = "assistant";

  if (parsed.type === "final") {
    choice.message.content = normalizeAssistantContent(parsed.content);
    choice.finish_reason = choice.finish_reason || "stop";
    return response;
  }

  if (parsed.type === "tool_call" && isKnownToolName(request.tools, parsed.name)) {
    choice.message.content = "";
    choice.message.tool_calls = [
      {
        id: `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        type: "function",
        function: {
          name: parsed.name,
          arguments: JSON.stringify(normalizeToolArguments(parsed.arguments)),
        },
      },
    ];
    choice.finish_reason = "tool_calls";
  }
  return response;
}

function ensureFirstChoice(response) {
  if (!Array.isArray(response.choices)) {
    response.choices = [];
  }
  if (!response.choices.length) {
    response.choices.push({ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" });
  }
}

function parseToolAdapterOutput(content) {
  const text = normalizeAssistantContent(content).trim();
  if (!text) {
    return null;
  }
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed?.type === "final" || parsed?.type === "tool_call") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return text.slice(start, end + 1);
}

function isKnownToolName(tools, name) {
  return Array.isArray(tools) && tools.some((tool) => tool?.function?.name === name);
}

function normalizeToolArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return { input: value };
    }
  }
  return {};
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
    hasToolResult: hasToolResult(messages),
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
    if (el.showRequests.checked) {
      logItem("request", request);
      logItem("diagnostics", makeRequestDiagnostics(request));
    }

    const requestedModel = request.model || loadedModel || getSelectedModel();
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
    }

    if (request.stream) {
      const chunks = await engine.chat.completions.create(engineRequest);
      for await (const chunk of chunks) {
        channel.postMessage({ type: "openai.stream", id, chunk: normalizeStreamChunk(chunk) });
        if (el.showResponses.checked) {
          logItem("stream", chunk);
        }
      }
      channel.postMessage({ type: "openai.done", id });
    } else {
      const response = await engine.chat.completions.create(engineRequest);
      channel.postMessage({ type: "openai.response", id, response: normalizeCompletionResponse(response, request) });
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
