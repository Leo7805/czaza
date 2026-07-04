# czaza

**czaza** is an AI-powered code reader designed to help developers understand source code more efficiently.

Unlike AI coding assistants, **czaza focuses on reading, not writing**.

Its goal is to explain code clearly, from high-level structure down to individual lines and language syntax.

## Why

Modern AI coding tools are excellent at generating and modifying code.

However, when reading an unfamiliar codebase, developers often ask questions like:

- What does this file do?
- What is this function responsible for?
- Why is this block of code here?
- What does this syntax or API mean?

czaza aims to answer those questions with structured, layered explanations.

## Features

Current MVP:

- Explain TypeScript / TSX source code
- File-level summary
- Function / code unit explanation
- Line-by-line explanation
- Structured JSON output
- AI-powered natural language explanations

Planned:

- Compiler-assisted code structure extraction
- AI semantic blocks
- Syntax knowledge database
- Explanation caching
- VS Code extension
- Hover explanations
- Personal notes

## Architecture

czaza combines compiler analysis with LLM reasoning.

```text
Source Code
        │
        ▼
Compiler / Parser
        │
        ▼
Code Structure
(file / units / lines)
        │
        ▼
LLM
        │
        ▼
Structured Explanation (JSON)
        │
        ▼
Web / VS Code / Future UI
```

The compiler extracts code structure.

The LLM explains what the code means.

## Tech Stack

- React
- TypeScript
- Vite
- DeepSeek API
- TypeScript Compiler API

## Structure

```text
CodeExplanation
│
├── File
│
├── Code Units
│   ├── Component
│   ├── Function
│   ├── Hook
│   ├── Interface
│   └── ...
│
├── Semantic Units
│   ├── Rendering
│   ├── State Management
│   ├── Event Handling
│   └── ...
│
└── Code Lines
```

```text
CodeExplanation
├── language : Language
├── file : Explanation
│   ├── summary : string
│   └── detail : string
├── units : CodeUnit[]
│   └── CodeUnit
│       ├── id : string
│       ├── kind : CodeUnitKind
│       ├── name : string
│       ├── range : Range
│       │   ├── startLine : number
│       │   └── endLine : number
│       ├── code : string
│       └── explanation : Explanation
│           ├── summary : string
│           └── detail : string
├── semanticUnits : SemanticUnit[]
│   └── SemanticUnit
│       ├── id : string
│       ├── name : string
│       ├── range : Range
│       │   ├── startLine : number
│       │   └── endLine : number
│       └── explanation : Explanation
│           ├── summary : string
│           └── detail : string
├── lines : CodeLine[]
│   └── CodeLine
│       ├── lineNumber : number
│       ├── code : string
│       └── explanation : Explanation
│           ├── summary : string
│           └── detail : string
└── userNote? : string

Shared Types
├── Explanation
│   ├── summary : string
│   └── detail : string
├── Range
│   ├── startLine : number
│   └── endLine : number
├── Language
│   ├── ts
│   ├── tsx
│   ├── js
│   ├── jsx
│   ├── html
│   └── css
└── CodeUnitKind
    ├── component
    ├── function
    ├── hook
    ├── class
    ├── method
    ├── interface
    ├── type
    ├── enum
    └── variable
```

## Status

This project is in its early prototype stage.

It is currently built primarily for personal learning and code understanding.

```

```
