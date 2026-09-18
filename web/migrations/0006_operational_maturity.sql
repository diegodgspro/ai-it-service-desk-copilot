-- Additive: historical analyses begin here; no fabricated backfill.
CREATE TABLE analysis_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 analysis_id TEXT NOT NULL UNIQUE,
 ticket_id TEXT NOT NULL REFERENCES tickets(id),
 incident_version INTEGER NOT NULL CHECK(incident_version >= 2),
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1),
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 analysis_json TEXT NOT NULL CHECK(json_valid(analysis_json)),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 UNIQUE(ticket_id, incident_version)
);
CREATE INDEX analysis_history_ticket ON analysis_history(ticket_id,id);
CREATE TRIGGER analysis_history_no_update BEFORE UPDATE ON analysis_history BEGIN SELECT RAISE(ABORT,'Analysis history is append-only'); END;
CREATE TRIGGER analysis_history_no_delete BEFORE DELETE ON analysis_history BEGIN SELECT RAISE(ABORT,'Analysis history is append-only'); END;
-- Internal signing material, never returned by an API. No additional binding.
CREATE TABLE pagination_key (
 id INTEGER PRIMARY KEY CHECK(id=1),
 secret TEXT NOT NULL CHECK(length(secret)=64)
);
INSERT INTO pagination_key(id,secret) VALUES(1,lower(hex(randomblob(32))));
