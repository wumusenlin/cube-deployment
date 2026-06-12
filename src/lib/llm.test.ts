import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicMeta } from "./cube/types";
import { generateAnalytics } from "./llm";

const meta: PublicMeta = {
  cubes: [
    {
      name: "Orders",
      title: "Orders",
      measures: [
        {
          name: "Orders.count",
          title: "订单数",
          shortTitle: "订单数",
          type: "number",
        },
      ],
      dimensions: [
        "id",
        "status",
        "category",
        "region",
        "amount",
        "createdAt",
      ].map((name) => ({
        name: `Orders.${name}`,
        title: name,
        shortTitle: name,
        type: name === "createdAt" ? "time" : "string",
      })),
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LLM fallback", () => {
  it("creates a current-week order detail table", async () => {
    const previousApiKey = process.env.LLM_API_KEY;
    const previousDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
    delete process.env.LLM_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;

    try {
      const generated = await generateAnalytics(
        "查询本周的订单数据列表",
        meta
      );

      expect(generated.chart.type).toBe("table");
      expect(generated.chart.columns?.map((column) => column.member)).toContain(
        "Orders.amount"
      );
      expect(generated.query.timeDimensions?.[0]?.dateRange).toHaveLength(2);
      expect(generated.query.dimensions).toContain("Orders.createdAt");
      expect(generated.query.order).toEqual({
        "Orders.createdAt": "desc",
      });
      expect(generated.query.timezone).toBe("Asia/Shanghai");
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.LLM_API_KEY;
      } else {
        process.env.LLM_API_KEY = previousApiKey;
      }
      if (previousDashScopeApiKey === undefined) {
        delete process.env.DASHSCOPE_API_KEY;
      } else {
        process.env.DASHSCOPE_API_KEY = previousDashScopeApiKey;
      }
    }
  });
});

describe("Bailian response normalization", () => {
  async function generateFromContent(content: string) {
    const previousApiKey = process.env.DASHSCOPE_API_KEY;
    process.env.DASHSCOPE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content } }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    try {
      return await generateAnalytics("测试查询", meta);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.DASHSCOPE_API_KEY;
      } else {
        process.env.DASHSCOPE_API_KEY = previousApiKey;
      }
    }
  }

  it("fills required table chart fields", async () => {
    const generated = await generateFromContent(
      JSON.stringify({
        query: {
          measures: ["Orders.count"],
          dimensions: ["Orders.id", "Orders.status"],
        },
        chart: {
          type: "table",
          columns: [
            { member: "Orders.id" },
            { member: "Orders.status", title: "状态" },
          ],
        },
      })
    );

    expect(generated.chart.value).toBe("Orders.count");
    expect(generated.chart.title).toBe("测试查询");
    expect(generated.chart.columns).toEqual([
      { member: "Orders.id", title: "id", format: "number" },
      { member: "Orders.status", title: "状态", format: "text" },
    ]);
  });

  it("normalizes a granular time category", async () => {
    const generated = await generateFromContent(
      JSON.stringify({
        query: {
          measures: ["Orders.count"],
          timeDimensions: [
            { dimension: "Orders.createdAt", granularity: "month" },
          ],
        },
        chart: {
          type: "line",
          title: "每月订单趋势",
          category: "Orders.createdAt.month",
          value: "Orders.count",
          valueFormat: "number",
        },
      })
    );

    expect(generated.chart.category).toBe("Orders.createdAt");
  });

  it("normalizes array order returned by the model", async () => {
    const generated = await generateFromContent(
      JSON.stringify({
        query: {
          measures: ["Orders.count"],
          dimensions: ["Orders.status"],
          order: [
            { member: "Orders.count", direction: "desc" },
          ],
          limit: "100",
        },
        chart: {
          type: "bar",
          title: "订单状态统计",
          category: "Orders.status",
          value: "Orders.count",
          valueFormat: "number",
        },
      })
    );

    expect(generated.query.order).toEqual({
      "Orders.count": "desc",
    });
    expect(generated.query.limit).toBe(100);
  });
});
