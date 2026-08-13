# AI Agent 修改笔记 MVP 讨论稿

状态：MVP 已实现并完成自动测试与真实流程验证；本文保留设计决定、实施结果和后续改进方向。

## 目标

AI Agent 修改代码后，通过 CZaza 提供的受控函数检查和更新相关笔记，不直接编辑 `.czaza/notes/` 中的 JSON 文件。完成后按源文件列出实际修改的笔记。

## MVP 流程

```text
Agent 修改代码
  ↓
调用检查函数读取变更文件及已有笔记
  ↓
Agent 判断哪些 AI 笔记需要更新或新增
  ↓
调用更新函数提交结构化变更
  ↓
函数校验并通过 WorkspaceNoteStore 保存
  ↓
返回按源文件分组的修改列表
```

## 两个受控函数

### `inspectAgentNotes`

输入本次修改的源文件路径，返回 Agent 判断所需的信息：

- 源文件路径和当前代码；
- 当前 `sourceHash`；
- 已有 File、Section 和 Line Notes；
- 笔记是 AI 创建还是用户创建；
- 当前笔记状态。

该函数只读取，不修改任何数据。

第 1 步确定的输入和返回结构：

```ts
type InspectAgentNotesInput = {
  workspaceRoot: string;
  outputDirectory: string;
  sourcePaths: string[];
};

type InspectAgentNotesResult = {
  files: Array<{
    sourcePath: string;
    sourceText: string;
    sourceHash: string;
    storedSourceHash: string;
    notes: {
      file?: StoredFileNote;
      sections: StoredSectionNote[];
      lines: StoredLineNote[];
    };
  }>;
  skipped: Array<{
    sourcePath: string;
    reason: "outsideWorkspace" | "sourceMissing" | "notTracked" | "noteStoreInvalid";
  }>;
};
```

调用者必须传入明确的 `NoteStoreLocation`。函数读取指定的 Team 或 Personal Notes，并返回经过身份索引验证的可读所属人；不存在、未被 Note Store 跟踪或存储无效的文件进入 `skipped`，不让整个批次失败。

### `applyAgentNoteUpdates`

接收结构化的笔记变更列表，并负责：

- 确认源文件仍然是 Agent 检查过的版本；
- 确认目标 Note ID 存在，或者新增笔记的数据有效；
- 只允许更新或新增 AI 笔记；
- 拒绝修改用户笔记；
- 保留已有笔记的 `createdAt` 并更新 `updatedAt`；
- 通过现有 `WorkspaceNoteStore` 保存；
- 正确维护 Note Store 的索引和缓存；
- 返回每项变更的成功、跳过或失败结果。

Agent 不直接修改 Note Store JSON。

第 1 步确定的输入结构：

```ts
type ApplyAgentNoteUpdatesInput = {
  workspaceRoot: string;
  outputDirectory: string;
  files: Array<{
    sourcePath: string;
    expectedSourceHash: string;
    changes: AgentNoteChange[];
  }>;
};

type AgentNoteChange =
  | {
      action: "update";
      level: "file" | "section" | "line";
      noteId: string;
      aiExplanation: AIExplanation;
      reason: string;
    }
  | {
      action: "create";
      level: "file";
      aiExplanation: AIExplanation;
      reason: string;
    }
  | {
      action: "create";
      level: "section";
      title: string;
      kind?: string;
      range: LineRange;
      aiExplanation: AIExplanation;
      reason: string;
    }
  | {
      action: "create";
      level: "line";
      line: number;
      aiExplanation: AIExplanation;
      reason: string;
    };
```

调用者不提供 `createdAt`、`updatedAt`、`createdBy`、Section `anchorHash`、Line `anchorText` 或新增 Note ID。这些字段由函数根据当前代码和现有 Note Store 生成，避免 Agent 构造错误的持久化数据。

## MVP 边界

