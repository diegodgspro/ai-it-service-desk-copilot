export type AuthConfig = { APP_ENV?: string; LOCAL_DEV_IDENTITY?: string };
export function authorize(request: Request, env: AuthConfig): string | null {
  const url = new URL(request.url);
  // Never read identity from client headers. Local bypass requires explicit configuration
  // AND a loopback URL. Production currently denies everything, including forged JWTs.
  if (env.APP_ENV !== "local" || env.LOCAL_DEV_IDENTITY !== "enabled")
    return null;
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    return null;
  if (
    request.headers.has("cf-access-jwt-assertion") ||
    request.headers.has("cf-access-authenticated-user-email") ||
    request.headers.has("x-user-email")
  )
    return null;
  return "local-lab-technician";
}
