package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// These tests run backendkit's Postgres stores against BFF_TEST_DATABASE_URL,
// a scratch database the test may write to (CI provides one). Each test gets
// a fresh, empty schema, so the tables never leak between tests.

// sessionStoreSQL is the file operators run for the managed schema.
const sessionStoreSQL = "../deploy/sql/bff-session-store.sql"

// testKey is a fixed AES-256 key for the tests (not a secret).
var testKey = []byte("0123456789abcdef0123456789abcdef")

func testDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("BFF_TEST_DATABASE_URL")
	if dsn == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("BFF_TEST_DATABASE_URL must be set in CI: the Postgres store tests may not skip there")
		}
		t.Skip("BFF_TEST_DATABASE_URL not set: the Postgres store tests need a scratch database")
	}
	return dsn
}

func randomSuffix(t *testing.T) string {
	t.Helper()
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(b)
}

// adminDB opens the scratch database as the DSN's own (owner) role.
func adminDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("pgx", testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// freshSchema creates an empty schema, dropped with everything in it at the
// end of the test.
func freshSchema(t *testing.T, admin *sql.DB) string {
	t.Helper()
	schema := "bff_test_" + randomSuffix(t)
	if _, err := admin.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() { _, _ = admin.Exec(`DROP SCHEMA ` + schema + ` CASCADE`) })
	return schema
}

// schemaDB opens a *sql.DB whose search_path is schema, connected as role
// when it is not empty (the DSN's role must be allowed to SET ROLE to it).
func schemaDB(t *testing.T, schema, role string) *sql.DB {
	t.Helper()
	cfg, err := pgx.ParseConfig(testDSN(t))
	if err != nil {
		t.Fatal(err)
	}
	cfg.RuntimeParams["search_path"] = schema
	if role != "" {
		cfg.RuntimeParams["role"] = role
	}
	db := stdlib.OpenDB(*cfg)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// applySessionStoreSQL runs deploy/sql/bff-session-store.sql on db.
func applySessionStoreSQL(t *testing.T, db *sql.DB) {
	t.Helper()
	ddl, err := os.ReadFile(sessionStoreSQL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(ddl)); err != nil {
		t.Fatalf("apply %s: %v", sessionStoreSQL, err)
	}
}

func mustOpenPostgresStores(t *testing.T, db *sql.DB, schema string) *stores {
	t.Helper()
	st, err := openPostgresStores(context.Background(), db, testKey, 30*time.Minute, 8*time.Hour, schema)
	if err != nil {
		t.Fatalf("openPostgresStores(%s): %v", schema, err)
	}
	return st
}

func testSession(id string) *bff.Session {
	ts := &socrate.TokenSet{AccessToken: "at-" + id, RefreshToken: "rt-secret-" + id, IDToken: "id", ExpiresIn: 3600}
	return bff.NewSession(id, "csrf-"+id, ts, bff.UserInfo{Sub: "42", Roles: []string{"monitor_admin"}}, time.Now())
}

// The managed schema works with exactly the SQL file operators run: both
// stores open (backendkit checks the columns and the grants) and round-trip.
// This is the drift guard between deploy/sql and backendkit.
func TestSessionStoreSQL_ManagedSchemaOpensBothStores(t *testing.T) {
	admin := adminDB(t)
	schema := freshSchema(t, admin)
	db := schemaDB(t, schema, "")
	applySessionStoreSQL(t, db)

	st := mustOpenPostgresStores(t, db, SessionSchemaManaged)
	ctx := context.Background()

	st.sessions.Put(testSession("sid-1"))
	got, ok := st.sessions.Get("sid-1")
	if !ok || got.RefreshToken() != "rt-secret-sid-1" || got.CSRF() != "csrf-sid-1" || got.User().Sub != "42" {
		t.Fatalf("session round-trip = %v, %v", got, ok)
	}
	// Encrypted at rest: the row does not carry the token in clear.
	var data []byte
	if err := db.QueryRow(`SELECT data FROM bff_store_sessions WHERE id = 'sid-1'`).Scan(&data); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "rt-secret-sid-1") {
		t.Fatal("the session row holds the refresh token in plaintext")
	}

	in := bff.PendingLogin{Verifier: "v", Nonce: "n", ReturnTo: "/alerts"}
	if err := st.pending.Put(ctx, "state-1", in); err != nil {
		t.Fatalf("pending Put: %v", err)
	}
	p, ok := st.pending.Take(ctx, "state-1")
	if !ok || p.Verifier != "v" || p.Nonce != "n" || p.ReturnTo != "/alerts" {
		t.Fatalf("pending Take = %+v, %v", p, ok)
	}
	if _, ok := st.pending.Take(ctx, "state-1"); ok {
		t.Fatal("a pending login must be single-use")
	}
}

