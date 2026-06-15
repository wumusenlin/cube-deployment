import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicMeta } from "./cube/types";
import { generateAnalytics } from "./llm";

const meta: PublicMeta = {
  cubes: [
    {
      name: "Reimburse",
      title: "报销单",
      measures: [
        {
          name: "Reimburse.count",
          title: "报销单数量",
          shortTitle: "报销单数量",
          type: "number",
        },
        {
          name: "Reimburse.totalAmount",
          title: "报销金额",
          shortTitle: "报销金额",
          type: "number",
        },
      ],
      dimensions: [
        "id",
        "code",
        "departmentId",
        "applyUserId",
        "amount",
        "statusId",
        "applyDate",
      ].map((name) => ({
        name: `Reimburse.${name}`,
        title: name,
        shortTitle: name,
        type: name === "applyDate" ? "time" : "string",
      })),
    },
    {
      name: "Department",
      title: "报销部门",
      measures: [],
      dimensions: [
        {
          name: "Department.name",
          title: "部门名称",
          shortTitle: "部门名称",
          type: "string",
        },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LLM fallback", () => {
  it("creates a current-week reimburse detail table", async () => {
    const previousApiKey = process.env.LLM_API_KEY;
    const previousDashScopeApiKey = process.env.DASHSCOPE_API_KEY;
    delete process.env.LLM_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;

    try {
      const generated = await generateAnalytics(
        "查询本周的报销单列表",
        meta
      );

      expect(generated.chart.type).toBe("table");
      expect(generated.chart.columns?.map((column) => column.member)).toContain(
        "Reimburse.amount"
      );
      expect(generated.query.timeDimensions?.[0]?.dateRange).toHaveLength(2);
      expect(generated.query.dimensions).toContain("Reimburse.applyDate");
      expect(generated.query.dimensions).toContain("Department.name");
      expect(generated.query.order).toEqual({
        "Reimburse.applyDate": "desc",
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
          measures: ["Reimburse.count"],
          dimensions: ["Reimburse.id", "Reimburse.statusId"],
        },
        chart: {
          type: "table",
          columns: [
            { member: "Reimburse.id" },
            { member: "Reimburse.statusId", title: "状态" },
          ],
        },
      })
    );

    expect(generated.chart.value).toBe("Reimburse.count");
    expect(generated.chart.title).toBe("测试查询");
    expect(generated.chart.columns).toEqual([
      { member: "Reimburse.id", title: "id", format: "number" },
      { member: "Reimburse.statusId", title: "状态", format: "text" },
    ]);
  });

  it("normalizes a granular time category", async () => {
    const generated = await generateFromContent(
      JSON.stringify({
        query: {
          measures: ["Reimburse.count"],
          timeDimensions: [
            { dimension: "Reimburse.applyDate", granularity: "month" },
          ],
        },
        chart: {
          type: "line",
          title: "每月订单趋势",
          category: "Reimburse.applyDate.month",
          value: "Reimburse.count",
          valueFormat: "number",
        },
      })
    );

    expect(generated.chart.category).toBe("Reimburse.applyDate");
  });

  it("normalizes array order returned by the model", async () => {
    const generated = await generateFromContent(
      JSON.stringify({
        query: {
          measures: ["Reimburse.count"],
          dimensions: ["Reimburse.statusId"],
          order: [
            { member: "Reimburse.count", direction: "desc" },
          ],
          limit: "100",
        },
        chart: {
          type: "bar",
          title: "订单状态统计",
          category: "Reimburse.statusId",
          value: "Reimburse.count",
          valueFormat: "number",
        },
      })
    );

    expect(generated.query.order).toEqual({
      "Reimburse.count": "desc",
    });
    expect(generated.query.limit).toBe(100);
  });
});
