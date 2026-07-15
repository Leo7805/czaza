/**
 * Centralizes code-level defaults that control AI request cost, size, and latency.
 */

/**
 * Code-level defaults for supported AI requests and model capabilities.
 *
 * These values are maintained by CZaza rather than exposed as VS Code user
 * settings. Protocol constants, error messages, and storage settings do not
 * belong in this configuration.
 *
 * @example
 * const timeoutMs = AI_REQUEST_DEFAULTS.deepSeek.timeoutMs;
 */
export const AI_REQUEST_DEFAULTS = {
  /** Default request behavior for the DeepSeek provider. */
  deepSeek: {
    /** Chat completions endpoint used when a caller does not provide another URL. */
    url: "https://api.deepseek.com/chat/completions",

    /** Model used by tests and non-VS Code callers when no model is specified. */
    defaultModel: "deepseek-v4-flash",

    /** Maximum request duration in milliseconds before the request is aborted. */
    timeoutMs: 75_000,

    /** Sampling temperature used for stable code explanations. */
    temperature: 0.2,
  },

  /** Application safety and output-estimation policy for All Notes generation. */
  allNotes: {
    /** Maximum number of source lines that may receive individual AI line notes. */
    maxCandidateLines: 300,

    /** Maximum conservatively estimated input tokens allowed by CZaza. */
    maxEstimatedInputTokens: 100_000,

    /** Maximum output-token cap CZaza may send in one All Notes request. */
    maxRequestOutputTokens: 64_000,

    /** Estimated output tokens reserved for file-level and section-level notes. */
    baseOutputTokens: 8_000,

    /** Estimated output tokens reserved for each generated line note. */
    tokensPerLineNote: 150,

    /** Safety multiplier applied to the complete estimated structured output. */
    outputSafetyMultiplier: 1.2,
  },

  /** Published model limits used to validate request size before execution. */
  modelCapabilities: {
    /** Shared capabilities for the supported DeepSeek V4 variants. */
    deepSeekV4: {
      /** Maximum combined input and output context supported by the model. */
      contextWindowTokens: 1_000_000,

      /** Maximum output tokens supported by the model. */
      maxOutputTokens: 384_000,
    },
  },
} as const;
