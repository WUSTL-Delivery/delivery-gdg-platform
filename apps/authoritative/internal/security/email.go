package security

import (
	"errors"
	"regexp"
	"strings"
)

// AllowedEmailDomain limits sign-up and login to WashU addresses. Mirrors
// apps/client/web/lib/email-domain.ts.
const AllowedEmailDomain = "wustl.edu"

var ErrEmailDomainNotAllowed = errors.New("only @" + AllowedEmailDomain + " email addresses are allowed")

// Plain address characters only, as in the web app.
var emailLocalPart = regexp.MustCompile(`^[a-z0-9._+-]+$`)

// IsAllowedEmail reports whether email is an address at exactly AllowedEmailDomain.
func IsAllowedEmail(email string) bool {
	local, domain, ok := strings.Cut(strings.ToLower(strings.TrimSpace(email)), "@")
	return ok && domain == AllowedEmailDomain && emailLocalPart.MatchString(local)
}
