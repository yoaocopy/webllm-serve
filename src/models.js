export const CHANNEL_NAME = "webllm-openai-bridge";
export const SAME_ORIGIN_CHANNEL_NAME = "webllm-openai-bridge-same-origin";
export const SERVER_STATE_KEY = "webllm-serve-state";
export const SAME_ORIGIN_SERVER_STATE_KEY = "webllm-serve-state-same-origin";

export const MODEL_CATALOG = [
  { alias: "default", id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" },
  { alias: "m001", id: "gemma3-1b-it-q4f16_1-MLC" },
  { alias: "m002", id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC" },
  { alias: "m003", id: "Llama-3.2-1B-Instruct-q4f16_1-MLC" },
  { alias: "m004", id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" },
  { alias: "m005", id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" },
  { alias: "m006", id: "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC" },
  { alias: "m007", id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC" },
  { alias: "m008", id: "Qwen3.5-0.8B-q4f16_1-MLC" },
  { alias: "m009", id: "Qwen3.5-2B-q4f16_1-MLC" },
  { alias: "m010", id: "sft_model_1.5B-q4f16_1-MLC (Hugging Face)" },
];

export const CURRENT_MODEL_ALIASES = new Set(["current", "loaded"]);
export const MODEL_IDS = MODEL_CATALOG.map((model) => model.id);
export const MODEL_ALIAS_BY_ID = new Map(MODEL_CATALOG.map((model) => [model.id, model.alias]));
export const MODEL_ID_BY_ALIAS = new Map(MODEL_CATALOG.map((model) => [model.alias.toLowerCase(), model.id]));

export function formatModelOption(model) {
  return `${model.alias} - ${model.id}`;
}

export function resolveModelId(value, { loadedModel = "", selectedModel = "" } = {}) {
  const model = String(value || "").trim();
  if (!model) {
    return loadedModel || selectedModel;
  }

  const normalized = model.toLowerCase();
  if (CURRENT_MODEL_ALIASES.has(normalized)) {
    return loadedModel || selectedModel;
  }

  return MODEL_ID_BY_ALIAS.get(normalized) || model;
}

export function makeModelListData() {
  return [
    ...MODEL_CATALOG.map((model) => ({
      id: model.id,
      object: "model",
      owned_by: "webllm",
      alias: model.alias,
    })),
  ];
}

export const CUSTOM_MODEL_RECORDS = [
  {
    model_id: "Qwen3.5-2B-q4f16_1-MLC",
    overrides: {
      context_window_size: 8192,
    },
  },
  {
    model_id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    overrides: {
      context_window_size: 8192,
    },
  },
  {
    model_id: "gemma3-1b-it-q4f16_1-MLC",
    overrides: {
      context_window_size: 4096,
      sliding_window_size: -1,
    },
  },
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
  },
];
