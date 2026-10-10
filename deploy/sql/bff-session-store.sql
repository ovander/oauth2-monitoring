-- bff-session-store.sql — the tables of the monitoring BFF's Postgres stores.
--
-- Needed only with BFF_SESSION_DSN set and BFF_SESSION_SCHEMA=managed (the
-- default). The BFF then runs no DDL: at start-up it checks that these tables
-- have the expected columns and that its role holds SELECT, INSERT, UPDATE and
-- DELETE on the session table and SELECT, INSERT and DELETE on the
-- pending-login table, and refuses to start otherwise (grant UPDATE on both,
-- see the GRANT below).
--
-- The statements are those backendkit (github.com/ovander/backendkit, bff
-- package) documents for its managed schema (WithPostgresManagedSchema,
-- WithPendingLoginManagedSchema), under the default table names. The names are
-- unqualified: run this in the schema the BFF role's search_path resolves to.
-- bff/stores_db_test.go applies this file and opens both stores on it, so a
-- drift from backendkit fails CI.
--
-- Run it once, as the role that will own the tables, against the BFF's own
-- database (see deploy/README.md):
--
--   psql "postgres://socrate_bff:…@127.0.0.1:5432/socrate_bff" -f deploy/sql/bff-session-store.sql
--
-- Both tables hold encrypted rows (AES-256-GCM under BFF_SESSION_KEY) and are
-- short-lived state: never restore them from a backup.

BEGIN;

-- Sessions (bff.PostgresStore). A logout keeps a tombstone (deleted_at) for an
-- hour so a request racing it cannot re-create the session.
CREATE TABLE bff_store_sessions (
	id         text        PRIMARY KEY,
	data       bytea       NOT NULL,
	created_at timestamptz NOT NULL,
	last_seen  timestamptz NOT NULL,
	deleted_at timestamptz
);
CREATE INDEX bff_store_sessions_last_seen_idx ON bff_store_sessions (last_seen);

-- Pending logins (bff.PostgresPendingLoginStore): PKCE verifier, login-binding
-- nonce and return path between /bff/login and /bff/callback, single use.
CREATE TABLE bff_store_pending_logins (
	state      text        PRIMARY KEY,
	data       bytea       NOT NULL,
	created_at timestamptz NOT NULL
);

-- When the BFF connects as a role that does not own the tables, grant it
-- exactly what it uses (replace <bff_role>). UPDATE on the pending-login table
-- is needed too: its INSERT … ON CONFLICT DO UPDATE requires it, even though
-- the start-up check only asks for SELECT, INSERT and DELETE there.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON bff_store_sessions, bff_store_pending_logins TO <bff_role>;

COMMIT;

-- After upgrading from a BFF that kept its own store (before backendkit
-- v1.25.0), drop its tables once the new BFF runs: bff_sessions may still
-- hold PLAINTEXT access and refresh tokens. Nothing reads them any more.
-- DROP TABLE IF EXISTS bff_sessions, bff_login_states;
