CREATE TABLE tickets (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, requester TEXT NOT NULL,
 impact TEXT NOT NULL CHECK(impact IN ('Low','Medium','High')),
 urgency TEXT NOT NULL CHECK(urgency IN ('Low','Medium','High')),
 status TEXT NOT NULL DEFAULT 'Open', version INTEGER NOT NULL DEFAULT 1,
 analysis TEXT, analysis_id TEXT, decision TEXT
);
CREATE TABLE audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id),
 kind TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_ticket ON audit(ticket_id,id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
