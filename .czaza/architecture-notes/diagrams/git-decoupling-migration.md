---
type: architecture-diagram
documentVersion: 1.0.0
status: proposed
createdAt: 2026-07-29
updatedAt: 2026-07-29
author: Codex
---

# Git 解耦迁移顺序

本方案按可验证阶段将当前 Git-aware 变化防护替换为 Runtime State 架构，确保新路径稳定后再删除 HEAD、transition 和延迟确认代码。

## 迁移流程

```mermaid
flowchart LR
    A[建立当前行为测试基线] --> B[新增 Runtime State Registry]
    B --> C[接入统一检测与被动检查]
    C --> D[Notes UI 展示并处理 Runtime State]
    D --> E[接入 Candidate Persistence Gate]
    E --> F[切换内容和资源事件入口]
    F --> G[删除 Git-aware 防护]
    G --> H[完整回归与快速分支切换测试]
```

## 阶段说明

### 阶段一：建立测试基线

- 保留当前实现，补齐内容修改、外部替换、reload、rename、delete、快速分支切换和 VS Code 重启场景。
- 明确哪些测试验证正式 Note Store 不应改变，哪些测试验证 Runtime State 应出现。
- 此阶段不改变运行时行为。

### 阶段二：建立 Runtime State 基础

- 新增只存在于 Extension Host 内存中的 `Runtime State Registry`。
- 定义路径、当前 Hash、状态、原因和更新时间等最小数据模型。
- 先提供纯逻辑更新、查询、覆盖、清除和资源移动测试，不接管现有事件。

### 阶段三：接入检测和 UI

- 将 VS Code 文档事件、Watcher 和被动一致性检查归一化为统一变化意图。
- 先以不写 Note Store 的方式计算 Runtime State，并与当前检测结果对照。
- Notes UI 改为合并正式 Notes 与 Runtime State，用户确认操作通过独立服务完成。

### 阶段四：接入受控持久化

- 将确定性 relocation 结果保留为 Candidate，不在文本变化事件中立即写盘。
- Candidate 只有通过保存生命周期、版本和当前 Hash 验证后才能持久化。
- rename、delete 和模糊外部变化只更新 Runtime State，等待用户确认。

### 阶段五：切换事件入口

- `registerNotesContentEvents` 切换到 Runtime State 和 Candidate 路径。
- `registerNotesResourceEvents` 切换到统一资源变化路径。
- 加入启动、首次打开、Navigator 刷新或显式检查时的被动一致性检查。
- 每切换一个入口都先运行对应回归测试，不同时替换所有入口。

### 阶段六：删除 Git-aware 防护

- 从 `extension.ts` 删除 `GitWorkspaceTransitionGuard` 的创建和 Git 监听注册。
- 删除 `workspaceTransition` 目录中的 Git HEAD 监听、transition timer 和 revision token 实现。
- 删除事件注册函数中的 `workspaceTransitionGuard` 参数和分支。
- 删除只验证旧 Git-aware 行为的测试，并用 Runtime State 行为测试替代。
- 删除专门用于“等待 Git HEAD 稳定”的 800ms 延迟确认。

## Debounce 保留边界

- 删除的是依赖时间猜测 Git checkout 是否完成的延迟确认。
- Watcher 重复通知合并、UI refresh 合并和同资源任务串行化仍然有独立价值，可以保留。
- 保留的 debounce 只用于减少重复工作，不得决定是否具有 Note Store 写入权限。
- 任何持久化资格都必须来自资源 Gate、可信编辑生命周期和当前 Hash，而不是“等待足够久”。

## 每阶段完成条件

- 新增路径具有纯逻辑单元测试和对应事件集成测试。
- 自动检测不会修改 Note JSON 或 `index.json`，除非用户确认或 Candidate 通过 Persistence Gate。
- 快速来回切换分支、`git restore`、外部文件替换和普通手动编辑具有不同但确定的预期结果。
- 当前阶段验证通过前不删除上一阶段的安全保护。
- 最终代码不读取 Git extension API，不保存 HEAD revision，也不依赖 branch transition 状态。

## 当前代码删除范围

- `vscode/services/workspaceTransition/GitWorkspaceTransitionGuard.ts`
- `vscode/services/workspaceTransition/GitAwareSourceChangeGate.ts`
- `vscode/services/workspaceTransition/registerGitWorkspaceTransition.ts`
- `vscode/services/workspaceTransition/index.ts`
- `extension.ts` 中的 Git transition 创建、传递和注册逻辑
- `registerNotesContentEvents` 与 `registerNotesResourceEvents` 中的 Git-aware 参数和判断
- 对应的 Git transition 与 Git-aware Gate 测试

删除动作只能在 Runtime State、统一资源变化、Persistence Gate 和被动一致性检查全部接管后进行。

## 与当前实现的关系

当前代码仍在 `extension.ts` 创建共享的 `GitWorkspaceTransitionGuard`，并由内容事件、资源事件和内置 Git HEAD 监听共同使用。本图是尚未实施的迁移计划，因此状态为 `proposed`。
