package security

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	auth "github.com/supabase-community/auth-go"
	authtypes "github.com/supabase-community/auth-go/types"
)

// AuthService is a thin foundation layer around Supabase GoTrue auth.
//
// It covers the common flows needed by a delivery app backend:
// - signup
// - login (issues access + refresh tokens)
// - refresh token
// - validate access token and fetch user profile
type AuthService struct {
	client auth.Client
}

func NewAuthService(supabaseURL, supabaseAnonKey string) (*AuthService, error) {
	if strings.TrimSpace(supabaseURL) == "" {
		return nil, fmt.Errorf("supabase URL is required")
	}
	if strings.TrimSpace(supabaseAnonKey) == "" {
		return nil, fmt.Errorf("supabase anon key is required")
	}

	authBaseURL, err := buildAuthBaseURL(supabaseURL)
	if err != nil {
		return nil, err
	}

	// auth.New requires a project reference, but for reliability we override
	// the auth URL directly for local/prod compatibility.
	client := auth.New("placeholder", supabaseAnonKey).WithCustomAuthURL(authBaseURL)

	return &AuthService{client: client}, nil
}

func buildAuthBaseURL(supabaseURL string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(supabaseURL))
	if err != nil {
		return "", fmt.Errorf("invalid supabase URL: %w", err)
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("supabase URL must include scheme and host")
	}

	basePath := strings.TrimSuffix(u.Path, "/")
	if strings.HasSuffix(basePath, "/auth/v1") {
		u.Path = basePath
		return u.String(), nil
	}

	u.Path = strings.TrimSuffix(basePath, "/") + "/auth/v1"
	return u.String(), nil
}

func (s *AuthService) Signup(email, password string, metadata map[string]interface{}) (*authtypes.SignupResponse, error) {
	req := authtypes.SignupRequest{
		Email:    strings.TrimSpace(email),
		Password: password,
		Data:     metadata,
	}
	return s.client.Signup(req)
}

func (s *AuthService) SignInWithPassword(email, password string) (*authtypes.TokenResponse, error) {
	return s.client.SignInWithEmailPassword(strings.TrimSpace(email), password)
}

func (s *AuthService) Refresh(refreshToken string) (*authtypes.TokenResponse, error) {
	return s.client.RefreshToken(strings.TrimSpace(refreshToken))
}

func (s *AuthService) ValidateAccessToken(accessToken string) (*authtypes.UserResponse, error) {
	return s.client.WithToken(strings.TrimSpace(accessToken)).GetUser()
}

type AuthHTTPServer struct {
	auth *AuthService
}

func NewAuthHTTPServer(authService *AuthService) *AuthHTTPServer {
	return &AuthHTTPServer{auth: authService}
}

func (s *AuthHTTPServer) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /auth/signup", s.handleSignup)
	mux.HandleFunc("POST /auth/login", s.handleLogin)
	mux.HandleFunc("POST /auth/refresh", s.handleRefresh)
	mux.HandleFunc("GET /auth/me", s.handleMe)
}

type credentialRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (s *AuthHTTPServer) handleSignup(w http.ResponseWriter, r *http.Request) {
	var req credentialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	res, err := s.auth.Signup(req.Email, req.Password, map[string]interface{}{
		"role": "customer",
	})
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}

	// If email confirmation is enabled, Session may be empty; User will still be present.
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "signup accepted",
		"user_id": res.User.ID,
		"email":   res.User.Email,
	})
}

func (s *AuthHTTPServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req credentialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	tokens, err := s.auth.SignInWithPassword(req.Email, req.Password)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"expires_in":    tokens.ExpiresIn,
		"token_type":    tokens.TokenType,
		"user_id":       tokens.User.ID,
		"email":         tokens.User.Email,
	})
}

func (s *AuthHTTPServer) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	tokens, err := s.auth.Refresh(req.RefreshToken)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"expires_in":    tokens.ExpiresIn,
		"token_type":    tokens.TokenType,
	})
}

func (s *AuthHTTPServer) handleMe(w http.ResponseWriter, r *http.Request) {
	authz := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(authz, "Bearer ") {
		writeJSONError(w, http.StatusUnauthorized, "missing Bearer token")
		return
	}

	accessToken := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
	user, err := s.auth.ValidateAccessToken(accessToken)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid or expired access token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":    user.ID,
		"email": user.Email,
		"role":  user.Role,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode JSON response: %v", err)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// ExampleProgram starts a minimal auth API server using Supabase auth-go.
//
// Required environment variables:
// - SUPABASE_URL (example: https://<project-ref>.supabase.co)
// - SUPABASE_ANON_KEY
//
// Optional:
// - AUTH_SERVER_ADDR (default :8081)
func ExampleProgram() error {
	supabaseURL := os.Getenv("SUPABASE_URL")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")

	authService, err := NewAuthService(supabaseURL, anonKey)
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	server := NewAuthHTTPServer(authService)
	server.RegisterRoutes(mux)

	addr := os.Getenv("AUTH_SERVER_ADDR")
	if strings.TrimSpace(addr) == "" {
		addr = ":8081"
	}

	log.Printf("auth server listening on %s", addr)
	return http.ListenAndServe(addr, mux)
}