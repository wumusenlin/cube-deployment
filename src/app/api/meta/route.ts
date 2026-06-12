import { getUserContext } from "@/lib/auth";
import { fetchCubeMeta } from "@/lib/cube/client";
import { PROTECTED_MEMBERS } from "@/lib/cube/query-policy";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const context = getUserContext();
    const meta = await fetchCubeMeta(context);

    return Response.json({
      ...meta,
      cubes: meta.cubes.map((cube) => ({
        ...cube,
        dimensions: cube.dimensions.filter(
          (dimension) => !PROTECTED_MEMBERS.has(dimension.name)
        ),
      })),
      context: {
        tenantId: context.tenantId,
        role: context.role,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
