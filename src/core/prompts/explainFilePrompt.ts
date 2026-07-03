export function explainFilePrompt(code: string): string {
  return `

Explain the following TypeScript code.

- The explanation must be written in Simplified Chinese.
- Keep all variable names, function names and class names in English.
- Return JSON using the following schema:


JSON schema:

{
  "summary": "",
  "mainLogic": [],
  "functions": [
    {
      "name": "",
      "summary": ""
    }
  ],
  "notes": []
}

Rules:
- summary should be a short overview of the file.
- mainLogic should be an array of concise bullet points.
- functions should contain one object per function with name and summary.
- notes should contain caveats, assumptions, or implementation details.
- Return only JSON. No markdown fences. No extra text.

Source Code:

\`\`\`ts
${code}
\`\`\`
`;
}
