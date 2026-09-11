import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
let mf, db, script, persist;
const bindings = { APP_ENV: "local", LOCAL_DEV_IDENTITY: "enabled" };
const start = (vars = bindings, outboundService) =>
  new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      outboundService,
      script,
      compatibilityDate: "2026-09-09",
      bindings: vars,
      serviceBindings: { ASSETS: () => new Response("Public login shell") },
      d1Databases: { DB: "test-db" },
      resourcePersistencePath: persist,
    }),
  );
async function call(
  path = "",
  method = "GET",
  body,
  headers = {},
  runtime = mf,
  host = "http://localhost",
) {
  const response = await runtime.dispatchFetch(host + "/api/tickets" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: host } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
const get = async (id = "INC-1042") => (await call("/" + id)).data;
before(async () => {
  const out = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  script = out.outputFiles[0].text;
  persist = await mkdtemp(join(tmpdir(), "service-desk-test-"));
  mf = start();
  db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    // SQLite exec accepts multiple statements; collapse newlines for the D1 exec API.
    await db.exec(
      (await readFile("migrations/" + name, "utf8"))
        .replace(/^--.*$/gm, "")
        .replaceAll("\n", " "),
    );
  }
});
after(async () => {
  await mf?.dispose();
  await rm(persist, { recursive: true, force: true });
});
test("all nine priorities match the Python source matrix", async () => {
  const localPython = resolve("../.venv/Scripts/python.exe");
  const python = existsSync(localPython) ? localPython : "python";
  const source = execFileSync(
    python,
    [
      "-c",
      "import ast,json; t=ast.parse(open('../src/engine.py',encoding='utf-8').read()); print(json.dumps(next(ast.literal_eval(n.value) for n in t.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='MATRIX' for x in n.targets))))",
    ],
    { encoding: "utf8" },
  );
  const matrix = JSON.parse(source);
  for (const impact of ["Low", "Medium", "High"])
    for (const urgency of ["Low", "Medium", "High"]) {
      let { ticket } = await get();
      assert.equal(
        (
          await call("/" + ticket.id, "PATCH", {
            version: ticket.version,
            title: ticket.title,
            description: ticket.description,
            impact,
            urgency,
          })
        ).status,
        200,
      );
      ({ ticket } = await get());
      assert.equal(
        (
          await call("/" + ticket.id + "/analyze", "POST", {
            version: ticket.version,
          })
        ).status,
        200,
      );
      assert.equal(
        (await get()).ticket.analysis.priority,
        matrix[impact][urgency],
      );
    }
});
test("structured intake drafts, validation, confirmation and audit are deterministic", async () => {
  const request = async (path, body, headers = {}) => {
    const response = await mf.dispatchFetch(
      "http://localhost/api/intake" + path,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          ...headers,
        },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, data: await response.json() };
  };
  const input = {
    description:
      "Since 09:00 three users cannot connect to VPN. Error 812 appears, internet works and restart was tried.",
    requesterName: "Synthetic Requester",
  };
  const generated = await request("/draft", input);
  assert.equal(generated.status, 200);
  assert.equal(generated.data.category, "Network");
  assert.equal(generated.data.impact, "Medium");
  assert.equal(generated.data.calculatedPriority, "P4");
  assert.equal(generated.data.suspectedCauses[0].confirmed, false);
  const malformed = await request("/validate", {
    draft: { ...generated.data, calculatedPriority: "P0" },
  });
  assert.equal(malformed.status, 400);
  const unconfirmed = await request("/incidents", {
    draft: generated.data,
    confirmed: false,
  });
  assert.equal(unconfirmed.status, 400);
  generated.data.calculatedPriority = "P1";
  const created = await request("/incidents", {
    draft: generated.data,
    confirmed: true,
  });
  assert.equal(created.status, 201);
  const second = await request("/incidents", {
    draft: generated.data,
    confirmed: true,
  });
  assert.equal(second.status, 201);
  assert.notEqual(second.data.id, created.data.id);
  const record = await get(created.data.id);
  assert.equal(record.ticket.origin, "structured-intake");
  assert.equal(record.ticket.analysis, null);
  assert.equal(record.ticket.structuredIntake.calculatedPriority, "P4");
  assert.equal(record.audit[0].kind, "created");
  assert.equal(record.audit[0].actor, "local-lab-technician");
});
test("intake recognizes supported signals and asks only relevant missing questions", async () => {
  const cases = [
    ["My Active Directory account is locked", "Identity and access"],
    ["VPN will not connect", "Network"],
    ["Outlook email is unavailable", "Microsoft 365"],
    ["The printer queue is stuck", "Printing"],
    ["Laptop disk is full and slow", "Workstation"],
    ["ERP screen crashes", "Business application"],
    ["Access denied permission to folder", "Identity and access"],
    ["The software application crashes", "Software"],
  ];
  for (const [description, category] of cases) {
    const response = await mf.dispatchFetch(
      "http://localhost/api/intake/draft",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          description,
          requesterName: "Synthetic Requester",
        }),
      },
    );
    const draft = await response.json();
    assert.equal(response.status, 200);
    assert.equal(draft.category, category);
    assert.equal(
      new Set(draft.followUpQuestions).size,
      draft.followUpQuestions.length,
    );
    if (category !== "Network")
      assert.equal(
        draft.followUpQuestions.includes("Does general internet access work?"),
        false,
      );
  }
});
test("intake writes enforce authentication, permissions, origin, JSON and size", async () => {
  const response = await mf.dispatchFetch("http://localhost/api/intake/draft", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Origin: "http://localhost" },
    body: "{}",
  });
  assert.equal(response.status, 415);
  const unauth = start({
    APP_ENV: "production",
    LOCAL_DEV_IDENTITY: "disabled",
  });
  const denied = await unauth.dispatchFetch(
    "https://deskpilot.example/api/intake/draft",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://deskpilot.example",
      },
      body: "{}",
    },
  );
  assert.equal(denied.status, 401);
  await unauth.dispose();
  const huge = await mf.dispatchFetch("http://localhost/api/intake/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({
      description: "x".repeat(17000),
      requesterName: "Test",
    }),
  });
  assert.equal(huge.status, 413);
});
test("all eight synthetic incidents produce their authored runbooks without scores", async () => {
  const tickets = JSON.parse(
    await readFile("../sample_data/tickets.json", "utf8"),
  );
  const expected = [
    "Account lockout",
    "VPN",
    "DNS",
    "Printing",
    "Windows 11",
    "Microsoft 365",
    "Shared folder",
    "ERP",
  ];
  for (let i = 0; i < tickets.length; i++) {
    let { ticket } = await get(tickets[i].id);
    await call("/" + ticket.id + "/analyze", "POST", {
      version: ticket.version,
    });
    const a = (await get(ticket.id)).ticket.analysis;
    assert.equal(a.category, expected[i]);
    assert.ok(a.steps.length);
    assert.ok(a.evidence[0].content);
    assert.equal(a.mode, "Deterministic runbook matching");
    assert.equal(a.confidence, undefined);
    assert.equal(a.confidence_score, undefined);
  }
});
test("approval is versioned, single-use, server allowlisted and invalidated by edits and reanalysis", async () => {
  let { ticket } = await get("INC-1044");
  assert.equal(
    (
      await call("/" + ticket.id + "/decision", "POST", {
        version: ticket.version,
        analysisId: "stale",
        decision: "approved",
      })
    ).status,
    409,
  );
  const payload = {
    version: ticket.version,
    analysisId: ticket.analysis_id,
    decision: "approved",
    actionId: "run-shell",
    actor: "spoofed",
  };
  const results = await Promise.all([
    call("/" + ticket.id + "/decision", "POST", payload),
    call("/" + ticket.id + "/decision", "POST", payload),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  let record = await get(ticket.id);
  assert.equal(record.ticket.decision, "approved");
  const events = record.audit.filter((e) => e.kind === "simulation");
  assert.equal(events.length, 1);
  assert.equal(events[0].actor, "local-lab-technician");
  assert.match(events[0].detail, /Print Spooler/);
  assert.doesNotMatch(events[0].detail, /run-shell/);
  ticket = record.ticket;
  await call("/" + ticket.id + "/analyze", "POST", { version: ticket.version });
  record = await get(ticket.id);
  assert.equal(record.ticket.decision, null);
  assert.notEqual(record.ticket.analysis_id, ticket.analysis_id);
  ticket = record.ticket;
  await call("/" + ticket.id, "PATCH", {
    version: ticket.version,
    title: ticket.title,
    description: ticket.description + " Updated lab details.",
    impact: ticket.impact,
    urgency: ticket.urgency,
  });
  record = await get(ticket.id);
  assert.equal(record.ticket.analysis, null);
  assert.equal(record.ticket.analysis_id, null);
  assert.equal(record.ticket.decision, null);
  assert.equal(
    (
      await call("/" + ticket.id + "/decision", "POST", {
        version: record.ticket.version,
        analysisId: ticket.analysis_id,
        decision: "approved",
      })
    ).status,
    409,
  );
});
test("handover requires a current analysis, a note and explicit restoration confirmation", async () => {
  let { ticket } = await get("INC-1044");
  assert.equal(
    (
      await call("/" + ticket.id + "/handover", "POST", {
        version: ticket.version,
        status: "Resolved",
        note: "Lab restored",
        restored: true,
      })
    ).status,
    409,
  );
  await call("/" + ticket.id + "/analyze", "POST", { version: ticket.version });
  ({ ticket } = await get(ticket.id));
  for (const restored of [false, "true", 1]) {
    assert.equal(
      (
        await call("/" + ticket.id + "/handover", "POST", {
          version: ticket.version,
          analysisId: ticket.analysis_id,
          status: "Resolved",
          note: "Lab restored",
          restored,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await call("/" + ticket.id + "/handover", "POST", {
        version: ticket.version,
        analysisId: ticket.analysis_id,
        status: "Resolved",
        note: " ",
        restored: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/" + ticket.id + "/handover", "POST", {
        version: ticket.version,
        analysisId: ticket.analysis_id,
        status: "Resolved",
        note: "Lab user validated printing.",
        restored: true,
      })
    ).status,
    200,
  );
  let record = await get(ticket.id);
  assert.equal(record.ticket.status, "Resolved");
  assert.match(record.audit[0].detail, /restoration confirmed/);
  assert.equal(
    (
      await call("/" + ticket.id + "/analyze", "POST", {
        version: record.ticket.version,
      })
    ).status,
    409,
  );
});
test("D1 records and audit survive a Worker restart", async () => {
  const before = await get("INC-1044");
  await mf.dispose();
  mf = start();
  db = await mf.getD1Database("DB");
  assert.deepEqual(await get("INC-1044"), before);
  await assert.rejects(db.prepare("UPDATE audit SET actor='changed'").run());
  await assert.rejects(db.prepare("DELETE FROM audit").run());
});
test("unknown, multi-domain and security incidents require manual review with no action", async () => {
  for (const [title, description] of [
    ["Lunch request", "Please arrange lunch."],
    ["VPN and printer failure", "Two independent incidents."],
    ["Security incident", "Unexpected MFA prompts and suspicious sign-in."],
  ]) {
    let { ticket } = await get("INC-1041");
    await call("/" + ticket.id, "PATCH", {
      version: ticket.version,
      title,
      description,
      impact: "Low",
      urgency: "Low",
    });
    ({ ticket } = await get(ticket.id));
    await call("/" + ticket.id + "/analyze", "POST", {
      version: ticket.version,
    });
    const a = (await get(ticket.id)).ticket.analysis;
    assert.equal(a.action, null);
    assert.equal(a.escalation, true);
  }
});
test("authorization rejects production, missing flags, forged identities and non-loopback hosts", async () => {
  for (const vars of [
    {},
    { APP_ENV: "local" },
    { APP_ENV: "production", LOCAL_DEV_IDENTITY: "enabled" },
  ]) {
    const runtime = start(vars);
    try {
      assert.equal((await call("", "GET", undefined, {}, runtime)).status, 401);
      assert.equal(
        (
          await call(
            "",
            "GET",
            undefined,
            { "cf-access-jwt-assertion": "forged" },
            runtime,
          )
        ).status,
        401,
      );
      assert.deepEqual(
        await (
          await runtime.dispatchFetch("http://localhost/auth/local")
        ).json(),
        { enabled: false },
      );
      assert.equal(
        (await runtime.dispatchFetch("http://localhost/")).status,
        200,
      );
    } finally {
      await runtime.dispose();
    }
  }
  for (const name of [
    "cf-access-jwt-assertion",
    "cf-access-authenticated-user-email",
    "x-user-email",
  ])
    assert.equal(
      (await call("", "GET", undefined, { [name]: "spoofed" })).status,
      401,
    );
  assert.equal(
    (await call("", "GET", undefined, {}, mf, "https://production.example"))
      .status,
    401,
  );
  assert.equal(
    (await call("", "GET", undefined, {}, mf, "http://attacker.example"))
      .status,
    401,
  );
  assert.equal(
    (await call("", "GET", undefined, { Authorization: "Bearer malformed" }))
      .status,
    401,
  );
});
test("mutations reject cross-origin requests, malformed fields and stale writes", async () => {
  const { ticket } = await get();
  const body = { version: ticket.version };
  assert.equal(
    (
      await call("/" + ticket.id + "/analyze", "POST", body, {
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/" + ticket.id + "/analyze", "POST", body, {
        "Content-Type": "text/plain",
      })
    ).status,
    415,
  );
  assert.equal(
    (await call("/" + ticket.id + "/analyze", "POST", { version: 0 })).status,
    409,
  );
  assert.equal(
    (
      await call("/" + ticket.id, "PATCH", {
        ...body,
        title: "test",
        description: "test",
        impact: "Critical",
        urgency: "Low",
      })
    ).status,
    400,
  );
  assert.equal((await call("/INC-9999")).status, 404);
});

// Ephemeral RSA keys and synthetic tenant/subjects only; no network Auth0 calls.
test("Auth0 RS256 authentication and server-side operation grants in workerd/D1", async (t) => {
  const issuer = "https://fixture.us.auth0.com/";
  const origin = "https://deskpilot.example";
  const keys = await generateKeyPair("RS256", { extractable: true });
  const wrongKeys = await generateKeyPair("RS256");
  const publicKey = {
    ...(await exportJWK(keys.publicKey)),
    kid: "fixture-key",
    alg: "RS256",
    use: "sig",
  };
  const vars = {
    APP_ENV: "production",
    LOCAL_DEV_IDENTITY: "disabled",
    APP_ORIGIN: origin,
    AUTH0_ISSUER: issuer,
    AUTH0_AUDIENCE: "https://deskpilot-api",
    AUTH0_PERMISSIONS: JSON.stringify({
      "auth0|fixture-reader": ["read"],
      "auth0|fixture-writer": ["read", "write"],
    }),
  };
  const now = Math.floor(Date.now() / 1000);
  const sign = (claims = {}, key = keys.privateKey, header = {}) =>
    new SignJWT({
      iss: issuer,
      aud: vars.AUTH0_AUDIENCE,
      sub: "auth0|fixture-reader",
      iat: now,
      exp: now + 300,
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "fixture-key", ...header })
      .sign(key);
  let jwksCalls = 0;
  const outbound = (request) => {
    assert.equal(request.url, issuer + ".well-known/jwks.json");
    jwksCalls++;
    return Response.json({ keys: [publicKey] });
  };
  const runtime = start(vars, outbound);
  const request = async (
    token,
    method = "GET",
    body,
    headers = {},
    path = "",
  ) =>
    call(
      path,
      method,
      body,
      { ...(token ? { Authorization: "Bearer " + token } : {}), ...headers },
      runtime,
      origin,
    );
  try {
    await t.test(
      "valid reader can read but cannot write; writer can write with verified actor",
      async () => {
        const reader = await sign();
        assert.equal((await request(reader)).status, 200);
        assert.equal(
          (
            await request(
              reader,
              "POST",
              { version: 1 },
              {},
              "/INC-1042/analyze",
            )
          ).status,
          403,
        );
        const writer = await sign({ sub: "auth0|fixture-writer" });
        const {
          data: { ticket },
        } = await request(writer, "GET", undefined, {}, "/INC-1042");
        assert.equal(
          (
            await request(
              writer,
              "POST",
              { version: ticket.version, actor: "forged" },
              {},
              "/INC-1042/analyze",
            )
          ).status,
          200,
        );
        const record = await request(writer, "GET", undefined, {}, "/INC-1042");
        assert.equal(record.data.audit[0].actor, "auth0|fixture-writer");
        assert.equal(jwksCalls, 1, "trusted keys are cached per isolate");
      },
    );
    await t.test(
      "authentication and token scopes do not grant permissions",
      async () => {
        for (const sub of ["auth0|unlisted-fixture", "toString", "__proto__"])
          assert.equal(
            (
              await request(
                await sign({
                  sub,
                  permissions: ["read", "write"],
                  scope: "read write",
                }),
              )
            ).status,
            403,
          );
      },
    );
    for (const [name, claims] of [
      ["expired", { exp: now - 1 }],
      ["wrong issuer", { iss: "https://other.auth0.com/" }],
      ["wrong audience", { aud: "other-api" }],
      ["future iat", { iat: now + 600 }],
      ["missing iat", { iat: undefined }],
      ["non-numeric iat", { iat: "yesterday" }],
      ["negative iat", { iat: -1 }],
      ["missing exp", { exp: undefined }],
      ["missing sub", { sub: undefined }],
      ["empty sub", { sub: " " }],
      ["non-string sub", { sub: 123 }],
      ["not yet valid", { nbf: now + 600 }],
    ])
      await t.test("rejects " + name, async () =>
        assert.equal((await request(await sign(claims))).status, 401),
      );
    await t.test(
      "rejects bad signature, missing/malformed token, wrong algorithm and unknown key",
      async () => {
        for (const token of [
          undefined,
          "bad.token.value",
          await sign({}, wrongKeys.privateKey),
          await sign({}, keys.privateKey, { kid: "unknown-key" }),
          await new SignJWT({
            sub: "auth0|fixture-writer",
            iss: issuer,
            aud: vars.AUTH0_AUDIENCE,
            exp: now + 300,
            iat: now,
          })
            .setProtectedHeader({ alg: "HS256" })
            .sign(new Uint8Array(32)),
        ])
          assert.equal((await request(token)).status, 401);
        assert.equal(
          (
            await request(undefined, "GET", undefined, {
              Authorization: "Basic abc",
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      "rejects browser identity headers, foreign origin, non-JSON writes and alternate hostnames",
      async () => {
        const writer = await sign({ sub: "auth0|fixture-writer" });
        for (const name of [
          "cf-access-jwt-assertion",
          "cf-access-authenticated-user-email",
          "x-user-email",
          "x-user-id",
        ])
          assert.equal(
            (await request(writer, "GET", undefined, { [name]: "forged" }))
              .status,
            401,
          );
        assert.equal(
          (
            await request(
              writer,
              "POST",
              { version: 1 },
              { Origin: "https://attacker.invalid" },
              "/INC-1042/analyze",
            )
          ).status,
          403,
        );
        for (const value of ["text/plain", "application/json-bypass"])
          assert.equal(
            (
              await request(
                writer,
                "POST",
                { version: 1 },
                { "Content-Type": value },
                "/INC-1042/analyze",
              )
            ).status,
            415,
          );
        assert.equal(
          (
            await call(
              "",
              "GET",
              undefined,
              { Authorization: "Bearer " + writer },
              runtime,
              "https://preview.example",
            )
          ).status,
          401,
        );
        assert.deepEqual(
          await (await runtime.dispatchFetch(origin + "/auth/local")).json(),
          { enabled: false },
        );
      },
    );
  } finally {
    await runtime.dispose();
  }
  for (const [name, override] of [
    ["missing issuer", { AUTH0_ISSUER: undefined }],
    ["missing audience", { AUTH0_AUDIENCE: undefined }],
    ["missing origin", { APP_ORIGIN: undefined }],
    ["missing grants", { AUTH0_PERMISSIONS: undefined }],
    [
      "invalid grants",
      { AUTH0_PERMISSIONS: '{"auth0|fixture-reader":["admin"]}' },
    ],
    ["non-object grants", { AUTH0_PERMISSIONS: '"read"' }],
    [
      "write without read",
      { AUTH0_PERMISSIONS: '{"auth0|fixture-reader":["write"]}' },
    ],
    ["production local bypass", { LOCAL_DEV_IDENTITY: "enabled" }],
    ["missing bypass flag", { LOCAL_DEV_IDENTITY: undefined }],
    ["non-tenant issuer", { AUTH0_ISSUER: "https://attacker.invalid/" }],
  ])
    await t.test("fails closed for " + name, async () => {
      const config = Object.fromEntries(
        Object.entries({ ...vars, ...override }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      const instance = start(config, outbound);
      try {
        assert.equal(
          (
            await call(
              "",
              "GET",
              undefined,
              { Authorization: "Bearer " + (await sign()) },
              instance,
              origin,
            )
          ).status,
          401,
        );
      } finally {
        await instance.dispose();
      }
    });
  for (const [name, handler] of [
    ["unavailable JWKS", () => new Response("unavailable", { status: 503 })],
    ["malformed JWKS", () => Response.json({ keys: "invalid" })],
    ["empty JWKS", () => Response.json({ keys: [] })],
  ])
    await t.test("fails closed for " + name, async () => {
      const instance = start(vars, handler);
      try {
        assert.equal(
          (
            await call(
              "",
              "GET",
              undefined,
              { Authorization: "Bearer " + (await sign()) },
              instance,
              origin,
            )
          ).status,
          401,
        );
      } finally {
        await instance.dispose();
      }
    });
  await t.test(
    "local Auth0 mode validates tokens with development identity disabled",
    async () => {
      const instance = start(
        { ...vars, APP_ENV: "local", APP_ORIGIN: "http://127.0.0.1" },
        outbound,
      );
      try {
        assert.equal(
          (await call("", "GET", undefined, {}, instance, "http://127.0.0.1"))
            .status,
          401,
        );
        assert.equal(
          (
            await call(
              "",
              "GET",
              undefined,
              { Authorization: "Bearer " + (await sign()) },
              instance,
              "http://127.0.0.1",
            )
          ).status,
          200,
        );
      } finally {
        await instance.dispose();
      }
    },
  );
});
