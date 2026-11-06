import { createFileRoute } from "@tanstack/react-router";
import { isValidCode, normalizeCode } from "@/lib/vanity/check-rules";
import { checkInviteOnDiscord } from "@/lib/vanity/invite-check.server";

/**
 * GET /api/public/invites/{code}
 * The site's own backend asks Discord's official public route
 * (GET https://discord.com/api/v10/invites/{code}?with_counts=false) and
 * returns the evidence as JSON. Server-to-Discord traffic needs no browser
 * CORS. Public by design (no credentials, no user data); abuse is bounded by
 * the per-visitor/global limiter in server-limiter.ts.
 */

/** Origins allowed to call this endpoint from another site: the project's own Lovable hosts. */
export function allowedOrigin(origin: string | null, requestUrl: string): string | null {
  if (!origin) return null;
  try {
    const o = new URL(origin);
    if (o.origin === new URL(requestUrl).origin) return o.origin;
    if (o.protocol !== "https:") return null;
    if (/\.lovable\.app$|\.lovableproject\.com$/.test(o.hostname)) return o.origin;
  } catch {
    /* invalid origin */
  }
  return null;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request.headers.get("origin"), request.url);
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Request-Id",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });

export const Route = createFileRoute("/api/public/invites/$code")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      GET: async ({ request, params }) => {
        const code = normalizeCode(String(params.code ?? "").slice(0, 64));
        if (!isValidCode(code))
          return json(
            request,
            { error: "Código inválido: use 2–3 caracteres (a-z, 0-9, -)." },
            400,
          );
        const rawId = request.headers.get("x-request-id") ?? "";
        const requestId = /^[a-z0-9-]{4,40}$/i.test(rawId) ? rawId : undefined;
        // Only the address injected by Cloudflare is trusted for the per-visitor key.
        const clientKey = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
        try {
          return json(request, await checkInviteOnDiscord(code, clientKey, requestId));
        } catch (err) {
          console.error("invite endpoint failed", err);
          return json(request, { error: "Falha interna do servidor do site." }, 500);
        }
      },
    },
  },
});
