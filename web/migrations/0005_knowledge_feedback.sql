PRAGMA foreign_keys = ON;

CREATE TABLE knowledge_retrieval_events (
 retrieval_id TEXT PRIMARY KEY,
 actor_hash TEXT NOT NULL,
 incident_id TEXT REFERENCES tickets(id),
 incident_version INTEGER,
 analysis_context_id TEXT,
 retrieval_mode TEXT NOT NULL CHECK(retrieval_mode='lexical'),
 result_count INTEGER NOT NULL CHECK(result_count BETWEEN 0 AND 10),
 filter_count INTEGER NOT NULL CHECK(filter_count BETWEEN 0 AND 5),
 abstained INTEGER NOT NULL CHECK(abstained IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((incident_id IS NULL AND incident_version IS NULL) OR (incident_id IS NOT NULL AND incident_version >= 1))
);

CREATE TABLE knowledge_retrieval_items (
 retrieval_id TEXT NOT NULL REFERENCES knowledge_retrieval_events(retrieval_id),
 document_id TEXT NOT NULL REFERENCES knowledge_documents(document_id),
 chunk_id TEXT NOT NULL REFERENCES knowledge_chunks(chunk_id),
 PRIMARY KEY(retrieval_id,chunk_id)
);

CREATE TABLE knowledge_feedback (
 feedback_id TEXT PRIMARY KEY,
 client_event_id TEXT NOT NULL,
 actor_hash TEXT NOT NULL,
 retrieval_id TEXT NOT NULL REFERENCES knowledge_retrieval_events(retrieval_id),
 incident_id TEXT REFERENCES tickets(id),
 incident_version INTEGER,
 analysis_context_id TEXT,
 retrieval_mode TEXT NOT NULL CHECK(retrieval_mode='lexical'),
 document_id TEXT NOT NULL REFERENCES knowledge_documents(document_id),
 chunk_id TEXT NOT NULL REFERENCES knowledge_chunks(chunk_id),
 citation TEXT NOT NULL,
 document_version TEXT NOT NULL,
 document_hash TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('helpful','not_helpful')),
 reason TEXT NOT NULL CHECK(reason IN ('relevant','actionable','clear','irrelevant','wrong_service','outdated','insufficient_detail','duplicate','unsafe_or_inapplicable')),
 supersedes_feedback_id TEXT REFERENCES knowledge_feedback(feedback_id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(actor_hash,client_event_id),
 UNIQUE(supersedes_feedback_id),
 CHECK((outcome='helpful' AND reason IN ('relevant','actionable','clear')) OR (outcome='not_helpful' AND reason IN ('irrelevant','wrong_service','outdated','insufficient_detail','duplicate','unsafe_or_inapplicable'))),
 CHECK(feedback_id <> supersedes_feedback_id)
);

CREATE INDEX knowledge_feedback_retrieval ON knowledge_feedback(retrieval_id,chunk_id,created_at);
CREATE INDEX knowledge_feedback_created ON knowledge_feedback(created_at);
CREATE UNIQUE INDEX knowledge_feedback_single_root ON knowledge_feedback(actor_hash,retrieval_id,chunk_id) WHERE supersedes_feedback_id IS NULL;

CREATE TRIGGER knowledge_retrieval_events_no_update BEFORE UPDATE ON knowledge_retrieval_events BEGIN SELECT RAISE(ABORT,'Retrieval events are append-only'); END;
CREATE TRIGGER knowledge_retrieval_events_no_delete BEFORE DELETE ON knowledge_retrieval_events BEGIN SELECT RAISE(ABORT,'Retrieval events are append-only'); END;
CREATE TRIGGER knowledge_retrieval_items_no_update BEFORE UPDATE ON knowledge_retrieval_items BEGIN SELECT RAISE(ABORT,'Retrieval items are append-only'); END;
CREATE TRIGGER knowledge_retrieval_items_no_delete BEFORE DELETE ON knowledge_retrieval_items BEGIN SELECT RAISE(ABORT,'Retrieval items are append-only'); END;
CREATE TRIGGER knowledge_feedback_no_update BEFORE UPDATE ON knowledge_feedback BEGIN SELECT RAISE(ABORT,'Knowledge feedback is append-only'); END;
CREATE TRIGGER knowledge_feedback_no_delete BEFORE DELETE ON knowledge_feedback BEGIN SELECT RAISE(ABORT,'Knowledge feedback is append-only'); END;
