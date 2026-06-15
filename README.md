# Cube Core 自部署语义分析

使用 Next.js 实现完整应用层，Cube Core 独立部署。

## 组件

- `cube/`：Cube Core YAML 语义模型和二次权限校验。
- `src/app/api/`：Next.js BFF、LLM 代理、Cube API 封装。
- `src/lib/cube/`：查询契约、白名单校验、图表协议。
- `src/components/`：自然语言工作台和图表渲染。
- `.env.mysql`：线上 MySQL 连接配置，仅保存在本地。
- `docs/IMPLEMENTATION_PLAN.md`：分阶段生产化规划。

## 配置线上 MySQL

```bash
cp .env.example .env
cp .env.mysql.example .env.mysql
```

然后填写 `.env.mysql`：

```dotenv
CUBEJS_DB_TYPE=mysql
CUBEJS_DB_HOST=真实地址
CUBEJS_DB_PORT=3306
CUBEJS_DB_NAME=真实数据库名
CUBEJS_DB_USER=真实用户名
CUBEJS_DB_PASS=真实密码
CUBEJS_DB_SSL=true
```

`.env.mysql` 已加入 `.gitignore`，不会提交数据库密码。线上 MySQL 需要允许当前机器的公网出口 IP 访问。数据库不支持 SSL 时将 `CUBEJS_DB_SSL` 改为 `false`。

检查配置：

```bash
npm run db:check
```

## 一键启动

```bash
npm run dev
```

打开 `http://localhost:5555`。

不配置 `DASHSCOPE_API_KEY` 时，系统使用本地受控规则生成演示查询；配置后调用阿里云百炼 OpenAI 兼容接口。

DashScope 示例：

```dotenv
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_API_KEY=your-key
DASHSCOPE_MODEL=qwen-plus
```

## 本地开发

直接启动开发环境：

```bash
npm run dev
```

该命令会先校验 `.env.mysql`，再自动启动 Docker Desktop、Cube Store、
Cube Core，最后启动支持热更新的 Next.js。

如果只需启动 Docker 基础服务：

```bash
npm run serve
```

本地开发时 `.env` 中的 `CUBE_API_URL` 使用：

```dotenv
CUBE_API_URL=http://localhost:4000/cubejs-api/v1
```

默认 Compose 不向宿主机暴露 Cube；`docker-compose.dev.yml` 只绑定
`127.0.0.1:4000`，供本地 Next.js 服务访问。

## 数据模型

`cube/model/finance.yml` 根据 `metric-definitions.json` 和线上 MySQL
实际字段生成，包含：

- `Reimburse`：报销单金额、明细、部门、申请人、状态。
- `Department`：报销部门名称，通过 `reimburse.department_id` 关联。
- `LaborFeeDetail`：劳务费和税后金额。
- `TravelFeeDetail`：差旅、住宿、伙食、交通等金额。
- `TrainingFee`、`MeetingFee`：仅关联 `bill_type='Reimburse'` 的记录。
- `OfficialFeeDetail`、`OfficialTransportFeeDetail`、`AbroadFeeDetail`。
- `ReimburseItem`：关联报销单和预算项。
- `BudgetItem`：关联项目并提供预算执行指标。
- `Project`：项目数量、部门和负责人维度。
- `ProjectDepartment`：项目部门名称，通过 `project.department_id` 关联。

费用明细通过 `reimburse_id` 关联 `Reimburse`；
`ReimburseItem.parent_id` 关联报销单，
`ReimburseItem.budget_item_id` 关联预算项，
`BudgetItem.project_id` 关联项目。

系统默认按组织 `200` 隔离数据。报销和费用类查询在没有明确状态条件时，
默认只统计状态 `2`、`4` 的有效单据。

## Cube 调试

`.env` 设置 `CUBE_DEBUG=true` 后，Next.js 终端会输出每次 Cube 查询的
`queryFingerprint`、生成 SQL、SQL 参数、耗时和状态：

```text
[Cube] SQL {
  "queryFingerprint": "...",
  "sql": "SELECT ... WHERE ... = ?",
  "params": ["200"]
}
```

SQL 来自 Cube `/v1/sql` 调试接口，与正式 `/v1/load` 使用相同的受控
Cube Query。它仅用于排查，不应绕过 Cube 直接执行。

查看 Cube 容器日志：

```bash
npm run cube:logs
```

## API

- `GET /api/meta`：返回可公开的语义模型成员。
- `POST /api/llm`：调用大模型生成受控 Cube Query 和图表协议。
- `POST /api/query`：校验 Query、追加权限、执行 Cube 查询。
- `GET /api/health`：检查 Next.js 到 Cube 的链路。

## 安全边界

- 浏览器不保存 Cube API Secret 和 LLM API Key。
- LLM 只能选择 Cube 成员，不能生成或执行 SQL。
- 查询通过 Zod 和 Cube `/meta` 双重约束。
- 租户字段对 LLM 和前端隐藏。
- Next.js 强制追加租户条件。
- Cube `queryRewrite` 再强制追加租户条件。

`src/lib/auth.ts` 当前使用演示身份。生产环境必须改为真实服务端会话或 JWT claims。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