// The file's commented GRANT is enough for a role that does not own the
// tables: both stores open with the managed schema and every operation the
// BFF performs succeeds (pending Put is an upsert, so it needs UPDATE too).
func TestSessionStoreSQL_GrantSufficesForANonOwnerRole(t *testing.T) {
	admin := adminDB(t)
	schema := freshSchema(t, admin)
	applySessionStoreSQL(t, schemaDB(t, schema, ""))

	ddl, err := os.ReadFile(sessionStoreSQL)
	if err != nil {
		t.Fatal(err)
	}
	grant := regexp.MustCompile(`(?m)^-- (GRANT .+ TO <bff_role>;)$`).FindSubmatch(ddl)
	if grant == nil {
		t.Fatalf("%s has no commented GRANT … TO <bff_role>; line", sessionStoreSQL)
	}
	role := "bff_test_role_" + randomSuffix(t)
	if _, err := admin.Exec(`CREATE ROLE ` + role + ` NOLOGIN`); err != nil {
		t.Fatalf("create role (the test DSN's role needs CREATEROLE): %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(`DROP OWNED BY ` + role)
		_, _ = admin.Exec(`DROP ROLE ` + role)
	})
	for _, stmt := range []string{
		`GRANT USAGE ON SCHEMA ` + schema + ` TO ` + role,
		`SET search_path TO ` + schema + `; ` + strings.ReplaceAll(string(grant[1]), "<bff_role>", role),
	} {
		if _, err := admin.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}

	db := schemaDB(t, schema, role)
	var current string
	if err := db.QueryRow(`SELECT current_user`).Scan(&current); err != nil || current != role {
		t.Fatalf("connected as %q (%v), want %q", current, err, role)
	}
	st := mustOpenPostgresStores(t, db, SessionSchemaManaged)
	before := st.sessionErrors.Load()

	ctx := context.Background()
	if err := st.pending.Put(ctx, "state-r", bff.PendingLogin{Verifier: "v", Nonce: "n", ReturnTo: "/"}); err != nil {
		t.Fatalf("pending Put as %s: %v", role, err)
	}
	if _, ok := st.pending.Take(ctx, "state-r"); !ok {
		t.Fatalf("pending Take as %s failed", role)
	}
	st.sessions.Put(testSession("sid-r"))
	if _, ok := st.sessions.Get("sid-r"); !ok {
		t.Fatalf("session Get as %s failed", role)
	}
	if err := st.deleteSession("sid-r"); err != nil {
		t.Fatalf("session delete as %s: %v", role, err)
	}
	st.sweep(ctx)
	if n := st.sessionErrors.Load() - before; n != 0 {
		t.Fatalf("%d session-store statement(s) failed as %s", n, role)
	}
}

