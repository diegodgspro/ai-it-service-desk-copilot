import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const tickets = await json("sample_data/tickets.json");
const profiles = await json("sample_data/profiles.json");
const articles = {};
for (const name of (await readdir(new URL("knowledge_base/", root))).sort()) {
  if (name.endsWith(".md"))
    articles[name.slice(0, -3)] = await readFile(
      new URL("knowledge_base/" + name, root),
      "utf8",
    );
}
await mkdir(new URL("../shared/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../shared/data.json", import.meta.url),
  JSON.stringify({ profiles, articles }, null, 2) + "\n",
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
await writeFile(
  new URL("../migrations/0002_synthetic_seed.sql", import.meta.url),
  "-- Generated synthetic fixtures; source: sample_data/tickets.json.\n" +
    tickets
      .map(
        (t) =>
          "INSERT INTO tickets (id,title,description,requester,impact,urgency,status) VALUES (" +
          [
            "id",
            "title",
            "description",
            "requester",
            "impact",
            "urgency",
            "status",
          ]
            .map((k) => quote(t[k]))
            .join(",") +
          ");",
      )
      .join("\n") +
    "\n",
);
