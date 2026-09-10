import { createRemoteJWKSet, jwtVerify } from "jose";
export type AuthConfig = { APP_ENV?: string; LOCAL_DEV_IDENTITY?: string; ACCESS_ISSUER?: string; ACCESS_AUDIENCE?: string; APP_ORIGIN?: string; ACCESS_PERMISSIONS?: string };
export type Identity = { actor: string; permissions: ("read" | "write")[] };
let jwks: { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;
export async function authorize(request: Request, env: AuthConfig): Promise<Identity | null> {
  const url = new URL(request.url);
  if (env.APP_ENV === "local" && env.LOCAL_DEV_IDENTITY === "enabled") {
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return null;
    if (["cf-access-jwt-assertion", "cf-access-authenticated-user-email", "x-user-email"].some((n) => request.headers.has(n))) return null;
    return { actor: "local-lab-technician", permissions: ["read", "write"] };
  }
  try {
    if (env.APP_ENV !== "production" || env.LOCAL_DEV_IDENTITY !== "disabled" || !env.ACCESS_ISSUER || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER) || !env.ACCESS_AUDIENCE?.trim() || !env.APP_ORIGIN?.startsWith("https://") || new URL(env.APP_ORIGIN).origin !== env.APP_ORIGIN || url.origin !== env.APP_ORIGIN) return null;
    const grants = JSON.parse(env.ACCESS_PERMISSIONS ?? "") as Record<string, ("read" | "write")[]>;
    if (!grants || Array.isArray(grants) || Object.values(grants).some((p) => !Array.isArray(p) || !p.includes("read") || p.some((x) => x !== "read" && x !== "write"))) return null;
    const token = request.headers.get("cf-access-jwt-assertion"); if (!token) return null;
    if (jwks?.issuer !== env.ACCESS_ISSUER) jwks = { issuer: env.ACCESS_ISSUER, keys: createRemoteJWKSet(new URL(`${env.ACCESS_ISSUER}/cdn-cgi/access/certs`), { timeoutDuration: 5000, cooldownDuration: 30000 }) };
    const { payload } = await jwtVerify(token, jwks.keys, { algorithms: ["RS256"], issuer: env.ACCESS_ISSUER, audience: env.ACCESS_AUDIENCE, requiredClaims: ["sub", "exp", "iat"] });
    if (typeof payload.sub !== "string" || !payload.sub.trim() || typeof payload.iat !== "number" || payload.iat > Date.now() / 1000) return null;
    return { actor: payload.sub, permissions: grants[payload.sub] ?? [] };
  } catch { return null; }
}
