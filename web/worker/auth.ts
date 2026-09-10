import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthConfig = {
  APP_ENV?: string;
  LOCAL_DEV_IDENTITY?: string;
  AUTH0_ISSUER?: string;
  AUTH0_AUDIENCE?: string;
  APP_ORIGIN?: string;
  AUTH0_PERMISSIONS?: string;
};
export type Identity = { actor: string; permissions: ("read" | "write")[] };
let jwks:
  { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

export function isLocalDevelopment(request: Request, env: AuthConfig): boolean {
  const url = new URL(request.url);
  return (
    env.APP_ENV === "local" &&
    env.LOCAL_DEV_IDENTITY === "enabled" &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  );
}

export async function authorize(
  request: Request,
  env: AuthConfig,
): Promise<Identity | null> {
  const url = new URL(request.url);
  // Never derive an identity from browser-supplied identity headers.
  if (
    [
      "cf-access-jwt-assertion",
      "cf-access-authenticated-user-email",
      "x-user-email",
      "x-user-id",
    ].some((name) => request.headers.has(name))
  )
    return null;
  if (isLocalDevelopment(request, env)) {
    // A failed bearer token must never fall back to the development identity.
    if (request.headers.has("authorization")) return null;
    return { actor: "local-lab-technician", permissions: ["read", "write"] };
  }
  try {
    const local =
      env.APP_ENV === "local" &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (
      (!local && env.APP_ENV !== "production") ||
      env.LOCAL_DEV_IDENTITY !== "disabled" ||
      (!local && url.protocol !== "https:") ||
      env.APP_ORIGIN !== url.origin ||
      !env.AUTH0_ISSUER ||
      !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)?\.auth0\.com\/$/.test(
        env.AUTH0_ISSUER,
      ) ||
      env.AUTH0_AUDIENCE !== "https://deskpilot-api"
    )
      return null;
    const grants: unknown = JSON.parse(env.AUTH0_PERMISSIONS ?? "");
    if (
      !grants ||
      typeof grants !== "object" ||
      Array.isArray(grants) ||
      Object.values(grants).some(
        (p) =>
          !Array.isArray(p) ||
          p.some((x) => x !== "read" && x !== "write") ||
          (p.includes("write") && !p.includes("read")),
      )
    )
      return null;
    const match = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
    if (!match) return null;
    if (jwks?.issuer !== env.AUTH0_ISSUER) {
      jwks = {
        issuer: env.AUTH0_ISSUER,
        keys: createRemoteJWKSet(
          new URL(".well-known/jwks.json", env.AUTH0_ISSUER),
          {
            timeoutDuration: 5000,
            cooldownDuration: 30000,
            cacheMaxAge: 600000,
          },
        ),
      };
    }
    const { payload } = await jwtVerify(match[1], jwks.keys, {
      algorithms: ["RS256"],
      issuer: env.AUTH0_ISSUER,
      audience: env.AUTH0_AUDIENCE,
      requiredClaims: ["sub", "exp", "iat"],
    });
    if (
      typeof payload.sub !== "string" ||
      !payload.sub.trim() ||
      typeof payload.iat !== "number" ||
      !Number.isFinite(payload.iat) ||
      payload.iat < 0 ||
      payload.iat > Date.now() / 1000 ||
      typeof payload.exp !== "number" ||
      payload.exp <= payload.iat
    )
      return null;
    const permissions = Object.hasOwn(grants, payload.sub)
      ? (grants as Record<string, Identity["permissions"]>)[payload.sub]
      : [];
    return { actor: payload.sub, permissions };
  } catch {
    // Configuration, claim, signature, key rotation and JWKS failures all deny access.
    return null;
  }
}
