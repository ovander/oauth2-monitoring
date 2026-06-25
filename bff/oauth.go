package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// randToken returns a URL-safe, 256-bit random token (state, verifier, sid, csrf).
func randToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// pkceChallenge returns the S256 challenge for a verifier.
func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

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

	var tr tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK || tr.AccessToken == "" {
		msg := tr.Error
		if tr.ErrorDesc != "" {
			msg = tr.ErrorDesc
		}
		if msg == "" {
			msg = resp.Status
		}
		return nil, fmt.Errorf("token endpoint: %s", msg)
	}
	return &tr, nil
}

// userFromToken builds the session's UserInfo from the token response: identity
// claims are read from the (unverified) access-token payload — the token came
// from our own OAuth server over loopback and the security boundary is the
// session cookie, not this decode — and roles are merged from the response body.
func userFromToken(clientID string, tr *tokenResponse) UserInfo {
	u := UserInfo{Roles: mergeRoles(clientID, tr)}
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
