import { SignJWT } from "jose";

export interface UserContext {
  userId: string;
  tenantId: string;
  role: string;
}

export function getUserContext(): UserContext {
  return {
    userId: "demo-user",
    tenantId: process.env.DEMO_TENANT_ID || "tenant-a",
    role: process.env.DEMO_USER_ROLE || "analyst",
  };
}

export async function createCubeToken(context: UserContext): Promise<string> {
  const secret = process.env.CUBE_API_SECRET;
  if (!secret) throw new Error("CUBE_API_SECRET 未配置");

  return new SignJWT({
    userId: context.userId,
    tenantId: context.tenantId,
    role: context.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
}
