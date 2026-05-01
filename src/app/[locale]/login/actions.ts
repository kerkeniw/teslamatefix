"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { login, verifyCredentials } from "@/lib/auth";
import { clientIp, loginRateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  from: z.string().optional(),
});

export type LoginActionResult =
  | { error: string }
  | { error: undefined; redirectTo: string };

export async function loginAction(
  _prev: LoginActionResult | null,
  formData: FormData,
): Promise<LoginActionResult> {
  const parsed = LoginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    from: formData.get("from") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Identifiants invalides." };
  }

  const hdrs = await headers();
  const ip = clientIp({ headers: hdrs } as unknown as Request);
  const limit = loginRateLimiter.check(`login:${ip}`);
  if (!limit.ok) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    logger.warn({ event: "login.rate_limited", ip }, "login rate-limited");
    return {
      error: `Trop de tentatives. Réessayez dans ${seconds} seconde(s).`,
    };
  }

  const ok = await verifyCredentials(parsed.data.username, parsed.data.password);
  if (!ok) {
    logger.warn({ event: "login.failed", ip }, "login failed");
    return { error: "Identifiants invalides." };
  }

  await login();
  loginRateLimiter.reset(`login:${ip}`);
  logger.info({ event: "login.ok", user: parsed.data.username, ip }, "login ok");

  const safeFrom =
    parsed.data.from && parsed.data.from.startsWith("/")
      ? parsed.data.from
      : "/";
  redirect(safeFrom);
}