- 只检查本次实际修改的代码文件。
- 支持更新已有 AI File、Section 和 Line Notes。
- 支持为已有 Note Store 记录的文件新增 AI Notes。
- 更新操作只修改 `aiExplanation`，保留任何现有 `userNote` 和 `createdBy`。这也允许安全更新“用户创建、后来附有 AI explanation”的笔记。
- 新增笔记固定使用 `createdBy: "ai"`，且不接受 `userNote` 输入。
- 不自动删除任何笔记。
- 写入前必须校验 `sourceHash`。
- 每次修改前必须显示当前 Notes 的所属人并获得用户确认；Team 显示为 `Team Notes`，Personal 显示为 `Personal Notes — <displayName>`。
- 检查、确认和写入必须使用同一个明确的 `NoteStoreLocation`；无法确认所属人时停止，不能默认使用 Team Notes。
- 确认仅适用于当次具体修改计划；确认后 Notes 位置或修改内容发生变化时，确认凭据失效并拒绝写入。
- 暂不处理没有 Note Store 记录的全新源文件。
- 暂不开发 MCP、VS Code UI、自动影响分析或独立 Proof 文件。
- Runtime State 继续处理位置、过期、缺失和重新定位；本流程只维护笔记内容。

## 与现有 AI 生成流程的复用边界

Agent 接口是现有笔记管线的另一个输入端，而不是另一套笔记系统：

- 复用现有 `AIExplanation` 作为 Agent 提交的内容格式；
- 复用 File、Section、Line 和 Stored Note 类型；
- 复用 AI-to-domain 转换函数生成新增笔记的状态、锚点和基础 ID；
- 复用 Note 内容更新的纯逻辑，确保只替换 `aiExplanation`；
- 复用 `WorkspaceNoteStore` 完成缓存、索引和 JSON 持久化。

不复用整文件 Prompt、DeepSeek 请求以及整文件重新生成和合并逻辑。外部 Agent 已掌握代码 diff，MVP 不应重复调用模型，也不应隐式重建或删除无关笔记。

## Note Writing Format

These rules apply to notes generated through CZaza prompts and to note content submitted by an external AI Agent. Both paths use the existing `AIExplanation` structure.

### General Rules

- Start every File, Section, and Line Note with a one-line summary that plainly says what the target does.
- Use simple everyday language whenever it can explain the behavior accurately.
- When a technical term is necessary, briefly explain what it means or why it matters the first time it appears.
- Keep real file names, class names, function names, method names, field names, and project concepts unchanged so the reader can find them in the code.
- Do not repeat source code, translate code line by line, or add detail that does not help the reader understand the target.
- Use `aiNotes` only for important risks, limits, assumptions, edge cases, or easily misunderstood behavior; omit it when there is nothing useful to add.

### File Notes

- Use `summary` for one plain-language sentence describing the file's overall responsibility.
- Use `detail` to list the file's important classes, functions, and methods in source order.
- Give each listed class, function, or method exactly one list item and one concise sentence explaining what it does.
- Include only items that materially help the reader understand the file; omit trivial callbacks, simple forwarding wrappers, and implementation details without lasting explanatory value.
- A class may be used as a short grouping label when its methods need to be listed.

Example:

```text
This file safely checks and applies note changes submitted by an AI Agent.

- applyAgentNoteUpdates: Checks requested changes and saves the valid note updates.
- validateSourceHash: Confirms the source file has not changed since the Agent inspected it.
- createSectionNote: Creates a Section Note for a validated range of source code.
```

### Section Notes

- Use `summary` for one plain-language sentence describing what the section does as a whole.
- Use `detail` only for important steps, reasons, constraints, or behavior not already clear from the summary.
- Do not repeat the complete File Note function list inside a Section Note.

Example:

```text
This function checks that a requested path stays inside the project.

It converts the path to a project-relative form and rejects paths that point outside the project or into the CZaza Note Store.
```

### Line Notes

