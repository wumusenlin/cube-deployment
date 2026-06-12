# 实施规划

## 目标架构

```text
Browser
  -> Next.js UI
  -> Next.js Route Handlers
       -> LLM OpenAI-compatible API
       -> Query whitelist validation
       -> Tenant/role policy injection
       -> Cube REST API
            -> YAML semantic model
            -> PostgreSQL
```

Cube Core、数据库和模型服务均不直接暴露给浏览器。

## 当前 MVP

- Docker Compose 启动 PostgreSQL、Cube Store、Cube Core、Next.js。
- Cube YAML 定义订单指标和维度。
- Next.js 封装 `/meta`、`/load` 和 Cube JWT。
- LLM 只生成受限 JSON，不生成 SQL。
- 查询成员按 Cube `/meta` 白名单校验。
- 限制 measures、dimensions、filters、limit 和操作符。
- `Orders.tenantId` 不进入 LLM 可用 schema。
- Next.js 和 Cube `queryRewrite` 双重追加租户过滤。
- 前端按统一图表协议渲染 bar、line、area、pie、kpi、table。
- 未配置 LLM 时提供本地规则 fallback，保证部署闭环可验证。

## 生产化阶段

### P1 身份与权限

- 接入企业 SSO/OIDC，删除 `DEMO_TENANT_ID`。
- 从服务端会话提取 `userId`、`tenantId`、`role`。
- 按角色增加指标级、维度级和行级策略。
- 增加审计日志，记录原始问题、最终 Query、用户和耗时。

### P2 模型治理

- 语义模型进入独立 Git 审核流程。
- 添加 Cube model compile 和查询回归测试。
- 给指标补充业务口径、同义词、禁用组合和示例问题。
- 大表按真实查询模式设计 pre-aggregation。

### P3 LLM 稳定性

- 使用结构化输出能力稳定的模型。
- 给模型输入精简后的业务 schema，不直接输入完整 `/meta`。
- 增加 prompt injection 检测、请求频控、超时和预算限制。
- 建立自然语言问题到期望 Cube Query 的评测集。

### P4 可观测与扩展

- 接入 OpenTelemetry、日志平台和错误告警。
- Cube API 与 refresh worker 分离。
- 按负载增加 Cube Store router/worker。
- 对常用查询结果增加用户和权限维度相关的缓存。

## 验收标准

1. 浏览器网络请求中不存在 Cube 密钥和 LLM 密钥。
2. 用户 Query 无法指定 `Orders.tenantId`。
3. 即使绕过 Next.js，Cube `queryRewrite` 仍强制租户过滤。
4. 非 `/meta` 白名单成员全部被拒绝。
5. 查询行数、过滤数和成员数受上限控制。
6. LLM 不可用时，系统能明确报错或使用可识别的 fallback。
