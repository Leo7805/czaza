---
type: architecture-diagram
documentVersion: 1.3.0
status: proposed
createdAt: 2026-08-13
updatedAt: 2026-08-13
author: Codex
---

# 团队与个人笔记存储

本提议只定义笔记的最上层存储划分。团队和个人笔记都保存在项目中并由 Git 跟踪。

```text
.czaza/
├── notes/                    # 单一团队笔记库
│   ├── index.json
│   └── files/
└── personal-notes/           # 个人笔记库
    ├── index.json           # 成员身份索引
    ├── leo-8f72c1a4/
    │   ├── index.json
    │   └── files/
    └── alice-91bd40e2/
        ├── index.json
        └── files/
```

```mermaid
flowchart TD
    A[.czaza] --> B[notes<br/>单一团队笔记库]
    A --> C[personal-notes<br/>个人笔记库]
    C --> D[index.json<br/>成员身份索引]
    C --> E[member-id<br/>与 Team 结构一致的独立 Store]
```

## 边界

- Team 保持单一 Store：`.czaza/notes/`。
- Personal 按成员分 Store：`.czaza/personal-notes/<member-id>/`。
- `.czaza/personal-notes/index.json` 保存 `member-id`、展示名称和 email hash；各成员 Store 的内部结构与 Team Store 一致。
- `member-id` 使用“标准化用户名 + 标准化 email 的 SHA-256 前 8 位”，例如 `leo-8f72c1a4`。
- Email 明文不写入仓库；email hash 用于跨设备匹配已有身份和减少重名冲突。
- Email hash 不是认证凭据，也不提供隐私保护；身份隔离只用于界面提示和防止误操作。
- “个人”表示个人维护，不表示内容私密；提交到 Git 后团队成员可以读取。
- 身份索引、Git 身份匹配、首次确认命令和本机工作区绑定已实现。
- Personal Notes CRUD、范围切换、迁移和 Runtime State 接入尚未实现。
