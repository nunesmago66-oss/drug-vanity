import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { isValidCode, normalizeCode } from "./check-rules";
import { checkInviteOnDiscord } from "./invite-check.server";

const inputSchema = z.object({
  code: z
    .string()
    .max(64)
    .transform(normalizeCode)
    .refine(isValidCode, "Código inválido: use 2–3 caracteres (a-z, 0-9, -)."),
});

export const checkInvite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    // Only trust the address injected by Cloudflare at the edge. Forwarded
    // headers supplied by arbitrary clients are spoofable and would let a
    // caller rotate the per-visitor limiter key. On other hosts, deliberately
    // fall back to one shared key rather than trusting an unverified header.
    const clientKey = getRequestHeader("cf-connecting-ip")?.trim() || "unknown";
    return checkInviteOnDiscord(data.code, clientKey);
  });
