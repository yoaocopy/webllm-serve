export const CHANNEL_NAME = "webllm-openai-bridge";

export const MODEL_IDS = [
  "Qwen3.5-0.8B-q4f16_1-MLC",
  "Qwen3.5-2B-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
  "gemma3-1b-it-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "sft_model_1.5B-q4f16_1-MLC (Hugging Face)",
];

export const CUSTOM_MODEL_RECORDS = [
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
