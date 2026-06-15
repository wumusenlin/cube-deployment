import { createCubeToken, type UserContext } from "@/lib/auth";
import { createHash } from "node:crypto";

import type {
  CubeLoadResponse,
  CubeMember,
  CubeQuery,
  PublicCube,
  PublicMeta,
} from "./types";

const DEFAULT_CUBE_URL = "http://localhost:4000/cubejs-api/v1";
const CONTINUE_WAIT_DELAY_MS = 800;
const MAX_CONTINUE_WAIT_RETRIES = 10;

function isCubeDebugEnabled(): boolean {
  return process.env.CUBE_DEBUG === "true";
}

function getQueryFingerprint(query: CubeQuery): string {
  return createHash("sha256")
    .update(JSON.stringify(query))
    .digest("hex")
    .slice(0, 12);
}

function getCubeApiUrl(): string {
  return (process.env.CUBE_API_URL || DEFAULT_CUBE_URL).replace(/\/$/, "");
}

async function cubeFetch(
  path: string,
  context: UserContext,
  init?: RequestInit
): Promise<Response> {
  const token = await createCubeToken(context);
  return fetch(`${getCubeApiUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function normalizeMember(member: Record<string, unknown>): CubeMember {
  const name = String(member.name ?? "");
  const shortTitle = String(member.shortTitle ?? name.split(".").at(-1) ?? name);
  return {
    name,
    title: String(member.title ?? shortTitle),
    shortTitle,
    type: String(member.type ?? "string"),
  };
}

export async function fetchCubeMeta(
  context: UserContext
): Promise<PublicMeta> {
  const response = await cubeFetch("/meta", context);
  const payload = (await response.json()) as {
    cubes?: Array<Record<string, unknown>>;
    error?: string;
  };

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Cube /meta 请求失败: ${response.status}`);
  }

  const cubes: PublicCube[] = (payload.cubes ?? []).map((cube) => ({
    name: String(cube.name ?? ""),
    title: String(cube.title ?? cube.name ?? ""),
    measures: Array.isArray(cube.measures)
      ? cube.measures.map((item) =>
          normalizeMember(item as Record<string, unknown>)
        )
      : [],
    dimensions: Array.isArray(cube.dimensions)
      ? cube.dimensions.map((item) =>
          normalizeMember(item as Record<string, unknown>)
        )
      : [],
  }));

  return { cubes };
}

export async function loadCubeQuery(
  query: CubeQuery,
  context: UserContext
): Promise<CubeLoadResponse> {
  const debug = isCubeDebugEnabled();
  const queryFingerprint = getQueryFingerprint(query);

  for (let attempt = 0; attempt <= MAX_CONTINUE_WAIT_RETRIES; attempt += 1) {
    const startedAt = Date.now();
    if (debug) {
      console.info(
        "[Cube] request",
        JSON.stringify(
          {
            queryFingerprint,
            attempt: attempt + 1,
            query,
          },
          null,
          2
        )
      );
    }

    const response = await cubeFetch("/load", context, {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    const payload = (await response.json()) as CubeLoadResponse;
    const durationMs = Date.now() - startedAt;

    if (debug) {
      console.info(
        "[Cube] response",
        JSON.stringify(
          {
            queryFingerprint,
            attempt: attempt + 1,
            status: response.status,
            durationMs,
            requestId:
              response.headers.get("x-request-id") ??
              response.headers.get("traceparent"),
            continueWait: payload.error === "Continue wait",
            error: payload.error,
            rowCount: payload.data?.length ?? 0,
          },
          null,
          2
        )
      );
    }

    if (payload.error === "Continue wait") {
      if (attempt === MAX_CONTINUE_WAIT_RETRIES) {
        throw new Error("Cube 查询超时，请稍后重试");
      }
      await new Promise((resolve) =>
        setTimeout(resolve, CONTINUE_WAIT_DELAY_MS)
      );
      continue;
    }

    if (!response.ok || payload.error) {
      throw new Error(payload.error || `Cube /load 请求失败: ${response.status}`);
    }

    return payload;
  }

  throw new Error("Cube 查询失败");
}
