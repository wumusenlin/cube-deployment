import type { ChartProtocol } from "./schemas";
import type { CubeQuery, PublicMeta } from "./types";
import { RequestValidationError } from "../errors";

function getMemberTitle(meta: PublicMeta, memberName: string): string {
  for (const cube of meta.cubes) {
    const member = [...cube.measures, ...cube.dimensions].find(
      (item) => item.name === memberName
    );
    if (member) return member.title || member.shortTitle || member.name;
  }
  return memberName;
}

export function deriveChartProtocol(
  query: CubeQuery,
  meta: PublicMeta,
  title?: string
): ChartProtocol {
  const value = query.measures[0];
  const category =
    query.timeDimensions?.[0]?.dimension ?? query.dimensions?.[0];
  const series = query.dimensions?.find((item) => item !== category);

  let type: ChartProtocol["type"] = "bar";
  if (query.timeDimensions?.length) type = "line";
  if (!category) type = "kpi";

  return {
    type,
    title:
      title?.slice(0, 80) ??
      `${getMemberTitle(meta, value)}${category ? ` / ${getMemberTitle(meta, category)}` : ""}`,
    category,
    value,
    series,
    valueFormat: value.toLowerCase().includes("revenue")
      ? "currency"
      : "number",
  };
}

export function validateChartAgainstQuery(
  chart: ChartProtocol,
  query: CubeQuery
): ChartProtocol {
  const resultMembers = new Set([
    ...query.measures,
    ...(query.dimensions ?? []),
    ...(query.timeDimensions ?? []).map((item) => item.dimension),
  ]);

  if (!query.measures.includes(chart.value)) {
    throw new RequestValidationError("图表 value 必须是查询中的指标");
  }

  if (chart.category && !resultMembers.has(chart.category)) {
    throw new RequestValidationError("图表 category 不在查询结果中");
  }

  if (chart.series && !resultMembers.has(chart.series)) {
    throw new RequestValidationError("图表 series 不在查询结果中");
  }

  for (const column of chart.columns ?? []) {
    if (!resultMembers.has(column.member)) {
      throw new RequestValidationError(
        `表格列不在查询结果中: ${column.member}`
      );
    }
  }

  return chart;
}
