export type Api = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
export class AuthenticationError extends Error {}
export class PermissionError extends Error {}

export function createApi(getToken?: () => Promise<string>): Api {
  return async <T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> => {
    // Restrict bearer tokens to this application's API, including on redirects.
    if (!/^\/[a-zA-Z0-9/-]*$/.test(path)) throw new Error("Invalid API path");
    const headers = new Headers();
    if (getToken) {
      let token: string;
      try {
        token = await getToken();
        if (!token) throw new Error();
      } catch {
        throw new AuthenticationError(
          "Unable to obtain an access token. Sign in again to continue.",
        );
      }
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch("/api" + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "omit",
      redirect: "error",
    });
    if (response.status === 401)
      throw new AuthenticationError(
        "Your session is not authorized. Sign in again or contact the workspace administrator.",
      );
    if (response.status === 403)
      throw new PermissionError(
        "You do not have permission for this operation. Contact the workspace administrator.",
      );
    const data = await response.json();
    if (!response.ok)
      throw new Error((data as { error?: string }).error || "Request failed");
    return data as T;
  };
}
