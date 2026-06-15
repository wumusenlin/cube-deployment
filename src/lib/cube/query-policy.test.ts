import { describe, expect, it } from "vitest";

import {
  applyAccessPolicy,
  validateGeneratedQuery,
} from "./query-policy";
import type { PublicMeta } from "./types";

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
      ],
      dimensions: [
        {
          name: "Reimburse.statusId",
          title: "状态ID",
          shortTitle: "状态ID",
          type: "number",
        },
        {
          name: "Reimburse.organizationId",
          title: "组织ID",
          shortTitle: "组织ID",
          type: "number",
        },
      ],
    },
  ],
};

describe("query policy", () => {
  it("accepts known semantic members", () => {
    const query = validateGeneratedQuery(
      {
        measures: ["Reimburse.count"],
        dimensions: ["Reimburse.statusId"],
        limit: 20,
      },
      meta
    );

    expect(query.measures).toEqual(["Reimburse.count"]);
  });

  it("rejects protected tenant members", () => {
    expect(() =>
      validateGeneratedQuery(
        {
          measures: ["Reimburse.count"],
          dimensions: ["Reimburse.organizationId"],
        },
        meta
      )
    ).toThrow("Reimburse.organizationId");
  });

  it("overwrites tenant filters with the authenticated tenant", () => {
    const authorized = applyAccessPolicy(
      {
        measures: ["Reimburse.count"],
        filters: [
          {
            member: "Reimburse.organizationId",
            operator: "equals",
            values: ["300"],
          },
        ],
      },
      "200"
    );

    expect(authorized.filters).toEqual([
      {
        member: "Reimburse.organizationId",
        operator: "equals",
        values: ["200"],
      },
      {
        member: "Reimburse.statusId",
        operator: "equals",
        values: ["2", "4"],
      },
    ]);
  });

  it("keeps an explicit reimburse status filter", () => {
    const authorized = applyAccessPolicy(
      {
        measures: ["Reimburse.count"],
        filters: [
          {
            member: "Reimburse.statusId",
            operator: "equals",
            values: ["3"],
          },
        ],
      },
      "200"
    );

    expect(authorized.filters).toContainEqual({
      member: "Reimburse.statusId",
      operator: "equals",
      values: ["3"],
    });
  });
});
