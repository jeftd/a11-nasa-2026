-- Memory of the Ember agent (web-hackathon/chat-agent.js): one row per chat message, grouped by the browser's sessionId.
-- msg is {r: "human"|"ai"|"tool", c: text, tc: [tool calls], id: tool_call_id}. Idempotent; also part of schema.sql.
-- The website role a11_web may only read and append; the analyst role does not see the conversations.
CREATE TABLE IF NOT EXISTS chat_messages (
    id          bigserial PRIMARY KEY,
    session_id  text        NOT NULL,
    msg         jsonb       NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, id);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a11_web') THEN CREATE ROLE a11_web NOLOGIN; END IF;
END $$;
GRANT SELECT, INSERT ON chat_messages TO a11_web;
GRANT USAGE ON SEQUENCE chat_messages_id_seq TO a11_web;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a11_analyst') THEN REVOKE ALL ON chat_messages FROM a11_analyst; END IF;
END $$;
-- Housekeeping (optional, e.g. monthly): DELETE FROM chat_messages WHERE created_at < now() - interval '30 days';
