const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const TTL_SECONDS = 3600;
const encoder = new TextEncoder();
export class InvalidPage extends Error {}
type Cursor = {
  v: 1;
  scope: string;
  actor: string;
  limit: number;
  high: number;
  last: string | number;
  expires: number;
};
export type PageState = Cursor & { key: CryptoKey };
const invalid = (): never => {
  throw new InvalidPage("Invalid pagination request.");
};
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const decode = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return invalid();
  try {
    const bytes = Uint8Array.from(
      atob(value.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    if (encode(bytes) !== value) return invalid();
    return bytes;
  } catch {
    return invalid();
  }
};
export async function pageState(
  db: D1Database,
  url: URL,
  actor: string,
  scope: string,
  highSql: string,
  bindings: string[] = [],
): Promise<PageState> {
  for (const name of url.searchParams.keys())
    if (
      !["cursor", "limit"].includes(name) ||
      url.searchParams.getAll(name).length !== 1
    )
      invalid();
  const rawLimit = url.searchParams.get("limit");
  if (
    rawLimit !== null &&
    (!/^[1-9][0-9]?$/.test(rawLimit) || Number(rawLimit) > MAX_LIMIT)
  )
    invalid();
  const raw = url.searchParams.get("cursor");
  if (
    raw !== null &&
    (raw.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(raw))
  )
    invalid();
  const material = await db
    .prepare("SELECT secret FROM pagination_key WHERE id=1")
    .first<{ secret: string }>();
  if (!material) throw new Error("Pagination unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(material.secret.match(/../g)!, (x) => parseInt(x, 16)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const actorHash = encode(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        encoder.encode("deskpilot-pagination-v1\0" + actor),
      ),
    ),
  );
  const now = Math.floor(Date.now() / 1000);
  if (raw !== null) {
    const [payload, signature] = raw.split(".");
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        key,
        decode(signature),
        encoder.encode(payload),
      ))
    )
      invalid();
    let parsed: Cursor;
    try {
      parsed = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(decode(payload)),
      );
    } catch {
      return invalid();
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !==
        "actor,expires,high,last,limit,scope,v"
    )
      invalid();
    if (
      parsed.v !== 1 ||
      parsed.scope !== scope ||
      parsed.actor !== actorHash ||
      !Number.isSafeInteger(parsed.high) ||
      parsed.high < 0 ||
      !Number.isInteger(parsed.limit) ||
      parsed.limit < 1 ||
      parsed.limit > MAX_LIMIT ||
      (rawLimit !== null && Number(rawLimit) !== parsed.limit) ||
      !Number.isSafeInteger(parsed.expires) ||
      parsed.expires <= now ||
      parsed.expires > now + TTL_SECONDS
    )
      invalid();
    if (scope === "tickets") {
      if (
        typeof parsed.last !== "string" ||
        !/^INC-\d{1,40}$/.test(parsed.last)
      )
        invalid();
    } else if (
      !Number.isSafeInteger(parsed.last) ||
      typeof parsed.last !== "number" ||
      parsed.last < 1 ||
      parsed.last > parsed.high
    )
      invalid();
    return { ...parsed, key };
  }
  const high = await db
    .prepare(highSql)
    .bind(...bindings)
    .first<{ high: number }>();
  return {
    v: 1,
    scope,
    actor: actorHash,
    limit: Number(rawLimit ?? DEFAULT_LIMIT),
    high: high?.high ?? 0,
    last: scope === "tickets" ? "" : (high?.high ?? 0) + 1,
    expires: now + TTL_SECONDS,
    key,
  };
}
export async function pageResult<T>(
  state: PageState,
  rows: T[],
  position: (row: T) => string | number,
) {
  const items = rows.slice(0, state.limit);
  let nextCursor: string | null = null;
  if (rows.length > state.limit) {
    const { key, ...fields } = state;
    const payload = encode(
      encoder.encode(
        JSON.stringify({ ...fields, last: position(items[items.length - 1]) }),
      ),
    );
    nextCursor =
      payload +
      "." +
      encode(
        new Uint8Array(
          await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
        ),
      );
  }
  return { items, nextCursor };
}
