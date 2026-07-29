---
type: architecture-outline
documentVersion: 1.2.0
templateVersion: 1
createdAt: 2026-07-29
updatedAt: 2026-07-29
author: LJ Arch
contentLanguage: zh-CN
---

# 架构笔记

本目录整理跨文件架构图和项目级说明。

## 资源访问

1. [Czaza 资源访问 Gate](./diagrams/czaza-resource-access-gate.md)：说明 Notes 操作、变化检测和管理文件共用的工作区资源访问边界。

## 状态管理

1. [Runtime State 源文件变更检测](./diagrams/runtime-state-source-change.md)：说明三种检测来源、运行时状态管理及受控持久化边界。
2. [Relocation Candidate 生命周期](./diagrams/relocation-candidate-lifecycle.md)：说明 Candidate 的创建、累积、保存验证、串行执行及失效路径。
3. [Source Change Persistence Gate](./diagrams/source-change-persistence-gate.md)：说明确定性 relocation candidate 获得持久化资格的条件与失效路径。
