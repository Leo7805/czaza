---
type: architecture-outline
documentVersion: 1.9.0
templateVersion: 1
createdAt: 2026-07-29
updatedAt: 2026-07-29
author: LJ Arch
contentLanguage: zh-CN
---

# 架构笔记

本目录整理跨文件架构图和项目级说明。

## 资源访问

1. [Czaza 资源访问 Gate](./diagrams/czaza-resource-access-gate.md)：说明 Notes 操作、变化检测和 Note Store 共用的工作区资源访问边界。

## 当前主架构

1. [Runtime State 源文件变更检测](./diagrams/runtime-state-source-change.md)：说明确定性编辑立即更新 Notes，其他变化只更新 Runtime State 的核心规则。
2. [Runtime State 与 Note Store 持久化边界](./diagrams/runtime-state-persistence-boundary.md)：说明哪些数据写入磁盘，哪些状态只保存在内存。
3. [Runtime State 生命周期](./diagrams/runtime-state-lifecycle.md)：说明待处理状态如何出现、等待、解决和重新检测。

## 补充架构

1. [资源变化统一处理](./diagrams/unified-resource-change-handling.md)：说明外部修改、reload、rename 和 delete 如何逐步迁移到 Runtime State。
2. [Source Relocation Undo/Redo 历史](./diagrams/source-relocation-undo-redo-history.md)：说明确定性源码编辑如何安全恢复 Notes 位置和状态。

## 演进计划

1. [Git 解耦迁移顺序](./diagrams/git-decoupling-migration.md)：说明从 Git-aware 防护迁移到 Runtime State 架构并安全删除旧代码的阶段顺序。

## Future Improvements

1. [Relocation Candidate 生命周期](./diagrams/relocation-candidate-lifecycle.md)：可选的保存前内存暂存方案，当前主线不采用。
2. [Source Change Persistence Gate](./diagrams/source-change-persistence-gate.md)：与 Candidate Registry 配套的可选持久化方案，当前主线不采用。
