import type { CubeQuery, PublicMeta } from "./types";
import { cubeQuerySchema } from "./schemas";
import { RequestValidationError } from "../errors";

export const PROTECTED_MEMBERS = new Set(["Orders.tenantId"]);

interface MemberIndex {
  measures: Set<string>;
  dimensions: Set<string>;
}

function buildMemberIndex(meta: PublicMeta): MemberIndex {
  const measures = new Set<string>();
  const dimensions = new Set<string>();

  for (const cube of meta.cubes) {
    for (const measure of cube.measures) measures.add(measure.name);
    for (const dimension of cube.dimensions) dimensions.add(dimension.name);
  }

  return { measures, dimensions };
}

function assertAllowedMember(
  member: string,
  allowed: Set<string>,
  kind: string
): void {
  if (!allowed.has(member) || PROTECTED_MEMBERS.has(member)) {
    throw new RequestValidationError(`不允许使用${kind}: ${member}`);
  }
}

export function validateGeneratedQuery(
  input: unknown,
  meta: PublicMeta
): CubeQuery {
  const query = cubeQuerySchema.parse(input);
  const index = buildMemberIndex(meta);

  for (const measure of query.measures) {
    assertAllowedMember(measure, index.measures, "指标");
  }

  for (const dimension of query.dimensions ?? []) {
    assertAllowedMember(dimension, index.dimensions, "维度");
  }

  for (const timeDimension of query.timeDimensions ?? []) {
    assertAllowedMember(timeDimension.dimension, index.dimensions, "时间维度");
  }

  for (const filter of query.filters ?? []) {
    assertAllowedMember(filter.member, index.dimensions, "过滤字段");
  }

  for (const orderMember of Object.keys(query.order ?? {})) {
    const isKnown =
      index.measures.has(orderMember) || index.dimensions.has(orderMember);
    if (!isKnown || PROTECTED_MEMBERS.has(orderMember)) {
      throw new RequestValidationError(`不允许使用排序字段: ${orderMember}`);
    }
  }

  return query;
}

export function applyAccessPolicy(
  query: CubeQuery,
  tenantId: string
): CubeQuery {
  if (!tenantId) throw new RequestValidationError("缺少租户上下文");

  const filters = (query.filters ?? []).filter(
    (filter) => !PROTECTED_MEMBERS.has(filter.member)
  );

  return {
    ...query,
    filters: [
      ...filters,
      {
        member: "Orders.tenantId",
        operator: "equals",
        values: [tenantId],
      },
    ],
  };
}
