export type Note = {
  title: string;
  summary: string;
  detail: string;
};

export type TokenDict = Record<string, Note>;

export type TailwindToken = {
  token: string;
  explanation: string;
};

// export type ParsedTailwindClass = {
//   original: string;
//   modifiers: string[];
//   baseClass: string;
// };

export type ParsedTailwindClass = {
  original: string;
  modifiers: string[];
  property: string;
  value: string | null;
};

export type TailwindExplanationItem = {
  token: string;
  note: Note | null;
};

// export type TailwindExplanation = {
//   original: string;
//   items: TailwindExplanationItem[];
// };

export type TailwindExplanation = {
  original: string;

  modifiers: TailwindExplanationItem[];

  property: TailwindExplanationItem;

  value: TailwindExplanationItem | null;
};

/**
 * Represents the explanation of a code file, including its summary, main logic, functions, and notes.
 * @example
 * ```ts
 * {
 * "fileSummary": "...",
 *  "mainLogic": [
 *    "..."
 *  ],
 *  "functions": [
 *    {
 *      "name": "...",
 *      "summary": "..."
 *    }
 *  ],
 *  "notes": [
 *    "..."
 *  ]
 *}
 * ```
 */
export type CodeExplanation = {
  summary: string;

  mainLogic: string[];

  functions: {
    name: string;
    summary: string;
  }[];

  notes: string[];
};
