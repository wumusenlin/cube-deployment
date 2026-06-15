"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState } from "react";

import type { ChartProtocol } from "@/lib/cube/schemas";
import type { CubeQuery, CubeSqlQuery, PublicMeta } from "@/lib/cube/types";

const ChartRenderer = dynamic(
  () => import("./chart-renderer").then((module) => module.ChartRenderer),
  {
    ssr: false,
    loading: () => <div className="chart-skeleton">图表加载中...</div>,
  }
);

const PRESETS = [
  "查询本周的有效报销单列表",
  "按部门名称统计报销金额",
  "查看每月报销金额趋势",
  "按部门名称统计劳务费金额和税后金额",
  "按部门名称统计差旅费、住宿费和交通费",
  "按预算项和项目统计报销金额",
  "按项目统计预算金额、执行金额和可用预算",
];

interface MetaResponse extends PublicMeta {
  context: {
    tenantId: string;
    role: string;
  };
}

interface LlmResponse {
  query: CubeQuery;
  chart: ChartProtocol;
  explanation: string;
  provider: "llm" | "fallback";
  error?: string;
}

interface QueryResponse {
  data: Array<Record<string, string | number | null>>;
  query: CubeQuery;
  sqlQuery: CubeSqlQuery | null;
  sqlError?: string;
  updatedAt: string;
  chart: ChartProtocol;
  context: {
    tenantId: string;
    role: string;
  };
  error?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `请求失败: ${response.status}`);
  return payload;
}

function formatUpdatedAt(value: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}.${part("fractionalSecond")}`;
}

function formatSqlQuery(sqlQuery: CubeSqlQuery | null, error?: string): string {
  if (!sqlQuery) return error ? `SQL 生成失败：${error}` : "";
  return `-- params: ${JSON.stringify(sqlQuery.params)}\n${sqlQuery.sql}`;
}

export function AnalyticsWorkbench() {
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [queryText, setQueryText] = useState("");
  const [sqlQueryText, setSqlQueryText] = useState("");
  const [queryUpdatedAt, setQueryUpdatedAt] = useState("");
  const [chart, setChart] = useState<ChartProtocol | null>(null);
  const [data, setData] = useState<
    Array<Record<string, string | number | null>>
  >([]);
  const [explanation, setExplanation] = useState("");
  const [provider, setProvider] = useState<"llm" | "fallback" | null>(null);
  const [status, setStatus] = useState("等待查询");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/meta")
      .then((response) => readJson<MetaResponse>(response))
      .then((payload) => {
        if (active) setMeta(payload);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "元数据加载失败");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function executeQuery(
    nextQuery: CubeQuery,
    nextChart?: ChartProtocol
  ) {
    setStatus("后端校验并执行 Cube Query");
    const result = await readJson<QueryResponse>(
      await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextQuery, chart: nextChart }),
      })
    );

    setQueryText(JSON.stringify(result.query, null, 2));
    setSqlQueryText(formatSqlQuery(result.sqlQuery, result.sqlError));
    setQueryUpdatedAt(formatUpdatedAt(result.updatedAt));
    setChart(result.chart);
    setData(result.data);
    setStatus(`查询完成，共 ${result.data.length} 行`);
  }

  async function handleNaturalLanguageSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("LLM 正在生成受控 Cube Query");

    try {
      const generated = await readJson<LlmResponse>(
        await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        })
      );
      setExplanation(generated.explanation);
      setProvider(generated.provider);
      await executeQuery(generated.query, generated.chart);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "查询失败");
      setStatus("查询失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualExecute() {
    setLoading(true);
    setError("");

    try {
      const parsed = JSON.parse(queryText) as CubeQuery;
      await executeQuery(parsed, chart ?? undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "JSON 解析失败");
      setStatus("查询失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SELF-HOSTED ANALYTICS</p>
          <h1>Cube 语义分析工作台</h1>
        </div>
        <div className="context-badge">
          <span className={meta ? "status-dot online" : "status-dot"} />
          {meta
            ? `${meta.context.tenantId} / ${meta.context.role}`
            : "Cube 连接中"}
        </div>
      </header>

      <section className="pipeline" aria-label="处理链路">
        {[
          ["01", "自然语言", "用户分析意图"],
          ["02", "受控查询", "LLM 输出白名单 JSON"],
          ["03", "权限校验", "后端追加租户条件"],
          ["04", "Cube Core", "语义模型执行聚合"],
          ["05", "图表协议", "前端统一渲染"],
        ].map(([number, title, detail]) => (
          <div className="pipeline-step" key={number}>
            <span>{number}</span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </section>

      <section className="workspace-grid">
        <aside className="control-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">QUERY CONSOLE</p>
              <h2>分析需求</h2>
            </div>
            <span className="model-tag">
              {provider === "llm" ? "LLM" : provider === "fallback" ? "RULE" : "READY"}
            </span>
          </div>

          <form onSubmit={handleNaturalLanguageSubmit}>
            <label htmlFor="prompt">自然语言问题</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：按部门名称统计本年度报销金额"
              rows={5}
            />
            <div className="preset-list">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  className="preset-button"
                  key={preset}
                  onClick={() => setPrompt(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? "处理中..." : "生成并执行查询"}
            </button>
          </form>

          <div className="query-editor">
            <div className="query-editor-title">
              <div>
                <label htmlFor="query-json">Cube Query</label>
                <time>{queryUpdatedAt ? `更新时间：${queryUpdatedAt}` : ""}</time>
              </div>
              <button
                type="button"
                disabled={!queryText || loading}
                onClick={handleManualExecute}
              >
                重新执行
              </button>
            </div>
            <textarea
              id="query-json"
              className="code-textarea"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="生成后的受控查询会显示在这里"
              rows={13}
              spellCheck={false}
            />
          </div>

          <div className="query-editor">
            <div className="query-editor-title">
              <div>
                <label htmlFor="sql-query">SQL Query</label>
                <time>{queryUpdatedAt ? `更新时间：${queryUpdatedAt}` : ""}</time>
              </div>
            </div>
            <textarea
              id="sql-query"
              className="code-textarea sql-textarea"
              value={sqlQueryText}
              placeholder="Cube Query 对应的 SQL 和参数会显示在这里"
              rows={13}
              readOnly
              spellCheck={false}
            />
          </div>
        </aside>

        <section className="result-panel">
          <div className="result-header">
            <div>
              <p className="section-label">ANALYTICS OUTPUT</p>
              <h2>{chart?.title ?? "等待分析"}</h2>
            </div>
            <div className="result-status">{status}</div>
          </div>

          {error ? <div className="error-box">{error}</div> : null}

          <div className="chart-card">
            {chart ? (
              <ChartRenderer chart={chart} data={data} />
            ) : (
              <div className="empty-state">
                <div className="empty-grid" />
                <strong>输入分析问题后生成图表</strong>
                <span>查询只能访问已发布的 Cube 指标和维度</span>
              </div>
            )}
          </div>

          <div className="result-footer">
            <div>
              <span>语义说明</span>
              <p>{explanation || "尚未生成查询。"}</p>
            </div>
            <div>
              <span>安全边界</span>
              <p>
                租户字段不开放给 LLM，服务端和 Cube Core 均会强制追加权限。
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