- Use `summary` for one plain-language sentence describing what the line does in its local context.
- Keep `detail` to one short supporting sentence when the reason or consequence is important; otherwise keep it minimal.
- Do not use a Line Note for broader behavior that belongs in a Section or File Note.

Example:

```text
This line recalculates the source hash to check whether the code changed again.

The check prevents an Agent from saving notes based on an older version of the file.
```

### `AIExplanation` Mapping

- `summary`: The required one-line plain-language overview.
- `detail`: The File Note item list or the necessary supporting explanation for a Section or Line Note.
- `aiNotes`: Optional important caveats that do not belong in the normal explanation.

The MVP keeps the existing `AIExplanation` data structure; these are content rules rather than a Note Store schema change.

## 修改结果列表

`applyAgentNoteUpdates` 返回按源文件分组的结果。默认只展示真正发生笔记变化的文件；存在跳过或失败时也应显示原因。

示例：

```text
笔记修改结果

src/services/orderService.ts
- 更新 Section Note：createOrder
  - 原因：新增库存检查和失败处理
- 新增 Section Note：reserveInventory
  - 原因：新增独立的库存预留流程

src/models/order.ts
- 更新 File Note
  - 原因：增加 cancelled 状态

汇总：
- 涉及源文件：2
- 更新笔记：2
- 新增笔记：1
- 跳过：0
- 失败：0
```

报告只说明哪些笔记发生了什么变化及其原因，不重复输出完整笔记内容或代码 diff。

建议的返回结构：

```ts
type AgentNoteUpdateReport = {
  files: Array<{
    sourcePath: string;
    changes: Array<{
      action: "updated" | "created" | "skipped" | "failed";
      noteLevel: "file" | "section" | "line";
      noteId?: string;
      title?: string;
      reason: string;
    }>;
  }>;
  summary: {
    filesChanged: number;
    updated: number;
    created: number;
    skipped: number;
    failed: number;
  };
};
```

`filesChanged` 只统计至少有一项 `updated` 或 `created` 的源文件。所有结果按输入文件顺序返回；同一文件内按请求顺序返回，便于 Agent 将请求与结果对应。

## 第 1 步校验规则

每个源文件和每项变更独立返回结果，单项失败不回滚其他文件的成功变更。MVP 暂不提供跨文件事务。

写入前必须依次检查：

1. `sourcePath` 是工作区内的规范化相对路径，而且不能指向 CZaza Note Store。
2. 源文件存在、是可读取文本，并且已有 Note Store 记录。
3. 当前代码计算出的哈希等于 `expectedSourceHash`；不一致时跳过该文件的全部变更。
4. `update` 的 Note ID 和层级匹配已有笔记。
5. 更新仅替换 `aiExplanation`，保留位置、状态、用户内容、创建者和创建时间。
6. 新增 File Note 时不得已经存在 File Note。
7. 新增 Section Note 时，范围必须是有效的一基闭区间；函数从该范围的当前代码计算 `anchorHash` 和唯一 ID。
8. 新增 Line Note 时，行号必须有效；函数从当前代码取得 `anchorText` 并生成唯一 ID。
9. `aiExplanation.summary`、`aiExplanation.detail` 和 `reason` 去除首尾空白后必须非空；`aiNotes` 中的空项被拒绝。
10. 一项变更实际没有改变 AI 内容时，返回 `skipped`，不写入文件。

同一源文件的有效变更应先在内存中依次应用，最后通过现有 Note Store 保存一次，减少部分写入和重复索引刷新。保存完成后，该 Note Store 记录的 `sourceHash` 同步为本次已经校验的当前代码哈希，相关新增或更新笔记标记为 `current/confirmed`。

## 实施 Plan

执行过程中，每完成一步就在本节更新状态和实际结果。未获得代码修改批准前，不开始实施。

