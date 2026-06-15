import { getUserContext } from "@/lib/auth";
import { fetchCubeMeta, loadCubeQuery } from "@/lib/cube/client";
import {
  deriveChartProtocol,
  validateChartAgainstQuery,
} from "@/lib/cube/chart-protocol";
import {
  applyAccessPolicy,
  validateGeneratedQuery,
} from "@/lib/cube/query-policy";
import { queryRequestSchema } from "@/lib/cube/schemas";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = queryRequestSchema.parse(await request.json());
    const context = getUserContext();
    const meta = await fetchCubeMeta(context);
    const validatedQuery = validateGeneratedQuery(body.query, meta);
    const authorizedQuery = applyAccessPolicy(
      validatedQuery,
      context.tenantId
    );
    const result = await loadCubeQuery(authorizedQuery, context);

    const chart = body.chart
      ? validateChartAgainstQuery(body.chart, validatedQuery)
      : deriveChartProtocol(validatedQuery, meta, "查询结果");

    return Response.json({
      data: result.result.data ?? [],
      annotation: result.result.annotation ?? {},
      query: validatedQuery,
      sqlQuery: result.sqlQuery,
      sqlError: result.sqlError,
      updatedAt: result.updatedAt,
      chart,
      context: {
        tenantId: context.tenantId,
        role: context.role,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
