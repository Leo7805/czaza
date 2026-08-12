---
type: architecture-outline
documentVersion: 2.6.0
templateVersion: 1
createdAt: 2026-07-29
updatedAt: 2026-08-13
author: LJ Arch
contentLanguage: zh-CN
---

# 架构笔记

本目录整理跨文件架构图和项目级说明。

## 资源访问

1. [Czaza 资源访问 Gate](./diagrams/czaza-resource-access-gate.md)：说明 Notes 操作、变化检测和 Note Store 共用的工作区资源访问边界。

## 当前主架构

1. [Runtime State 总体架构](./diagrams/runtime-state-architecture.md)：统一说明变化分类、持久化边界、数据归属和 Runtime State 生命周期。

## 提议架构

1. [团队与个人笔记存储](./diagrams/team-and-personal-notes-storage.md)：定义由 Git 跟踪的单一团队 Store 和按成员划分的个人 Store。

## 细节架构

1. [Source Relocation](./diagrams/source-relocation.md)：说明确定性源码编辑、Section/Line 位置转换和 Undo/Redo 历史。
2. [Resource Change](./diagrams/resource-change-handling.md)：说明 VS Code 确定性资源操作与 Watcher 外部变化的不同处理。
3. [源码与资源变化任务协调](./diagrams/source-and-resource-task-coordination.md)：说明事件抑制、防抖、同资源队列和任务失效的不同职责。
4. [状态检测与 UI 状态更新](./diagrams/runtime-state-detection-and-ui-refresh.md)：区分状态检测、Registry 存储和各级 Notes UI 刷新的职责。

## 迁移记录

1. [Git 解耦迁移（已完成）](./diagrams/git-decoupling-migration.md)：记录 Git-aware 防护迁移到 Runtime State 和通用任务协调架构的最终结果。

## Future Improvements

1. [Relocation Candidate 生命周期](./diagrams/relocation-candidate-lifecycle.md)：可选的保存前内存暂存方案，当前主线不采用。
2. [Source Change Persistence Gate](./diagrams/source-change-persistence-gate.md)：与 Candidate Registry 配套的可选持久化方案，当前主线不采用。
