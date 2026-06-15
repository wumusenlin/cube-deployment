const cubePolicies = {
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

const protectedMembers = new Set(
  Object.values(cubePolicies).map((policy) => policy.organizationMember)
);

function getQueryPolicies(query) {
  const cubeNames = new Set(
    (query.measures || []).map((member) => member.split(".")[0])
  );
  return [...cubeNames]
    .map((cubeName) => cubePolicies[cubeName])
    .filter(Boolean);
}

function getRefreshOrganizationIds() {
  return (process.env.REFRESH_ORGANIZATION_IDS || "200")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

module.exports = {
  scheduledRefreshContexts: async () =>
    getRefreshOrganizationIds().map((tenantId) => ({
      securityContext: {
        userId: "refresh-worker",
        tenantId,
        role: "system",
      },
    })),
  queryRewrite: (query, { securityContext }) => {
    const tenantId = securityContext?.tenantId;

    if (!tenantId) {
      throw new Error("Missing tenantId in security context");
    }

    const policies = getQueryPolicies(query);
    if (policies.length === 0) {
      throw new Error("Unsupported cube in query");
    }

    const filters = (query.filters || []).filter(
      (filter) => !protectedMembers.has(filter.member)
    );
    const existingMembers = new Set(filters.map((filter) => filter.member));
    const organizationMembers = new Set(
      policies.map((policy) => policy.organizationMember)
    );
    const statusMembers = new Set(
      policies.map((policy) => policy.statusMember).filter(Boolean)
    );

    query.filters = [
      ...filters,
      ...[...organizationMembers].map((member) => ({
        member,
        operator: "equals",
        values: [String(tenantId)],
      })),
      ...[...statusMembers]
        .filter((member) => !existingMembers.has(member))
        .map((member) => ({
          member,
          operator: "equals",
          values: ["2", "4"],
        })),
    ];

    return query;
  },
};
