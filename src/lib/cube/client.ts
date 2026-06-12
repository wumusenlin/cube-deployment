import { createCubeToken, type UserContext } from "@/lib/auth";

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
  for (let attempt = 0; attempt <= MAX_CONTINUE_WAIT_RETRIES; attempt += 1) {
    const response = await cubeFetch("/load", context, {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    const payload = (await response.json()) as CubeLoadResponse;

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
