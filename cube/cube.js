module.exports = {
  scheduledRefreshContexts: async () => [
    {
      securityContext: {
        userId: "refresh-worker",
        tenantId: "tenant-a",
        role: "system",
      },
    },
    {
      securityContext: {
        userId: "refresh-worker",
        tenantId: "tenant-b",
        role: "system",
      },
    },
  ],
  queryRewrite: (query, { securityContext }) => {
    const tenantId = securityContext?.tenantId;

    if (!tenantId) {
      throw new Error("Missing tenantId in security context");
    }

    const filters = (query.filters || []).filter(
      (filter) => filter.member !== "Orders.tenantId"
    );

    query.filters = [
      ...filters,
      {
        member: "Orders.tenantId",
        operator: "equals",
        values: [String(tenantId)],
      },
    ];

    return query;
  },
};
