import { getUserContext } from "@/lib/auth";
import { fetchCubeMeta } from "@/lib/cube/client";

export async function GET() {
  try {
    const meta = await fetchCubeMeta(getUserContext());
    return Response.json({
      status: "ok",
      cubeCount: meta.cubes.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return Response.json({ status: "degraded", error: message }, { status: 503 });
  }
}
