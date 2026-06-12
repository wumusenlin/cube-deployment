import type { ChartProtocol } from "./cube/schemas";
import { chartProtocolSchema } from "./cube/schemas";
import {
  deriveChartProtocol,
  validateChartAgainstQuery,
} from "./cube/chart-protocol";
import { validateGeneratedQuery } from "./cube/query-policy";
import {
  FILTER_OPERATORS,
  TIME_GRANULARITIES,
  type CubeQuery,
  type PublicMeta,
} from "./cube/types";

interface GeneratedAnalytics {
  query: CubeQuery;
  chart: ChartProtocol;
  explanation: string;
  provider: "llm" | "fallback";
}

interface LlmResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getCurrentWeekDateRange(): [string, string] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const today = new Date(
    Date.UTC(values.year, values.month - 1, values.day)
  );
  const day = today.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return [formatIsoDate(start), formatIsoDate(end)];
}

function buildSemanticSchema(meta: PublicMeta): string {
  return meta.cubes
    .map((cube) => {
      const measures = cube.measures
        .map((member) => `${member.name}(${member.title})`)
        .join(", ");
      const dimensions = cube.dimensions
        .filter((member) => member.name !== "Orders.tenantId")
        .map((member) => `${member.name}(${member.title},${member.type})`)
        .join(", ");
      return `Cube ${cube.name}\nMeasures: ${measures}\nDimensions: ${dimensions}`;
    })
    .join("\n\n");
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM 未返回 JSON");
    return JSON.parse(match[0]);
  }
}

function normalizeGeneratedOrder(order: unknown): unknown {
  if (!Array.isArray(order)) return order;

  const normalized: Record<string, "asc" | "desc"> = {};
  for (const item of order) {
    if (Array.isArray(item)) {
      const [member, direction] = item;
      if (
        typeof member === "string" &&
        (direction === "asc" || direction === "desc")
      ) {
        normalized[member] = direction;
      }
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const member = record.member ?? record.field ?? record.name;
    const direction = record.direction ?? record.order ?? record.value;
    if (
      typeof member === "string" &&
      (direction === "asc" || direction === "desc")
    ) {
      normalized[member] = direction;
    }
  }

  return normalized;
}

function normalizeGeneratedQuery(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const generated = input as Record<string, unknown>;
  const measures = Array.isArray(generated.measures)
    ? generated.measures.filter(
        (member): member is string => typeof member === "string" && Boolean(member)
      )
    : typeof generated.measures === "string"
      ? [generated.measures]
      : generated.measures;
  const dimensions = Array.isArray(generated.dimensions)
    ? generated.dimensions.filter(
        (member): member is string => typeof member === "string" && Boolean(member)
      )
    : typeof generated.dimensions === "string"
      ? [generated.dimensions]
      : undefined;
  const timeDimensions = Array.isArray(generated.timeDimensions)
    ? generated.timeDimensions
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item)
        )
        .map((item) => {
          const dateRange =
            item.dateRange &&
            typeof item.dateRange === "object" &&
            !Array.isArray(item.dateRange)
              ? [
                  (item.dateRange as Record<string, unknown>).start,
                  (item.dateRange as Record<string, unknown>).end,
                ]
              : item.dateRange;
          return {
            dimension: item.dimension,
            granularity: TIME_GRANULARITIES.includes(
              item.granularity as (typeof TIME_GRANULARITIES)[number]
            )
              ? item.granularity
              : undefined,
            dateRange,
          };
        })
    : undefined;
  const filters = Array.isArray(generated.filters)
    ? generated.filters
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item)
        )
        .map((item) => ({
          member: item.member,
          operator: FILTER_OPERATORS.includes(
            item.operator as (typeof FILTER_OPERATORS)[number]
          )
            ? item.operator
            : undefined,
          values: Array.isArray(item.values)
            ? item.values.map(String)
            : item.value === undefined
              ? undefined
              : [String(item.value)],
        }))
    : undefined;
  const limit = Number(generated.limit);
  const offset = Number(generated.offset);

  return {
    measures,
    dimensions: dimensions?.length ? dimensions : undefined,
    timeDimensions: timeDimensions?.length ? timeDimensions : undefined,
    filters: filters?.length ? filters : undefined,
    order: normalizeGeneratedOrder(generated.order),
    limit: Number.isInteger(limit)
      ? Math.min(500, Math.max(1, limit))
      : undefined,
    offset:
      Number.isInteger(offset) && offset >= 0
        ? Math.min(10_000, offset)
        : undefined,
    timezone:
      typeof generated.timezone === "string" && generated.timezone
        ? generated.timezone
        : undefined,
  };
}

