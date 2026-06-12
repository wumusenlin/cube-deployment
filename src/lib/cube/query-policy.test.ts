import { describe, expect, it } from "vitest";

import {
  applyAccessPolicy,
  validateGeneratedQuery,
} from "./query-policy";
import type { PublicMeta } from "./types";

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
        {
          name: "Orders.status",
          title: "状态",
          shortTitle: "状态",
          type: "string",
        },
        {
          name: "Orders.tenantId",
          title: "租户",
          shortTitle: "租户",
          type: "string",
        },
      ],
    },
  ],
};

describe("query policy", () => {
  it("accepts known semantic members", () => {
    const query = validateGeneratedQuery(
      {
        measures: ["Orders.count"],
        dimensions: ["Orders.status"],
        limit: 20,
      },
      meta
    );

    expect(query.measures).toEqual(["Orders.count"]);
  });

  it("rejects protected tenant members", () => {
    expect(() =>
      validateGeneratedQuery(
        {
          measures: ["Orders.count"],
          dimensions: ["Orders.tenantId"],
        },
        meta
      )
    ).toThrow("Orders.tenantId");
  });

  it("overwrites tenant filters with the authenticated tenant", () => {
    const authorized = applyAccessPolicy(
      {
        measures: ["Orders.count"],
        filters: [
          {
            member: "Orders.tenantId",
            operator: "equals",
            values: ["tenant-b"],
          },
        ],
      },
      "tenant-a"
    );

    expect(authorized.filters).toEqual([
      {
        member: "Orders.tenantId",
        operator: "equals",
        values: ["tenant-a"],
      },
    ]);
  });
});
