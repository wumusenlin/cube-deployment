# Cube Core 自部署语义分析

使用 Next.js 实现完整应用层，Cube Core 独立部署。

## 组件

- `cube/`：Cube Core YAML 语义模型和二次权限校验。
- `src/app/api/`：Next.js BFF、LLM 代理、Cube API 封装。
- `src/lib/cube/`：查询契约、白名单校验、图表协议。
- `src/components/`：自然语言工作台和图表渲染。
- `infra/postgres/`：本地演示数据。
- `docs/IMPLEMENTATION_PLAN.md`：分阶段生产化规划。

## 一键启动

```bash
cp .env.example .env
docker compose up --build
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

该命令会自动启动 Docker Desktop、PostgreSQL、Cube Store、Cube Core，
然后启动支持热更新的 Next.js。

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
