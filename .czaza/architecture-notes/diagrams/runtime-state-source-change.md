---
type: architecture-diagram
documentVersion: 2.0.0
status: proposed
createdAt: 2026-07-29
updatedAt: 2026-07-30
author: Codex
---

# Runtime State 源文件变更检测

本方案使用一条核心规则：能准确计算的位置变化立即更新 Notes，其他变化只在内存中提示用户。

## 核心流程

```mermaid
flowchart TD
    A[源文件变化] --> B{dirty 且能准确计算}
    B -->|是| C[立即更新 Notes]
    B -->|否| D[只读检测当前文件]
    C --> D
    D --> E{是否仍有问题}
    E -->|否| F[清除 Runtime State]
    E -->|是| G[UI 显示待处理状态]
    G -->|用户处理| H[更新对应 Notes]
    H --> D
```

## 名词解释

- **Dirty**：编辑器内容尚未保存到磁盘，例如手动输入或接受 Copilot 建议后，VS Code 通常会标记为 dirty。
- **确定性修改**：能够准确算出新位置的编辑，例如在 Line Note 前插入一行时，行号确定增加一。
- **Runtime State**：只保存在 Extension Host 内存中的待处理提醒，不直接修改 Note JSON。
- **建议位置**：检测器认为 Section 或 Line 可能移动到的位置，只供 Relocate 使用，确认前不覆盖正式位置。
- **Note Store**：`.czaza/notes` 中正式保存 File、Section 和 Line Notes 的数据。

## 三种变化来源

1. VS Code 文档事件：编辑器内输入、删除或 Copilot 插入。
2. 文件系统 Watcher：Git、外部工具或磁盘操作改变文件。
3. 被动检查：首次打开文件、切换编辑器或显式检查。

## 当前规则

- `isDirty=true` 且变化可以确定性计算时，立即更新 Section 范围、Line 行号及对应 Notes。
- 确定性整体移动只改变坐标，保留原有 `content` 和 `anchor` 状态。
- Line Note 行首 Enter 确定移动，行中 Enter 需要 Location Review，行尾 Enter 不改变该 Line Note。
- 其他变化只应重新检测，并把 `stale`、`location review`、`missing` 或 `possible rename` 放入 Runtime State。
- Clear Stale 只处理内容状态；Relocate 只处理位置状态；完成后重新检测整个文件。
- Runtime State 关闭 VS Code 后可以丢失，重新打开时由被动检查恢复。

## 当前风险

- 部分非确定性文档事件和 Watcher 路径仍调用旧服务修改 Note Store。
- `isDirty` 能覆盖常见编辑场景，但某些插件也可能制造 dirty 编辑。
- Rename 和 Delete 仍使用旧的 Git-aware 延迟后直接更新 Note Store。

## 下一步

先让非确定性 VS Code 文档事件只更新 Runtime State，同时保持确定性 dirty 编辑立即写入不变；随后再迁移 Watcher、Rename 和 Delete。

## Future Improvements

- 更可靠地区分用户编辑与其他扩展产生的 dirty 编辑。
- 多窗口同时编辑同一文件时增加文档版本校验。
- 如果未来确实需要保存前暂存确定性结果，再评估 [Relocation Candidate 生命周期](./relocation-candidate-lifecycle.md)；当前主线不采用。
