---
type: architecture-outline
documentVersion: 1.6.0
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

## 状态管理

1. [Runtime State 源文件变更检测](./diagrams/runtime-state-source-change.md)：说明三种检测来源、运行时状态管理及受控持久化边界。
2. [Runtime State 与 Note Store 持久化边界](./diagrams/runtime-state-persistence-boundary.md)：说明检测状态留在内存以及正式笔记写入磁盘的明确边界。
3. [Runtime State 生命周期](./diagrams/runtime-state-lifecycle.md)：说明检测状态从发现、等待、复核到解决或恢复检查的状态变化。
4. [资源变化统一处理](./diagrams/unified-resource-change-handling.md)：说明 reload、外部修改、rename 和 delete 如何归一化为内存待处理状态。
5. [Relocation Candidate 生命周期](./diagrams/relocation-candidate-lifecycle.md)：说明 Candidate 的创建、累积、保存验证、串行执行及失效路径。
6. [Source Change Persistence Gate](./diagrams/source-change-persistence-gate.md)：说明确定性 relocation candidate 获得持久化资格的条件与失效路径。

## 演进计划

1. [Git 解耦迁移顺序](./diagrams/git-decoupling-migration.md)：说明从 Git-aware 防护迁移到 Runtime State 架构并安全删除旧代码的阶段顺序。
