import { getUserContext } from "@/lib/auth";
import { fetchCubeMeta } from "@/lib/cube/client";
import { llmRequestSchema } from "@/lib/cube/schemas";
import { jsonError } from "@/lib/http";
import { generateAnalytics } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const { prompt } = llmRequestSchema.parse(await request.json());
    const context = getUserContext();
    const meta = await fetchCubeMeta(context);
    const generated = await generateAnalytics(prompt, meta);

    return Response.json(generated);
  } catch (error) {
    return jsonError(error);
  }
}
