const LANGUAGE_KEY = "webllm-serve-language";

export const translations = {
  zh: {
    languageLabel: "语言",
    chinese: "中文",
    english: "English",

    homeTitle: "WebLLM Serve：零安装，轻松调用 LLM",
    homeLead:
      "先启动 Go gateway，再按照终端中打印的主页地址打开本页面。页面会尝试读取 gateway 生成的配置并显示实际端口；如果端口显示和终端日志不同，请以 gateway 启动日志为准。",
    openServer: "打开服务端",
    openClient: "打开 HTTP 客户端",
    sameOriginServer: "同源服务端",
    sameOriginClient: "同源客户端",
    gatewayInfo: "Gateway 信息",
    currentGateway: "当前 gateway",
    defaultPort: "默认端口",
    defaultPortValue: "21434 起，自动向上寻找",
    stepsLabel: "使用步骤",
    stepStartGatewayTitle: "启动 gateway",
    stepStartGatewayBody: "在仓库根目录运行 go run .，或运行编译后的二进制文件。",
    stepLoadModelTitle: "加载模型",
    stepLoadModelBody: "打开服务端页面，选择模型并保持该浏览器标签页运行。",
    stepUseApiTitle: "开始调用",
    stepUseApiBody: "使用 HTTP 客户端页面，或通过 curl、CLI、OpenAI SDK 调用本地 API。",
    homePortNote:
      "端口默认从 21434 开始；如果端口被占用，gateway 会自动向上寻找可用端口，并把结果写入 webllm-gateway-config.json。跨页面和外部请求都应以 gateway 启动日志显示的实际端口为准。",
    homeBinaryNote:
      "Windows 二进制示例：.\\webllm-gateway-windows-amd64.exe。macOS 二进制示例：./webllm-gateway-darwin-arm64。",
    apiExamplesSummary: "查看 curl、CLI、OpenAI SDK 调用示例",
    apiExamplesIntro: "以下示例使用问题 who are you。示例 URL 会优先使用当前 gateway 实际 API 地址。Windows 11 用户可优先参考 CMD、PowerShell 或 Windows Terminal 说明；WSL 访问 Windows 本机端口时可能需要额外处理。",
    windowsCmdExampleTitle: "Windows 11 CMD",
    windowsPowershellExampleTitle: "Windows 11 PowerShell",
    windowsPowershellUtf8ExampleTitle: "PowerShell UTF-8 Characters",
    windowsTerminalExampleTitle: "Windows Terminal 说明",
    curlExampleTitle: "curl",
    cliExampleTitle: "OpenAI CLI 风格",
    pythonSdkExampleTitle: "OpenAI Python SDK",
    nodeSdkExampleTitle: "OpenAI Node SDK",

    serverTitle: "WebLLM 服务端",
    serverInitialStatus: "准备中",
    modelPanelTitle: "模型",
    checkWebGPU: "检查 WebGPU...",
    modelSearchPlaceholder: "输入 alias 或 model id 过滤模型",
    modelSelectLabel: "选择模型（alias - model id，API 可使用 alias 或 model id）",
    modelNoMatches: "没有匹配的模型",
    customModelLabel: "自定义模型 ID 或 URL",
    customModelPlaceholder: "可选：输入 model_id 或 Hugging Face URL",
    autoDownloadLabel: "请求未加载模型时自动加载",
    showRequestsLabel: "显示请求",
    showResponsesLabel: "显示返回",
    loadModelButton: "加载模型",
    unloadModelButton: "卸载引用",
    clearModelCacheButton: "清理模型缓存",
    progressIdle: "尚未加载模型",
    gatewayPanelTitle: "本地 Gateway",
    disconnected: "未连接",
    gatewayWsLabel: "Gateway WebSocket",
    connectGatewayButton: "连接 Gateway",
    disconnectGatewayButton: "断开",
    currentModelLabel: "当前模型",
    notLoaded: "未加载",
    gatewayNote:
      "这里连接 Go gateway。外部 OpenAI HTTP 请求会经 WebSocket 转发到本页运行的 WebLLM。",
    serverPythonExampleSummary: "Python API Client 示例",
    serverPythonExampleIntro: "保持本页连接 Gateway 并加载模型后，可以用 OpenAI Python SDK 调用当前本地 API。",
    logsTitle: "请求和返回记录",
    clearButton: "清空",
    webgpuAvailable: "WebGPU 可用",
    webgpuUnavailable: "WebGPU 不可用",
    waiting: "等待中",
    loading: "加载中",
    serving: "服务中",
    loadFailed: "加载失败",
    generating: "生成中",
    loadProgress: "正在加载 {model}",
    loadedProgress: "{model} 已加载",
    loadedLog: "已加载模型：{model}",
    releasedProgress: "已释放引擎引用。浏览器模型缓存仍会保留。",
    clearBusyError: "WebLLM 正忙，请在加载或生成结束后再清理缓存。",
    cacheClearedProgress: "浏览器模型缓存已清理。重新加载模型时会再次下载。",
    cacheClearedLog: "已清理当前源下的浏览器 Cache API 和 IndexedDB 模型缓存。",
    gatewayConnecting: "连接中...",
    gatewayConnected: "已连接",
    gatewayConnectFailed: "连接失败：{message}",
    gatewayError: "连接错误",

    clientTitle: "HTTP 客户端",
    serverModelLabel: "Gateway 当前模型",
    systemPromptLabel: "System Prompt",
    maxTokensLabel: "Max Tokens",
    temperatureLabel: "Temperature",
    topPLabel: "Top P",
    streamLabel: "Stream",
    streamOn: "开启",
    streamOff: "关闭",
    checkGatewayButton: "检查 Gateway",
    refreshModelsButton: "刷新模型",
    clearChatButton: "清空对话",
    clientNote:
      "这个页面通过 OpenAI HTTP API 调用 Go gateway；实际推理由 server.html 中加载的 WebLLM 完成。",
    userInputPlaceholder: "输入消息，Enter 发送，Shift+Enter 换行",
    sendButton: "发送",
    rawSummary: "原始 OpenAI 请求/响应",
    checkingGateway: "正在连接...",
    gatewayNeedsServer: "Gateway 已启动，但 server.html 尚未连接",
    gatewayCheckFailed: "连接失败：{message}",
    modelsFetchFailed: "刷新模型失败：{message}",
    requestFailed: "请求失败：{message}",
    emptyChat: "启动 Go gateway 并在 server.html 加载模型后，就可以在这里发送消息。",
    thinking: "生成中...",
    clientConnectedWithModel: "已连接：{model}",
    clientConnectedNoModel: "已连接：服务端还没有加载模型",
  },
  en: {
    languageLabel: "Language",
    chinese: "中文",
    english: "English",

    homeTitle: "WebLLM Serve: Zero Installation, Easy LLM Access",
    homeLead:
      "Start the Go gateway first, then open the home URL printed in the terminal. This page reads the generated gateway config and shows the actual port. If the page and terminal disagree, trust the gateway startup log.",
    openServer: "Open Server",
    openClient: "Open HTTP Client",
    sameOriginServer: "Same-Origin Server",
    sameOriginClient: "Same-Origin Client",
    gatewayInfo: "Gateway information",
    currentGateway: "Current gateway",
    defaultPort: "Default port",
    defaultPortValue: "Starts at 21434, then searches upward",
    stepsLabel: "Usage steps",
    stepStartGatewayTitle: "Start gateway",
    stepStartGatewayBody: "Run go run . from the repository root, or run a compiled gateway binary.",
    stepLoadModelTitle: "Load a model",
    stepLoadModelBody: "Open the server page, choose a model, and keep that browser tab running.",
    stepUseApiTitle: "Start calling",
    stepUseApiBody: "Use the HTTP client page, or call the local API with curl, CLI tools, or the OpenAI SDK.",
    homePortNote:
      "The default port starts at 21434. If it is occupied, the gateway searches upward and writes the selected address to webllm-gateway-config.json. Browser pages and external callers should use the actual port printed by the gateway startup log.",
    homeBinaryNote:
      "Windows binary example: .\\webllm-gateway-windows-amd64.exe. macOS binary example: ./webllm-gateway-darwin-arm64.",
    apiExamplesSummary: "Show curl, CLI, and OpenAI SDK examples",
    apiExamplesIntro: "The examples below ask who are you. The example URL follows the current gateway API address when available. Windows 11 users can start with the CMD, PowerShell, or Windows Terminal notes. WSL may need extra handling to reach a gateway running on Windows.",
    windowsCmdExampleTitle: "Windows 11 CMD",
    windowsPowershellExampleTitle: "Windows 11 PowerShell",
    windowsPowershellUtf8ExampleTitle: "PowerShell UTF-8 Characters",
    windowsTerminalExampleTitle: "Windows Terminal notes",
    curlExampleTitle: "curl",
    cliExampleTitle: "OpenAI CLI style",
    pythonSdkExampleTitle: "OpenAI Python SDK",
    nodeSdkExampleTitle: "OpenAI Node SDK",

    serverTitle: "WebLLM Server",
    serverInitialStatus: "Preparing",
    modelPanelTitle: "Model",
    checkWebGPU: "Checking WebGPU...",
    modelSearchPlaceholder: "Filter by alias or model id",
    modelSelectLabel: "Select model (alias - model id, can use either alias or model id in the API)",
    modelNoMatches: "No matching models",
    customModelLabel: "Custom model ID or URL",
    customModelPlaceholder: "Optional: model_id or Hugging Face URL",
    autoDownloadLabel: "Auto-load model when requested",
    showRequestsLabel: "Show requests",
    showResponsesLabel: "Show responses",
    loadModelButton: "Load Model",
    unloadModelButton: "Unload Reference",
    clearModelCacheButton: "Clear Model Cache",
    progressIdle: "No model loaded yet",
    gatewayPanelTitle: "Local Gateway",
    disconnected: "Disconnected",
    gatewayWsLabel: "Gateway WebSocket",
    connectGatewayButton: "Connect Gateway",
    disconnectGatewayButton: "Disconnect",
    currentModelLabel: "Current model",
    notLoaded: "Not loaded",
    gatewayNote:
      "This page connects to the Go gateway. External OpenAI HTTP requests are forwarded over WebSocket to WebLLM running in this tab.",
    serverPythonExampleSummary: "Python API Client example",
    serverPythonExampleIntro:
      "Keep this page connected to the gateway and load a model, then call the current local API with the OpenAI Python SDK.",
    logsTitle: "Request and Response Logs",
    clearButton: "Clear",
    webgpuAvailable: "WebGPU available",
    webgpuUnavailable: "WebGPU unavailable",
    waiting: "Waiting",
    loading: "Loading",
    serving: "Serving",
    loadFailed: "Load failed",
    generating: "Generating",
    loadProgress: "Loading {model}",
    loadedProgress: "{model} loaded",
    loadedLog: "Loaded model: {model}",
    releasedProgress: "Engine reference released. Browser model cache is kept.",
    clearBusyError: "WebLLM is busy. Please clear cache after loading or generation finishes.",
    cacheClearedProgress: "Browser model caches cleared. Reload the model to download it again.",
    cacheClearedLog: "Browser Cache API and IndexedDB model caches were cleared for this origin.",
    gatewayConnecting: "Connecting...",
    gatewayConnected: "Connected",
    gatewayConnectFailed: "Connection failed: {message}",
    gatewayError: "Connection error",

    clientTitle: "HTTP Client",
    serverModelLabel: "Gateway current model",
    systemPromptLabel: "System Prompt",
    maxTokensLabel: "Max Tokens",
    temperatureLabel: "Temperature",
    topPLabel: "Top P",
    streamLabel: "Stream",
    streamOn: "On",
    streamOff: "Off",
    checkGatewayButton: "Check Gateway",
    refreshModelsButton: "Refresh Models",
    clearChatButton: "Clear Chat",
    clientNote:
      "This page calls the Go gateway through an OpenAI-compatible HTTP API. The actual inference runs in server.html with WebLLM.",
    userInputPlaceholder: "Type a message. Enter to send, Shift+Enter for a new line",
    sendButton: "Send",
    rawSummary: "Raw OpenAI request/response",
    checkingGateway: "Connecting...",
    gatewayNeedsServer: "Gateway is running, but server.html is not connected",
    gatewayCheckFailed: "Connection failed: {message}",
    modelsFetchFailed: "Refresh models failed: {message}",
    requestFailed: "Request failed: {message}",
    emptyChat: "Start the Go gateway and load a model in server.html, then send a message here.",
    thinking: "Generating...",
    clientConnectedWithModel: "Connected: {model}",
    clientConnectedNoModel: "Connected: no model loaded on the server yet",
  },
};

export function getLanguage() {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored && translations[stored]) {
    return stored;
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function setLanguage(language) {
  const next = translations[language] ? language : "zh";
  localStorage.setItem(LANGUAGE_KEY, next);
  applyTranslations();
  window.dispatchEvent(new CustomEvent("webllm-language-change", { detail: { language: next } }));
}

export function t(key, params = {}) {
  const language = getLanguage();
  const template = translations[language]?.[key] || translations.zh[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

export function applyTranslations(root = document) {
  const language = getLanguage();
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";

  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
}

export function mountLanguageSelect(selector = "#languageSelect") {
  const select = document.querySelector(selector);
  if (!select) {
    applyTranslations();
    return;
  }
  select.value = getLanguage();
  select.addEventListener("change", () => setLanguage(select.value));
  applyTranslations();
}
