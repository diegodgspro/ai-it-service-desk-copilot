PRAGMA foreign_keys = ON;
CREATE TABLE knowledge_documents (
 document_id TEXT PRIMARY KEY, title TEXT NOT NULL, source_type TEXT NOT NULL CHECK(source_type IN ('runbook','policy')),
 service TEXT NOT NULL, category TEXT NOT NULL, product TEXT NOT NULL, operating_system TEXT,
 language TEXT NOT NULL, approval_status TEXT NOT NULL CHECK(approval_status IN ('draft','approved','retired')),
 version TEXT NOT NULL, last_reviewed TEXT NOT NULL, tags_json TEXT NOT NULL, classification TEXT NOT NULL CHECK(classification='synthetic-demo'),
 source_path TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL, ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE knowledge_chunks (
 chunk_pk INTEGER PRIMARY KEY AUTOINCREMENT, chunk_id TEXT NOT NULL UNIQUE,
 document_id TEXT NOT NULL REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL CHECK(ordinal >= 0), heading TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL,
 UNIQUE(document_id, ordinal)
);
CREATE INDEX knowledge_documents_filters ON knowledge_documents(approval_status,language,service,category,product);
CREATE INDEX knowledge_chunks_document ON knowledge_chunks(document_id,ordinal);
CREATE VIRTUAL TABLE knowledge_fts USING fts5(title,heading,content,tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
 INSERT INTO knowledge_fts(rowid,title,heading,content) SELECT new.chunk_pk,d.title,new.heading,new.content FROM knowledge_documents d WHERE d.document_id=new.document_id;
END;
CREATE TRIGGER knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
 DELETE FROM knowledge_fts WHERE rowid=old.chunk_pk;
END;
CREATE TRIGGER knowledge_chunks_au AFTER UPDATE ON knowledge_chunks BEGIN
 DELETE FROM knowledge_fts WHERE rowid=old.chunk_pk;
 INSERT INTO knowledge_fts(rowid,title,heading,content) SELECT new.chunk_pk,d.title,new.heading,new.content FROM knowledge_documents d WHERE d.document_id=new.document_id;
END;
