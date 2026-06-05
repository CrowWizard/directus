# Operations Log

## 2026-06-05

- 分析了 `purchase-flow-implementation.md`、采购流程 Hook、接单 Endpoint、集合初始化脚本、关系脚本和权限脚本。
- 确认当前后端主要复用 Directus `/items/*` 接口，缺少 Project 聚合接口、沟通并切换状态的原子接口、结构化最新步骤字段和收窄权限。
- 创建计划目录 `docs/plans/`。
- 新增前端业务页面实现计划：`docs/plans/2026-06-05-purchase-flow-frontend.md`。
- 根据用户澄清重写计划：Project 直接使用 `inquiry_items`，前端改为独立 `purchase-web` 应用，不做 Directus 内置 Module。
- 根据用户澄清移除计划中的 Project 业务概念，统一改为“询价项 / `inquiry_items`”。
- 根据用户要求把独立前端目录调整为 `business-apps/purchase-flow/web`，并在计划中约定后续业务项目统一放入 `business-apps/<business-name>/`。
