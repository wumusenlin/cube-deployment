import { describe, expect, it } from "vitest";

import { deriveChartProtocol } from "./chart-protocol";
import type { PublicMeta } from "./types";

const meta: PublicMeta = {
  cubes: [
    {
      name: "Orders",
      title: "Orders",
      measures: [
        {
          name: "Orders.revenue",
          title: "销售额",
          shortTitle: "销售额",
          type: "number",
        },
      ],
      dimensions: [
        {
          name: "Orders.createdAt",
          title: "下单时间",
          shortTitle: "下单时间",
          type: "time",
        },
      ],
    },
  ],
};

describe("chart protocol", () => {
  it("uses a line chart for time series queries", () => {
    const chart = deriveChartProtocol(
      {
        measures: ["Orders.revenue"],
        timeDimensions: [
          { dimension: "Orders.createdAt", granularity: "month" },
        ],
      },
      meta
    );

    expect(chart.type).toBe("line");
    expect(chart.valueFormat).toBe("currency");
  });
});