1. **已完成——确定函数输入、输出和校验规则**
   - 定义 `inspectAgentNotes` 的返回数据。
   - 定义 `applyAgentNoteUpdates` 的变更请求和报告结构。
   - 明确 AI 笔记、用户笔记和新增笔记的判断规则。
   - 结果：更新只替换 `aiExplanation`；锚点、ID 和持久化字段由函数生成；按文件返回独立结果；后续安全修正增加了明确的 Team/Personal Notes 位置和逐次确认凭据。

2. **已完成——实现只读检查函数**
   - 复用现有 Note Store 读取能力。
   - 读取源代码并计算当前 `sourceHash`。
   - 返回已有笔记和状态，不执行写入。
   - 结果：新增独立类型契约和 `inspectAgentNotes`；MVP 读取明确指定的 Team 或 Personal Notes，按请求顺序返回成功项和稳定跳过原因；针对性测试、构建和 lint 已通过。

3. **已完成——实现安全更新函数**
   - 校验路径、`sourceHash`、Note ID、笔记归属和新增数据。
   - 复用 `WorkspaceNoteStore` 的 CRUD 和更新能力保存结果。
   - 禁止用户笔记修改和所有删除操作。
   - 结果：新增 `applyAgentNoteUpdates`；同一源文件的有效请求先在内存中应用并只保存一次；更新仅替换 AI 内容并保留用户内容；新增笔记的 ID、锚点、状态和时间戳由现有转换逻辑生成。

4. **已完成——生成按文件分组的修改列表**
   - 记录更新、新增、跳过和失败项目。
   - 输出按源文件分组的列表及总计。
   - 结果：新增纯格式化函数；每个源文件单独分组，每项变化固定为一行，并在结尾显示修改文件数以及更新、新增、跳过和失败总计。

5. **已完成——提供 Agent 可调用 CLI**
   - MVP 倾向使用薄 CLI，具体命令格式在实施前确认。
   - CLI 只调用上述函数，不包含独立的 Note Store 写入逻辑。
   - 结果：新增 stdin JSON 驱动的 `inspect`、`confirm` 和 `apply` 命令；`inspect` 与 `confirm` 输出结构化 JSON，`apply` 输出按文件分组的可读报告；Personal Notes 名称从 identity index 验证。
   - 定位：CLI 是 MVP 主路径；下一阶段需要将它构建为独立 JavaScript 并随 VSIX 分发，使 Skill 可以稳定查找和调用。

6. **已完成——评估并暂不采用 MCP**
   - 已验证在现有核心函数外包装 stdio MCP Server 在技术上可行。
   - MCP 方案要求额外 SDK、schema、Server 启动、Host 配置和安装发现，但当前 MVP 最终仍调用同一组本地函数。
   - 结果：删除 MCP Server、MCP tests、`notes:mcp`、MCP SDK 和 Zod；保留核心函数、确认机制、报告和 CLI。
   - 决定：MVP 由 `$czaza` Skill 指导 Agent 直接调用 CLI；未来只有在多个 Agent Host 需要统一协议时再重新评估 MCP。

7. **已完成——创建配套 Skill**
   - 规定何时执行 `inspect → confirm → apply`。
   - 规定 Note Writing Format、禁止直接编辑 Note Store、逐次显示所属人并等待用户确认。
   - 规定最终输出按源文件列出实际修改结果。
   - 结果：在相邻 `ai-agent-skills/czaza/` 创建并验证 `$czaza` Skill，链接到 `~/.codex/skills/czaza`；Skill 当前优先使用未来的已打包 CLI，开发期间使用 CZaza 仓库中的 `notes:agent`。

8. **已完成——构建并随 VSIX 分发独立 CLI**
   - 将 Agent Notes CLI 构建为无需 `tsx` 和项目依赖的 JavaScript 文件。
   - 将 CLI 放入 VSIX，并确定 Skill 查找已安装 CZaza 扩展路径的规则。
   - 结果：新增单文件 ESM 构建到 `dist/agent-notes/cli.js`，`package:vscode` 自动构建该文件，真实 Node 子进程测试通过，VSIX 清单确认包含 `extension/dist/agent-notes/cli.js`。
   - Skill 已支持开发仓库 CLI；已安装扩展目录的自动发现仍作为独立的后续体验改进，不影响当前 MVP 验证结果。

