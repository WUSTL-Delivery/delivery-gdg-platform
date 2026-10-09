package security

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIsAllowedEmail(t *testing.T) {
	tests := []struct {
		email string
		want  bool
	}{
		{"jane@wustl.edu", true},
		{" Jane.Doe@WUSTL.EDU ", true},
		{"jane+robots@wustl.edu", true},
		{"jane@gmail.com", false},
		{"jane@wustl.edu.evil.com", false},
		{"jane@notwustl.edu", false},
		{"jane@cse.wustl.edu", false},
		{"jane@gmail.com@wustl.edu", false},
		{"@wustl.edu", false},
		{"ja ne@wustl.edu", false},
		{"", false},
		{"victim<attacker@wustl.edu", false},
		{"jdoe;attacker@wustl.edu", false},
		{"attacker,victim@wustl.edu", false},
		{`"quoted"@wustl.edu`, false},
	}
	for _, tt := range tests {
		if got := IsAllowedEmail(tt.email); got != tt.want {
			t.Errorf("IsAllowedEmail(%q) = %v, want %v", tt.email, got, tt.want)
		}
	}
}

// newTestServer wires the auth routes to a stand-in GoTrue server and records
// which GoTrue endpoints were reached.
func newTestServer(t *testing.T) (*http.ServeMux, *[]string) {
	t.Helper()
	var calls []string
	gotrue := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"00000000-0000-4000-8000-000000000000","email":"jane@wustl.edu"}`))
	}))
	t.Cleanup(gotrue.Close)

	svc, err := NewAuthService(gotrue.URL, "test-key")
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	NewAuthHTTPServer(svc).RegisterRoutes(mux)
	return mux, &calls
}

func post(mux *http.ServeMux, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, strings.NewReader(body)))
	return rec
}

func TestAuthRoutesRejectNonWashUEmails(t *testing.T) {
	for _, path := range []string{"/auth/signup", "/auth/login"} {
		t.Run(path, func(t *testing.T) {
			mux, calls := newTestServer(t)

			rec := post(mux, path, `{"email":"jane@gmail.com","password":"correct horse"}`)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", rec.Code, http.StatusBadRequest)
			}
			if !strings.Contains(rec.Body.String(), "@wustl.edu") {
				t.Errorf("body = %s, want it to mention @wustl.edu", rec.Body.String())
			}
			if len(*calls) != 0 {
				t.Errorf("GoTrue was called: %v", *calls)
			}
		})
	}
}

func TestSignupForwardsWashUEmails(t *testing.T) {
	mux, calls := newTestServer(t)

	rec := post(mux, "/auth/signup", `{"email":"jane@wustl.edu","password":"correct horse"}`)

	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d (body %s)", rec.Code, http.StatusCreated, rec.Body.String())
	}
	if len(*calls) != 1 || (*calls)[0] != "/auth/v1/signup" {
		t.Errorf("GoTrue calls = %v, want [/auth/v1/signup]", *calls)
	}
}
