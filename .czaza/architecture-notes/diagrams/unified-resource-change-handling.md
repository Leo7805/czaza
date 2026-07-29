---
type: architecture-diagram
documentVersion: 1.0.0
status: proposed
createdAt: 2026-07-29
updatedAt: 2026-07-29
author: Codex
---

# 资源变化统一处理

本方案将 reload、外部修改、rename 和 delete 归一化为统一的资源变化意图，只更新 Runtime State，避免文件系统事件直接改写正式 Notes。

## 概览图

概览图展示所有资源变化共享的入口、分类和用户确认边界。

```mermaid
flowchart LR
    A[资源变化事件] --> B[Czaza Resource Access Gate]
    B -->|允许| C[归一化并合并重复事件]
    C --> D[更新 Candidate 有效性]
    D --> E[Runtime State Registry]
    E --> F[Notes UI 等待处理]
    F -->|用户确认| G[复核后更新 Note Store]
```

## 完整流程图

完整流程图分别展示内容变化、rename 和 delete 的状态计算，以及确认后的持久化路径。

```mermaid
flowchart TD
    A[Watcher change 或 reload] --> D[Czaza Resource Access Gate]
    B[VS Code rename] --> D
    C[VS Code delete] --> D
    D -->|拒绝| E[忽略]
    D -->|允许| F[按资源路径归一化并合并重复事件]

    F --> G{资源变化类型}
    G -->|change 或 reload| H[要求关联 Candidate 重新验证]
    G -->|rename| I[使旧路径 Candidate 失效]
    G -->|delete| J[使原路径 Candidate 失效]

    H --> K[读取当前文件并比较 Note Store Hash]
    K -->|未影响 Notes| L[清除旧 Runtime State]
    K -->|可能影响 Notes| M[生成 stale 或 location review]

    I --> N[记录旧路径和新路径]
    N --> O[生成 possible rename]

    J --> P[确认原路径当前不存在]
    P --> Q[生成 missing]

    M --> R[Runtime State Registry]
    O --> R
    Q --> R
    R --> S[Notes UI 显示待处理状态]
    S -->|暂不处理| T[停止，仅保留内存状态]
    S -->|用户确认| U[重新读取并核对当前资源]

    U --> V{确认结果}
    V -->|内容更新| W[确认状态、锚点和当前 Hash]
    V -->|rename| X[移动 Source Entry]
    V -->|delete| Y[确认 missing 或删除 Notes]
    V -->|资源已再次变化| F

    W --> Z[写入 Note Store]
    X --> Z
    Y --> Z
    Z --> AA[清除对应 Runtime State]
```

## 统一事件模型

归一化后的资源变化意图至少包含：

- `kind`：`contentChanged`、`renamed` 或 `deleted`。
- `resource`：受影响资源的当前路径；rename 同时包含旧路径和新路径。
- `source`：`vscodeDocument`、`watcher`、`reload` 或 `passiveCheck`。
- `observedAt`：事件被接收的时间，仅用于合并同一批通知。
- `candidateAction`：`revalidate` 或 `invalidate`。

事件模型不携带 Git branch、HEAD 或 revision 信息。

## 处理规则

- 相同资源在短时间内收到 VS Code 和 Watcher 重复通知时，只执行一次最新状态检查。
- change 或 reload 不直接判定 Candidate 无效，而是要求它根据保存生命周期、版本和当前 Hash 重新验证。
- rename 和 delete 会直接使旧路径关联的 Candidate 失效。
- 自动事件只创建或更新 Runtime State，不移动、删除或改写 Note Store 条目。
- rename 只记录 `possible rename`，避免把 Git checkout、批量重构或临时移动误判为用户确认的永久移动。
- delete 只记录 `missing`；是否保留或删除原 Notes 由用户确认。
- 用户确认前必须再次读取当前资源，防止待处理期间文件再次变化。
- 用户忽略状态时流程停止，不启动定时循环，也不修改 Note Store。

## 与当前实现的关系

当前 `registerNotesResourceEvents` 会在 Git-aware 延迟确认后直接移动或标记 Note Store 条目，`registerNotesContentEvents` 也会把外部内容检测结果写入正式 Notes。本图描述目标架构：两个事件入口先归一化，再只更新 Runtime State，最终持久化由用户确认或有效 Persistence Gate 控制，因此状态为 `proposed`。