9. **已完成——自动识别当前显示的 Notes 空间**
   - VS Code 在实际显示 Notes 时，将当前 Team 或 Personal Notes 选择写入项目外的本地运行状态。
   - CLI 新增 `current` 命令，Agent 先读取当前 Notes 及已验证所属人，不再让用户选择 Team 或 Personal。
   - `apply` 写入前重新检查当前 Notes；确认后若用户切换了 Notes，则拒绝旧计划。
   - Skill 流程更新为 `current → inspect → confirm → 用户确认 → apply`，用户只确认是否修改当前显示的 Notes。

10. **已完成——过滤不应检查的候选文件**
   - Agent 收集变更文件后，先排除 Git ignore 规则命中的文件、`.git`、目录、缺失路径和非普通文件。
   - 当前 Notes `outputDirectory` 整棵目录始终强制排除，即使它被 Git 跟踪，避免笔记更新反过来触发新的笔记维护。
   - 用户明确指定或与结果有关的跳过文件必须附带一行原因，不能静默处理或绕过排除。
   - MVP 不增加扩展名白名单、固定生成文件黑名单或新的配置格式；额外排除项由用户在当前任务中指定。

11. **已完成——支持尚未建立 Notes 记录的新源文件**
   - Git untracked 但未被 ignore 的普通文件必须作为候选源文件，不能因为尚未 `git add` 而跳过。
   - `inspect` 对 Notes Store 中尚无记录的新文件返回当前源码、哈希、空 Notes 和 `registeredInNotes: false`，不执行写入。
   - 用户确认创建计划后，`apply` 复用 `WorkspaceNoteStore.saveSourceFile` 建立基础记录并保存第一批 File、Section 或 Line Notes。
   - “Git 未跟踪”和“CZaza 尚无 Notes 记录”不再共用 `notTracked` 描述；新文件只有在缺失、被 ignore 或位于排除目录时才跳过。

12. **已完成——区分 CLI 路径与目标项目参数**
   - `cliPath` 只表示 CZaza CLI 在哪里；`workspaceRoot` 必须是用户正在维护源码和 Notes 的目标项目根目录，不能使用 CLI 所在目录或 CLI 进程的默认工作目录。
   - `outputDirectory` 必须从目标项目的 CZaza 配置或扩展使用的同一项目设置中取得；只有确认该项目使用默认值时才采用 `.czaza`。
   - `current` 失败时，Agent 先报告并核对实际 `cliPath`、`workspaceRoot` 和 `outputDirectory`，修正参数并重试一次；参数确认无误后仍失败，才请用户打开 Notes。
   - 本次 DocuMind 问题的 CLI 和当前 Notes 状态均正常，缺口是旧 Skill 没有明确区分 CLI 位置与被维护项目位置。

13. **已完成——显示关键参数错误和写入前摘要**
   - `current` 明确拒绝把 `.czaza/notes` 等 Notes 子目录当作 `outputDirectory`，并显示请求值、建议值、错误原因和未发生任何读写的说明。
   - 当前项目已有选择但请求的 `outputDirectory` 不一致时，CLI 同时显示目标项目、请求值和当前值，不再统一伪装成“未打开 Notes”。
   - Agent 不得静默修正 `workspaceRoot` 或 `outputDirectory`；必须展示完整错误并获得用户对建议值的确认后才能重试。
   - 写入确认信息新增按源文件的一行计划摘要；最多显示 5 个文件，更多文件显示剩余数量，避免确认内容过长。

14. **已完成——优先提供确认与取消选项**
   - Agent Host 支持原生选项时，写入确认优先显示可点击的 `Confirm changes` 和 `Cancel`。
   - Host 不支持按钮时，使用 `confirmed` 或 `cancel` 文字回复作为兼容方案；普通 Markdown 链接不能代表批准。
   - 确认只绑定当前计划，旧按钮、旧回复或仅显示选项都不能触发 `apply`。