// Managed means the BFF runs no DDL: without the tables it refuses to start.
func TestPostgresStores_ManagedSchemaRefusesMissingTables(t *testing.T) {
	schema := freshSchema(t, adminDB(t))
	db := schemaDB(t, schema, "")
	if _, err := openPostgresStores(context.Background(), db, testKey, time.Hour, time.Hour, SessionSchemaManaged); err == nil {
		t.Fatal("the managed schema opened without its tables")
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM pg_tables WHERE schemaname = $1`, schema).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("the managed schema created %d table(s)", n)
	}
}

// Auto (the explicit opt-in) creates the tables itself, and what it creates
// passes the managed check too.
func TestPostgresStores_AutoSchemaCreatesTheTables(t *testing.T) {
	schema := freshSchema(t, adminDB(t))
	db := schemaDB(t, schema, "")
	mustOpenPostgresStores(t, db, SessionSchemaAuto)
	mustOpenPostgresStores(t, db, SessionSchemaManaged)
}

// The DSN path of openStores: the BFF's real start-up, with a URL DSN whose
// search_path points at a schema prepared with the SQL file.
func TestOpenStores_PostgresFromConfig(t *testing.T) {
	dsn := testDSN(t)
	u, err := url.Parse(dsn)
	if err != nil || u.Scheme == "" {
		t.Skip("BFF_TEST_DATABASE_URL is not a URL; this test adds search_path as a URL parameter")
	}
	schema := freshSchema(t, adminDB(t))
	applySessionStoreSQL(t, schemaDB(t, schema, ""))
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()

	cfg := &Config{SessionDSN: u.String(), sessionKey: testKey, SessionSchema: SessionSchemaManaged,
		SessionIdle: time.Hour, SessionAbsolute: time.Hour}
	st, err := openStores(context.Background(), cfg)
	if err != nil {
		t.Fatalf("openStores: %v", err)
	}
	defer func() { _ = st.Close() }()
	if _, ok := st.sessions.(*bff.PostgresStore); !ok {
		t.Fatalf("sessions = %T, want *bff.PostgresStore", st.sessions)
	}
	if _, ok := st.pending.(*bff.PostgresPendingLoginStore); !ok {
		t.Fatalf("pending = %T, want *bff.PostgresPendingLoginStore", st.pending)
	}

	cfg.sessionKey = testKey[:16]
	if _, err := openStores(context.Background(), cfg); err == nil {
		t.Fatal("openStores accepted a 16-byte key")
	}
}

// P3-29 on Postgres: Delete leaves a tombstone, so a write-back racing a
// logout cannot re-create the session.
func TestPostgresStores_PutNeverResurrectsADeletedSession(t *testing.T) {
	schema := freshSchema(t, adminDB(t))
	db := schemaDB(t, schema, "")
	applySessionStoreSQL(t, db)
	st := mustOpenPostgresStores(t, db, SessionSchemaManaged)

	sess := testSession("sid-z")
	st.sessions.Put(sess)
	if err := st.deleteSession("sid-z"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	sess.Touch(time.Now())
	st.sessions.Put(sess)
	if _, ok := st.sessions.Get("sid-z"); ok {
		t.Fatal("Put re-created a deleted session")
	}
}

// pgHarness is the phase-2 harness on backendkit's Postgres stores (managed
// schema, the SQL file).
func pgHarness(t *testing.T) (*phase2Harness, *sql.DB) {
	t.Helper()
	schema := freshSchema(t, adminDB(t))
	db := schemaDB(t, schema, "")
	applySessionStoreSQL(t, db)
	return newPhase2HarnessWithStores(t, mustOpenPostgresStores(t, db, SessionSchemaManaged)), db
}

// The whole flow on Postgres: login → callback (single use) → session →
// proxy → logout, which tombstones the row.
func TestPostgres_FullFlowAndLogout(t *testing.T) {
	h, db := pgHarness(t)

	login := h.do(http.MethodGet, "/bff/login?return_to=/alerts", nil)
	if login.Code != http.StatusFound {
		t.Fatalf("login = %d", login.Code)
	}
	loc, _ := url.Parse(login.Header().Get("Location"))
	state := loc.Query().Get("state")
	lc := loginCookie(login)

	cb := h.do(http.MethodGet, "/bff/callback?state="+state+"&code=c", lc)
	if cb.Code != http.StatusFound || cb.Header().Get("Location") != "/alerts" {
		t.Fatalf("callback = %d → %q", cb.Code, cb.Header().Get("Location"))
	}
	cookie := sessionCookie(cb)
	if cookie == nil {
		t.Fatal("no session cookie")
	}
	// Single use: the same callback again is refused.
	if again := h.do(http.MethodGet, "/bff/callback?state="+state+"&code=c", lc); again.Code != http.StatusBadRequest {
		t.Fatalf("replayed callback = %d, want 400", again.Code)
	}

	sessRec := h.do(http.MethodGet, "/bff/session", cookie)
	if sessRec.Code != http.StatusOK || !strings.Contains(sessRec.Body.String(), `"authenticated":true`) {
		t.Fatalf("session = %d %s", sessRec.Code, sessRec.Body.String())
	}
	if api := h.do(http.MethodGet, "/api/admin/x", cookie); api.Code != http.StatusOK || h.adminAuth != "Bearer "+h.accessToken {
		t.Fatalf("proxy = %d, auth %q", api.Code, h.adminAuth)
	}

	sess, _ := h.srv.store.Get(cookie.Value)
	if rec := h.post("/bff/logout", cookie, sess.CSRF(), ""); rec.Code != http.StatusNoContent {
		t.Fatalf("logout = %d %s", rec.Code, rec.Body.String())
	}
	var deleted bool
	if err := db.QueryRow(`SELECT deleted_at IS NOT NULL AND length(data) = 0 FROM bff_store_sessions WHERE id = $1`,
		cookie.Value).Scan(&deleted); err != nil || !deleted {
		t.Fatalf("session row not tombstoned after logout (%v, %v)", deleted, err)
	}
	if api := h.do(http.MethodGet, "/api/admin/x", cookie); api.Code != http.StatusUnauthorized {
		t.Fatalf("logged-out session still proxies: %d", api.Code)
	}
}

// P3-28 on Postgres: when the delete statement fails, logout says so (500
// logout_incomplete) and still clears the cookie.
func TestPostgres_LogoutReportsAFailedDelete(t *testing.T) {
	h, db := pgHarness(t)
	cookie, csrf := h.login(t)

	// From now on the store's Delete (the only statement that sets
	// deleted_at) fails.
	for _, stmt := range []string{
		`CREATE FUNCTION bff_test_refuse_delete() RETURNS trigger LANGUAGE plpgsql AS
			$$ BEGIN RAISE EXCEPTION 'delete refused by test'; END $$`,
		`CREATE TRIGGER bff_test_refuse_delete BEFORE UPDATE ON bff_store_sessions
			FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL) EXECUTE FUNCTION bff_test_refuse_delete()`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}

	rec := h.post("/bff/logout", cookie, csrf, "")
	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), "logout_incomplete") {
		t.Fatalf("logout with a failing delete = %d %q, want 500 logout_incomplete", rec.Code, rec.Body.String())
	}
	if sessionCookie(rec) != nil {
		t.Fatal("session cookie re-issued on a failed logout")
	}
	// The report is truthful: the session row really is still live.
	if _, ok := h.srv.store.Get(cookie.Value); !ok {
		t.Fatal("expected the session to survive the failed delete")
	}
}

// A pending-login store that cannot write answers 503 and never sends the
// browser to Socrate; the callback for an unknown state stays refused.
func TestPostgres_LoginAnswers503WhenThePendingStoreFails(t *testing.T) {
	h, db := pgHarness(t)
	if _, err := db.Exec(`DROP TABLE bff_store_pending_logins`); err != nil {
		t.Fatal(err)
	}
	rec := h.do(http.MethodGet, "/bff/login", nil)
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Location") != "" {
		t.Fatalf("login with a failing pending store = %d → %q, want 503 and no redirect", rec.Code, rec.Header().Get("Location"))
	}
	if cb := h.do(http.MethodGet, "/bff/callback?state=x&code=c", nil); cb.Code != http.StatusBadRequest {
		t.Fatalf("callback with a failing pending store = %d, want 400", cb.Code)
	}
}
