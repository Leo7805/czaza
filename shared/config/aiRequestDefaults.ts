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

  /** Request sizing policy for one explicitly selected source line. */
  singleLine: {
    /** Number of source lines included before and after the target line. */
    surroundingLineRadius: 20,

    /** Maximum output tokens sent for one line explanation request. */
    maxOutputTokens: 4_000,
  },

  /** Request sizing policy for nearby line-batch analysis. */
  lineBatch: {
    /** Number of source lines included before and after the active line. */
    surroundingLineRadius: 20,

    /** Maximum output tokens sent for one nearby-line batch request. */
    maxOutputTokens: 8_000,
  },

  /** Request sizing policy for one explicitly selected section. */
  section: {
    /** Maximum output tokens sent for one section explanation request. */
    maxOutputTokens: 4_000,
  },

  /** Local source-line selection policy shared by batch and single-line analysis. */
  lineAnalysis: {
    /** Dependency declarations that should be removed before line-level AI requests. */
    skipDependencyDirectives: {
      /** Whether configured dependency declarations are skipped by default. */
      enabled: true,

      /** VS Code language ids grouped by the syntax rule used to detect dependencies. */
      languageIds: {
        /** Languages that use C preprocessor include directives. */
        cInclude: ["c", "cpp"],

        /** Languages that use C# namespace using directives. */
        csharpUsing: ["csharp"],

        /** Languages that use Python import and from-import statements. */
        pythonImport: ["python"],

        /** Languages that use ECMAScript static import declarations. */
        ecmaScriptImport: [
          "javascript",
          "javascriptreact",
          "typescript",
          "typescriptreact",
        ],
      },
    },
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