function getMember(meta: PublicMeta, memberName: string) {
  for (const cube of meta.cubes) {
    const member = [...cube.measures, ...cube.dimensions].find(
      (item) => item.name === memberName
    );
    if (member) return member;
  }
  return undefined;
}

function getTableColumnFormat(
  memberName: string,
  meta: PublicMeta
): "text" | "number" | "currency" | "date" | "datetime" {
  const member = getMember(meta, memberName);
  const normalizedName = memberName.toLowerCase();

  if (member?.type === "time") return "datetime";
  if (/amount|revenue/.test(normalizedName)) return "currency";
  if (member?.type === "number" || normalizedName.endsWith(".id")) {
    return "number";
  }
  return "text";
}

function normalizeTimeCategory(
  category: unknown,
  query: CubeQuery
): string | undefined {
  if (typeof category !== "string" || !category) return undefined;

  for (const timeDimension of query.timeDimensions ?? []) {
    if (
      timeDimension.granularity &&
      category === `${timeDimension.dimension}.${timeDimension.granularity}`
    ) {
      return timeDimension.dimension;
    }
  }

  return category;
}

function normalizeGeneratedChart(
  chart: unknown,
  query: CubeQuery,
  meta: PublicMeta,
  prompt: string
): unknown {
  const generated =
    chart && typeof chart === "object" && !Array.isArray(chart)
      ? (chart as Record<string, unknown>)
      : {};
  const derived = deriveChartProtocol(query, meta, prompt);
  const resultMembers = new Set([
    ...query.measures,
    ...(query.dimensions ?? []),
    ...(query.timeDimensions ?? []).map((item) => item.dimension),
  ]);
  const chartTypes = new Set(["bar", "line", "area", "pie", "kpi", "table"]);
  const valueFormats = new Set(["number", "currency", "percent"]);
  const type = chartTypes.has(String(generated.type))
    ? (generated.type as ChartProtocol["type"])
    : derived.type;
  const category = normalizeTimeCategory(generated.category, query);
  const series =
    typeof generated.series === "string" &&
    resultMembers.has(generated.series)
      ? generated.series
      : undefined;
  const columns = Array.isArray(generated.columns)
    ? generated.columns
        .filter(
          (column): column is Record<string, unknown> =>
            Boolean(column) &&
            typeof column === "object" &&
            !Array.isArray(column) &&
            typeof (column as Record<string, unknown>).member === "string" &&
            resultMembers.has(
              (column as Record<string, unknown>).member as string
            )
        )
        .map((column) => {
          const member = column.member as string;
          const metaMember = getMember(meta, member);
          return {
            member,
            title:
              typeof column.title === "string" && column.title
                ? column.title
                : metaMember?.title || metaMember?.shortTitle || member,
            format: getTableColumnFormat(member, meta),
          };
        })
    : [];

  if (type === "table" && columns.length === 0) {
    const tableMembers = [
      ...(query.dimensions ?? []),
      ...(query.timeDimensions ?? []).map((item) => item.dimension),
    ];
    columns.push(
      ...tableMembers.map((member) => {
        const metaMember = getMember(meta, member);
        return {
          member,
          title: metaMember?.title || metaMember?.shortTitle || member,
          format: getTableColumnFormat(member, meta),
        };
      })
    );
  }

  return {
    type,
    title:
      typeof generated.title === "string" && generated.title
        ? generated.title.slice(0, 80)
        : derived.title,
    category:
      category && resultMembers.has(category) ? category : derived.category,
    value:
      typeof generated.value === "string" &&
      query.measures.includes(generated.value)
        ? generated.value
        : derived.value,
    series,
    valueFormat: valueFormats.has(String(generated.valueFormat))
      ? generated.valueFormat
      : derived.valueFormat,
    columns: type === "table" && columns.length ? columns : undefined,
  };
}

