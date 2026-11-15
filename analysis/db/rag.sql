-- Document search (RAG) of the Ember agent (web-hackathon/rag.js): one row per section of web-hackathon/knowledge/*.md
-- with its OpenAI embedding. The website re-indexes on start: it inserts new sections (by content hash) and deletes
-- the ones that no longer exist. Vectors are plain real[]; the similarity search runs in the server, so pgvector is
-- not needed. Idempotent; also part of schema.sql.
CREATE TABLE IF NOT EXISTS rag_chunks (
    hash        text PRIMARY KEY,          -- sha256 of model + embedded text
    source      text        NOT NULL,      -- file name in knowledge/
    section     text        NOT NULL,
    content     text        NOT NULL,
    model       text        NOT NULL,      -- embedding model, e.g. text-embedding-3-small
    embedding   real[]      NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a11_web') THEN CREATE ROLE a11_web NOLOGIN; END IF;
END $$;
GRANT SELECT, INSERT, DELETE ON rag_chunks TO a11_web;
