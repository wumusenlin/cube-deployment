import { describe, expect, it } from "vitest";

import { deriveChartProtocol } from "./chart-protocol";
import type { PublicMeta } from "./types";

const meta: PublicMeta = {
  cubes: [
    {
      name: "Reimburse",
      title: "报销单",
      measures: [
        {
          name: "Reimburse.totalAmount",
          title: "报销金额",
          shortTitle: "报销金额",
          type: "number",
        },
      ],
      dimensions: [
        {
          name: "Reimburse.applyDate",
          title: "申请时间",
          shortTitle: "申请时间",
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
        measures: ["Reimburse.totalAmount"],
        timeDimensions: [
          { dimension: "Reimburse.applyDate", granularity: "month" },
        ],
      },
      meta
    );

    expect(chart.type).toBe("line");
    expect(chart.valueFormat).toBe("currency");
  });
});