function buildFallback(prompt: string, meta: PublicMeta): GeneratedAnalytics {
  const normalized = prompt.toLowerCase();
  const isDetailList = /列表|明细|订单数据|订单记录|detail|list/.test(
    normalized
  );
  const isCurrentWeek = /本周|这周|本星期|this week/.test(normalized);

  if (isDetailList && isCurrentWeek) {
    const dateRange = getCurrentWeekDateRange();
    const query: CubeQuery = {
      measures: ["Orders.count"],
      dimensions: [
        "Orders.id",
        "Orders.status",
        "Orders.category",
        "Orders.region",
        "Orders.amount",
        "Orders.createdAt",
      ],
      timeDimensions: [
        {
          dimension: "Orders.createdAt",
          dateRange,
        },
      ],
      order: {
        "Orders.createdAt": "desc",
      },
      limit: 200,
      timezone: "Asia/Shanghai",
    };
    const validated = validateGeneratedQuery(query, meta);

    return {
      query: validated,
      chart: {
        type: "table",
        title: `本周订单列表（${dateRange[0]} 至 ${dateRange[1]}）`,
        value: "Orders.count",
        valueFormat: "number",
        columns: [
          { member: "Orders.id", title: "订单ID", format: "number" },
          {
            member: "Orders.createdAt",
            title: "下单时间",
            format: "datetime",
          },
          { member: "Orders.status", title: "订单状态", format: "text" },
          { member: "Orders.category", title: "商品分类", format: "text" },
          { member: "Orders.region", title: "区域", format: "text" },
          { member: "Orders.amount", title: "订单金额", format: "currency" },
        ],
      },
      explanation: `查询上海时区本周（${dateRange[0]} 至 ${dateRange[1]}）的订单明细，按下单时间倒序。`,
      provider: "fallback",
    };
  }

  const isAverage = /平均|均值|average/.test(normalized);
  const isRevenue = /销售额|金额|收入|revenue/.test(normalized);
  const isTime = /趋势|每天|每日|月份|月度|时间|trend/.test(normalized);
  const measure = isAverage
    ? "Orders.averageAmount"
    : isRevenue
      ? "Orders.revenue"
      : "Orders.count";

  let dimension = "Orders.status";
  if (/分类|品类|category/.test(normalized)) dimension = "Orders.category";
  if (/区域|地区|region/.test(normalized)) dimension = "Orders.region";

  const query: CubeQuery = {
    measures: [measure],
    dimensions: isTime ? undefined : [dimension],
    timeDimensions: isTime
      ? [{ dimension: "Orders.createdAt", granularity: "month" }]
      : undefined,
    order: {
      [measure]: "desc",
    },
    limit: 100,
  };

  const validated = validateGeneratedQuery(query, meta);
  return {
    query: validated,
    chart: deriveChartProtocol(validated, meta, prompt),
    explanation: "未配置 DASHSCOPE_API_KEY，使用本地受控规则生成查询。",
    provider: "fallback",
  };
}

export async function generateAnalytics(
  prompt: string,
  meta: PublicMeta
): Promise<GeneratedAnalytics> {
  const apiKey =
    process.env.DASHSCOPE_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return buildFallback(prompt, meta);

  const baseUrl = (
    process.env.DASHSCOPE_BASE_URL ||
    process.env.LLM_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/, "");
  const model =
    process.env.DASHSCOPE_MODEL || process.env.LLM_MODEL || "qwen-plus";
  const currentWeek = getCurrentWeekDateRange();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是 Cube 查询规划器。只能使用给定语义模型生成只读聚合查询。

约束：
1. 只输出 JSON，不输出 Markdown。
2. query 只允许 measures、dimensions、timeDimensions、filters、order、limit。
3. measures 1-3 个，dimensions 0-6 个，limit 1-500。
   order 必须是对象，例如 {"Orders.createdAt":"desc"}，禁止输出数组。
4. 禁止使用 Orders.tenantId，权限过滤由后端追加。
5. chart.type 只能是 bar、line、area、pie、kpi、table。
6. 当用户要求列表、明细或记录时，chart.type 必须为 table；query 需要包含 Orders.id，时间按 Orders.createdAt desc 排序。
7. chart.title、chart.value 必填；chart.value 必须是 query.measures 中的成员。
8. table 必须输出 columns，每列结构为 {"member":"","title":"","format":"text|number|currency|date|datetime"}。
   非 table 图表不要输出 columns；可选字段没有值时直接省略，不要输出空字符串或空数组。
9. timeDimensions 的图表 category 必须使用原始维度名，例如 Orders.createdAt，禁止输出 Orders.createdAt.month。
10. 当前上海时区本周范围是 ${currentWeek[0]} 至 ${currentWeek[1]}，相对日期必须转换成明确 dateRange。
11. 输出结构：
{"query":{},"chart":{"type":"bar","title":"图表标题","category":"维度成员","value":"指标成员","valueFormat":"number"},"explanation":"查询说明"}

语义模型：
${buildSemanticSchema(meta)}`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as LlmResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `LLM 请求失败: ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  console.log('content', content)
  if (!content) throw new Error("LLM 返回为空");

  const parsed = extractJson(content) as {
    query?: unknown;
    chart?: unknown;
    explanation?: unknown;
  };
  const query = validateGeneratedQuery(
    normalizeGeneratedQuery(parsed.query),
    meta
  );
  const chart = parsed.chart
    ? chartProtocolSchema.parse(
        normalizeGeneratedChart(parsed.chart, query, meta, prompt)
      )
    : deriveChartProtocol(query, meta, prompt);
  console.log('query', query)
  return {
    query,
    chart: validateChartAgainstQuery(chart, query),
    explanation: String(parsed.explanation || "LLM 已生成受控 Cube Query。"),
    provider: "llm",
  };
}