15. **已完成——修复 Personal Notes 外部刷新和遗漏 location 的旧路径**
   - Agent 在独立进程写入 Notes 后，扩展文件监听现在清除同一项目下 Team 与全部 Personal Notes 缓存，再刷新当前界面，避免磁盘已更新但仍显示旧内容。
   - Navigator 查看存档或 orphaned 文件时传递当前 `NoteStoreLocation`，不再默认读取 Team Notes。
   - VS Code 重命名和删除资源时先解析当前 Notes location，并将变更应用到当前 Team 或 Personal Store。
   - Explorer 打开或预览文件时继续通过活动编辑器/标签页事件跟随；VS Code 没有提供内置 Explorer 单纯选中但不打开的通用文件选择事件。

16. **已完成——处理 Agent 原子替换 Notes 文件的刷新事件**
   - Notes Store 文件的 create、change 和 delete 事件现在统一触发缓存失效；这覆盖 CLI 通过临时文件 rename 原子替换 JSON 的行为。
   - 三类事件都先检查扩展内部写入抑制，避免扩展自己的持久化触发重复外部刷新。
   - 同一次 delete/create 组合共享项目级 debounce key，只读刷新 Webview 一次；刷新链路不调用任何 Note Store 保存函数，因此不会形成写入循环。

17. **已完成——稳定 Explorer Preview Tab 的 Notes 跟随**
   - 普通文本文件只由 `activeTextEditor` 负责切换，Tab 事件不能覆盖当前文本编辑器。
   - 光标事件只更新当前文件的 Line/Section Notes，不能切换文件或取消正在加载的新文件。
   - Custom Editor、Notebook 和 Notebook Diff 仅在没有活动文本编辑器时作为非文本资源 fallback。
   - 每次活动源码文件变化都会重新解析当前 Team 或 Personal Store；缓存键继续按 Notes location 隔离。
   - `NotesViewProvider.requestVersion` 继续阻止较慢的旧读取覆盖较新的界面，不再额外使用跨事件 URI 去重。

### Notes 切换问题的诊断结论

- **复现方式**：DocuMind 中快速切换 `.prettierrc → delete.ts → hi2.ts → delete.ts`，以及 `package.json ↔ README.md`。
- **根因**：文件切换和 Selection 事件都调用完整文件加载；新文件开始读取后，迟到的旧 Selection 会增加 `requestVersion`，使正确的新文件请求过期。
- **修复**：新增 `showActiveDocumentLineNotes`；它只在 URI 同时匹配最新活动文件和已显示文件时更新行号，不能改变活动资源。
- **最终边界**：活动编辑器负责文本文件切换，Selection 负责当前 Line/Section，非文本 Tab 只负责没有 TextEditor 的资源。
- **验证结果**：文本文件、Git-untracked 文件、PNG、光标移动以及 Team/Personal Notes 切换均由用户验证正常。

18. **已完成——增加剩余测试并验证完整交付流程**
   - 完整 Vitest 已通过：114 个测试文件通过、9 个跳过，653 项测试通过、11 项跳过。
   - lint 已通过并保留 22 个现有 warning；`git diff --check`、TypeScript/Vite、VS Code bundle、Agent Notes CLI bundle 和 VSIX 打包均通过。
   - 已生成 `dist/czaza-0.14.6.vsix`，文本文件、光标 Line/Section Notes 和非文本 Tab 的职责边界已有自动测试覆盖。
   - 实际 `current → inspect → confirm → apply` 已由用户完成验证，当前 Notes 所属人确认、检查、写入确认和应用流程均正常。
   - Plan 第 18 步没有剩余验证项；后续改进不属于当前 MVP。

## 实际实现范围

MVP 最终实现包含：

