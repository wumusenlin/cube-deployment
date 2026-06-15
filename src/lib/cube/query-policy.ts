import type { CubeQuery, PublicMeta } from "./types";
import { cubeQuerySchema } from "./schemas";
import { RequestValidationError } from "../errors";

interface CubePolicy {
  organizationMember: string;
  statusMember?: string;
}

const CUBE_POLICIES: Record<string, CubePolicy> = {
  Reimburse: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  LaborFeeDetail: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  TravelFeeDetail: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  TrainingFee: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  MeetingFee: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  OfficialFeeDetail: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  OfficialTransportFeeDetail: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  AbroadFeeDetail: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  ReimburseItem: {
    organizationMember: "Reimburse.organizationId",
    statusMember: "Reimburse.statusId",
  },
  Project: {
    organizationMember: "Project.organizationId",
  },
  BudgetItem: {
    organizationMember: "BudgetItem.organizationId",
  },
};

export const PROTECTED_MEMBERS = new Set(
  Object.values(CUBE_POLICIES).map((policy) => policy.organizationMember)
);

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

  const requestedPolicies = [
    ...new Set(query.measures.map((member) => member.split(".")[0])),
  ].map((cubeName) => CUBE_POLICIES[cubeName]);

  if (requestedPolicies.some((policy) => !policy)) {
    throw new RequestValidationError("查询包含不支持的 Cube");
  }
  const policies = requestedPolicies.filter(
    (policy): policy is CubePolicy => Boolean(policy)
  );

  const filters = (query.filters ?? []).filter(
    (filter) => !PROTECTED_MEMBERS.has(filter.member)
  );
  const existingMembers = new Set(filters.map((filter) => filter.member));
  const organizationMembers = new Set(
    policies.map((policy) => policy.organizationMember)
  );
  const statusMembers = new Set(
    policies
      .map((policy) => policy.statusMember)
      .filter((member): member is string => Boolean(member))
  );

  return {
    ...query,
    filters: [
      ...filters,
      ...[...organizationMembers].map((member) => ({
        member,
        operator: "equals" as const,
        values: [tenantId],
      })),
      ...[...statusMembers]
        .filter((member) => !existingMembers.has(member))
        .map((member) => ({
          member,
          operator: "equals" as const,
          values: ["2", "4"],
        })),
    ],
  };
}
