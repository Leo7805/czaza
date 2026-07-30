---
type: architecture-diagram
documentVersion: 1.0.0
status: proposed
createdAt: 2026-07-30
updatedAt: 2026-07-30
author: Codex
---

# Resource Change

本方案区分 VS Code 明确资源操作和外部磁盘变化，说明 Rename、Move、Delete、Remove、Create 与 possible rename 的边界。

## 事件来源

```mermaid
flowchart TD
    A[资源变化] --> B{事件来源}
    B -->|Explorer 或 workspace.applyEdit| C[VS Code 资源事件]
    C --> D[明确 Rename Move Delete Remove]
    D --> E[确定性资源变化]
    B -->|Git 外部工具或 workspace.fs| F[FileSystemWatcher]
    F --> G[Create Change Delete]
    G --> H[无法直接证明用户意图]
    H --> I[Runtime State]
```

## VS Code 确定性资源事件

- `onDidRenameFiles` 明确提供 `oldUri` 和 `newUri`，同时覆盖 Rename 和 Move。
- `onDidDeleteFiles` 明确提供删除路径，同时覆盖 Delete 和 Remove。
- 文件夹操作只产生一个目录事件，Notes 需要按目录范围批量移动或标记。
- 通过 Resource Access Gate 后可以立即更新 Note Store。
- Rename/Move 更新相对路径；Delete/Remove 更新 deleted 状态；成功后重新计算 Runtime State。

Create 没有旧 Notes 需要迁移；Copy 是否复制 Notes 属于独立产品功能。

## Watcher 非确定性资源事件

- Change 只读检测文本内容或二进制 metadata hash。
- Delete 只说明旧路径消失，应记录 `missing`。
- Create 只说明新路径出现，不能单独证明它来自 Rename。
- 根据相近 Delete 和 Create 推测 Rename 时，只记录 `possible rename`。
- 用户确认前必须重新读取当前资源；忽略状态时不修改 Note Store。

## 当前实现边界

- 文本和二进制 Watcher Change 已经只更新 Runtime State。
- `registerNotesResourceEvents` 已接收准确的 VS Code Rename/Delete 信息，但仍带有旧 Git-aware 延迟。
- 当前 Watcher 尚未监听 Create/Delete。
- 下一步先清理确定性资源事件，再实现 `missing` 和 `possible rename`。

总体持久化权限和 Runtime 生命周期见 [Runtime State 总体架构](./runtime-state-architecture.md)。