- 新增 `vscode/agentNotes/inspectAgentNotes.ts`；
- 新增 `vscode/agentNotes/applyAgentNoteUpdates.ts`；
- 新增 Agent 调用入口；
- 新增 `tests/agentNotes/` 下的相关测试；
- 修改 `package.json` 增加调用命令；
- 更新本讨论稿中的 Plan 和验证状态。

不增加运行时依赖，不改变现有 Note Store 数据格式。

## Future Improvements

- Skill 如何稳定找到已安装 VSIX 中的独立 Agent Notes CLI。
- 在实现 Agent 更新入口后，如何让现有 CZaza prompts enforce the same Note Writing Format without duplicating prompt text.

## Agent、Skill 与 JSON 的职责

- Agent 从代码 diff、commit 或用户指定路径收集候选文件，先排除 Git ignore、`.git` 和当前 Notes 输出目录，再读取 `inspect` 结果并生成修改计划 JSON。
- Agent 在所有 CLI 阶段复用目标项目的同一组 `workspaceRoot` 和 `outputDirectory`；CLI 的安装位置不参与目标项目解析。
- Skill 告诉 Agent 如何生成该 JSON、何时调用各阶段、怎样向用户显示当前 Notes 所属人，以及未确认时禁止执行修改。
- 用户只查看修改计划并确认，不需要编写或传递 JSON。
- 用户在写入前看到当前 Notes 所属人、按文件归纳的修改摘要和总数；关键路径错误则看到实际值、建议值和未写入说明。
- CZaza Agent 接口接收 Agent 传来的 JSON，验证 Notes 位置、身份、计划指纹和 `sourceHash`，然后通过 `WorkspaceNoteStore` 保存。
- 当前 CLI 使用 stdin 传递 JSON：Agent 启动命令并把 JSON 写入标准输入；该机制保留为开发入口和未来工具协议的原型。
- Skill 不能替代安全写入接口，也不能直接编辑 `.czaza/notes/` JSON。

## 安装后的目标体验

```text
用户安装 CZaza 和配套 Skill
  ↓
Agent 通过 Skill 找到 CZaza Agent Notes CLI
  ↓
Agent 调用 `current` 自动取得当前显示的 Notes 和所属人
  ↓
Agent 生成修改计划 JSON
  ↓
接口生成带所属人的确认信息
  ↓
Agent 展示确认信息并等待用户确认
  ↓
Agent 传回同一计划 JSON 和 confirmationToken
  ↓
接口安全写入并返回按文件分组的报告
```

用户不需要安装项目依赖、配置 npm script、寻找 VSIX 安装路径或手写 JSON。

## Notes 所属人确认

- `inspectAgentNotes` 必须接收明确的 Team 或 Personal `NoteStoreLocation`，并返回经过验证的 Notes 所属人。
- `createAgentNoteUpdateConfirmation` 在修改前显示当前 Notes 所属人、涉及文件数、计划更新数和计划新增数。
- 用户确认后，调用者将针对该具体计划生成的 `confirmationToken` 交给 `applyAgentNoteUpdates`。
- `applyAgentNoteUpdates` 重新验证 Personal identity，并确认 token 与完整计划一致；Notes 位置或计划被替换时拒绝写入。
- 确认不能跨修改复用；每次新的修改计划都必须重新显示所属人并请求确认。
- 用户是否确实点击或回复确认由 Agent 交互层负责；token 只保证执行的内容与刚才展示的计划完全相同。
- Agent 不询问用户选择 Team 或 Personal；它读取当前显示的 Notes，用户只确认是否修改这个当前空间。
- `applyAgentNoteUpdates` 再次读取本地运行状态；若 Notes 已切换，则拒绝写入并要求重新检查和确认。

## 完成状态

Plan 第 1 至 18 步已完成。文本文件切换、光标更新、非文本 Tab，以及真实 `current → inspect → confirm → apply` 流程均已验证正常；当前 AI Agent Notes MVP 没有剩余实施或验证步骤。
