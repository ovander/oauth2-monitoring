package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// tokenResponse is Socrate's /oauth/token reply (superset of the standard).
type tokenResponse struct {
	AccessToken  string            `json:"access_token"`
	RefreshToken string            `json:"refresh_token"`
	IDToken      string            `json:"id_token"`
	TokenType    string            `json:"token_type"`
	ExpiresIn    int               `json:"expires_in"`
	Roles        []string          `json:"roles"`
	AppRoles     map[string]string `json:"app_roles"`
	Error        string            `json:"error"`
	ErrorDesc    string            `json:"error_description"`
}

// oauthClient performs the back-channel token calls against the OAuth upstream.
type oauthClient struct {
	cfg  *Config
	http *http.Client
}

func newOAuthClient(cfg *Config) *oauthClient {
	return &oauthClient{cfg: cfg, http: &http.Client{Timeout: 10 * time.Second}}
}

// authorizeURL builds the browser-facing authorization redirect (public URL).
func (o *oauthClient) authorizeURL(state, challenge string) string {
	q := url.Values{
		"response_type":         {"code"},
		"client_id":             {o.cfg.ClientID},
		"redirect_uri":          {o.cfg.RedirectURI()},
		"scope":                 {o.cfg.Scopes},
		"state":                 {state},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
	}
	return strings.TrimRight(o.cfg.OAuthPublicURL, "/") + "/oauth/authorize?" + q.Encode()
}

func (o *oauthClient) exchange(ctx context.Context, code, verifier string) (*tokenResponse, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {o.cfg.RedirectURI()},
		"client_id":     {o.cfg.ClientID},
		"code_verifier": {verifier},
	}
	return o.token(ctx, form)
}

func (o *oauthClient) refresh(ctx context.Context, refreshToken string) (*tokenResponse, error) {
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {o.cfg.ClientID},
	}
	return o.token(ctx, form)
}

// tokenRefresherAdapter adapts oauthClient.refresh to bff.TokenRefresher, so
// bff.Gateway can proactively refresh a session's access token without this
// package re-implementing that logic.
type tokenRefresherAdapter struct{ c *oauthClient }

func (a tokenRefresherAdapter) RefreshToken(ctx context.Context, refreshToken string) (*socrate.TokenSet, error) {
	tr, err := a.c.refresh(ctx, refreshToken)
	if err != nil {
		return nil, err
	}
	return &socrate.TokenSet{
		AccessToken: tr.AccessToken, RefreshToken: tr.RefreshToken, IDToken: tr.IDToken,
		ExpiresIn: tr.ExpiresIn, TokenType: tr.TokenType, Roles: tr.Roles, AppRoles: tr.AppRoles,
	}, nil
}

func (o *oauthClient) token(ctx context.Context, form url.Values) (*tokenResponse, error) {
	if o.cfg.ClientSecret != "" {
		form.Set("client_secret", o.cfg.ClientSecret)
	}
	endpoint := strings.TrimRight(o.cfg.OAuthUpstream, "/") + "/oauth/token"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := o.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var tr tokenResponse
	_ = json.Unmarshal(body, &tr) // an error body is reported through OAuthError below
	if resp.StatusCode != http.StatusOK {
		// Typed so bff.IsFatalRefreshError can tell a rejected grant
		// (invalid_grant: the session is dead) from a token-endpoint outage
		// (5xx: keep the session, answer 502).
		oe := &socrate.OAuthError{StatusCode: resp.StatusCode, Code: tr.Error, Description: tr.ErrorDesc}
		if oe.Code == "" {
			oe.Description = strings.TrimSpace(string(body))
		}
		return nil, oe
	}
	if tr.AccessToken == "" {
		return nil, fmt.Errorf("token response missing access_token")
	}
	return &tr, nil
}

// revoke best-effort revokes a token at the issuer's RFC 7009 /oauth/revoke
// endpoint using the BFF's confidential client credentials. An empty token is a
// no-op. token_type_hint is advisory. The caller logs and continues on error.
func (o *oauthClient) revoke(ctx context.Context, token, hint string) error {
	if token == "" {
		return nil
	}
	form := url.Values{
		"token":     {token},
		"client_id": {o.cfg.ClientID},
	}
	if hint != "" {
		form.Set("token_type_hint", hint)
	}
	if o.cfg.ClientSecret != "" {
		form.Set("client_secret", o.cfg.ClientSecret)
	}
	endpoint := strings.TrimRight(o.cfg.OAuthUpstream, "/") + "/oauth/revoke"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := o.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("revoke endpoint: %s", resp.Status)
	}
	return nil
}

// userFromToken builds the session's UserInfo from the token response: identity
// claims are read from the (unverified) access-token payload — the token came
// from our own OAuth server over loopback and the security boundary is the
// session cookie, not this decode — and roles are merged from the response body.
func userFromToken(clientID string, tr *tokenResponse) bff.UserInfo {
	u := bff.UserInfo{Roles: mergeRoles(clientID, tr)}
	claims := decodeJWTClaims(tr.AccessToken)
	if v, ok := claims["sub"].(string); ok {
		u.Sub = v
	}
	if v, ok := claims["email"].(string); ok {
		u.Email = v
	}
	if v, ok := claims["name"].(string); ok {
		u.Name = v
	} else if v, ok := claims["preferred_username"].(string); ok {
		u.Name = v
	}
	return u
}

func mergeRoles(clientID string, tr *tokenResponse) []string {
	set := map[string]struct{}{}
	out := []string{}
	add := func(r string) {
		if r == "" {
			return
		}
		if _, dup := set[r]; !dup {
			set[r] = struct{}{}
			out = append(out, r)
		}
	}
	for _, r := range tr.Roles {
		add(r)
	}
	for _, r := range jwtRoles(tr.AccessToken) {
		add(r)
	}
	if r, ok := tr.AppRoles[clientID]; ok {
		add(r)
	}
	return out
}

func jwtRoles(token string) []string {
	claims := decodeJWTClaims(token)
	if arr, ok := claims["roles"].([]interface{}); ok {
		out := make([]string, 0, len(arr))
		for _, v := range arr {
			if s, ok := v.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

// decodeJWTClaims base64-decodes a JWT payload without verifying the signature.
func decodeJWTClaims(token string) map[string]interface{} {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil
	}
	var m map[string]interface{}
	if json.Unmarshal(payload, &m) != nil {
		return nil
	}
	return m
}
