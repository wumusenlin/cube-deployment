import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { RequestValidationError } from "@/lib/errors";

export function jsonError(error: unknown, status = 500): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "请求参数不合法",
        details: error.issues.map((issue) => issue.message),
      },
      { status: 400 }
    );
  }

  if (error instanceof RequestValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "未知错误";
  return NextResponse.json({ error: message }, { status });
}
