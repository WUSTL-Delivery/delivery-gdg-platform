#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8081}"
TEST_EMAIL="${TEST_EMAIL:-henson.l@wustl.edu}"
TEST_PASSWORD="${TEST_PASSWORD:-StrongPass123!}"

# Optional fallback if your project requires email confirmation before login.
CONFIRMED_EMAIL="${CONFIRMED_EMAIL:-henson.l@wustl.edu}"
CONFIRMED_PASSWORD="${CONFIRMED_PASSWORD:-StrongPass123!}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
ACCESS_TOKEN=""
REFRESH_TOKEN=""

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

hr() {
  printf '%s\n' "------------------------------------------------------------"
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '✅ PASS: %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf '❌ FAIL: %s\n' "$1"
}

skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  printf '⏭️  SKIP: %s\n' "$1"
}

extract_json_field() {
  local file="$1"
  local field="$2"
  python3 - "$file" "$field" <<'PY'
import json, sys
path, field = sys.argv[1], sys.argv[2]
try:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    value = data
    for key in field.split('.'):
        value = value[key]
    if value is None:
        print("")
    else:
        print(value)
except Exception:
    print("")
PY
}

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local auth_header="${4:-}"
  local out_file="$5"

  local url="${BASE_URL}${path}"
  local status

  if [[ -n "$body" && -n "$auth_header" ]]; then
    status=$(curl -sS -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${auth_header}" \
      -d "$body" \
      -o "$out_file" \
      -w "%{http_code}")
  elif [[ -n "$body" ]]; then
    status=$(curl -sS -X "$method" "$url" \
      -H "Content-Type: application/json" \
      -d "$body" \
      -o "$out_file" \
      -w "%{http_code}")
  elif [[ -n "$auth_header" ]]; then
    status=$(curl -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${auth_header}" \
      -o "$out_file" \
      -w "%{http_code}")
  else
    status=$(curl -sS -X "$method" "$url" \
      -o "$out_file" \
      -w "%{http_code}")
  fi

  echo "$status"
}

require_server_up() {
  local out="$TMP_DIR/server_check.json"
  local status
  status=$(request "GET" "/auth/me" "" "" "$out" || true)
  if [[ "$status" == "000" ]]; then
    echo "Could not connect to ${BASE_URL}. Start the auth server first."
    exit 1
  fi
}

print_body() {
  local file="$1"
  if [[ -s "$file" ]]; then
    cat "$file"
  else
    echo "<empty body>"
  fi
}

run_tests() {
  hr
  echo "Auth server integration test"
  echo "BASE_URL=${BASE_URL}"
  echo "TEST_EMAIL=${TEST_EMAIL}"
  hr

  require_server_up

  # 1) Signup
  local f_signup="$TMP_DIR/signup.json"
  local signup_status
  signup_status=$(request "POST" "/auth/signup" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" "" "$f_signup" || true)
  if [[ "$signup_status" == "201" ]]; then
    pass "signup returns 201"
  else
    fail "signup returns 201 (got ${signup_status})"
    echo "Response body:"
    print_body "$f_signup"
  fi

  # 2) Login with signup credentials
  local f_login="$TMP_DIR/login.json"
  local login_status
  login_status=$(request "POST" "/auth/login" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" "" "$f_login" || true)

  if [[ "$login_status" == "200" ]]; then
    pass "login returns 200"
    ACCESS_TOKEN="$(extract_json_field "$f_login" "access_token")"
    REFRESH_TOKEN="$(extract_json_field "$f_login" "refresh_token")"
  else
    echo "Login with new signup user failed (status ${login_status})."
    echo "Response body:"
    print_body "$f_login"

    # Fallback for projects with email confirmation enabled.
    if [[ -n "$CONFIRMED_EMAIL" && -n "$CONFIRMED_PASSWORD" ]]; then
      echo "Trying fallback confirmed user via CONFIRMED_EMAIL/CONFIRMED_PASSWORD..."
      login_status=$(request "POST" "/auth/login" "{\"email\":\"${CONFIRMED_EMAIL}\",\"password\":\"${CONFIRMED_PASSWORD}\"}" "" "$f_login" || true)
      if [[ "$login_status" == "200" ]]; then
        pass "login returns 200 (fallback confirmed user)"
        ACCESS_TOKEN="$(extract_json_field "$f_login" "access_token")"
        REFRESH_TOKEN="$(extract_json_field "$f_login" "refresh_token")"
      else
        fail "login returns 200 (new user and fallback both failed; got ${login_status})"
        echo "Fallback response body:"
        print_body "$f_login"
      fi
    else
      fail "login returns 200 (got ${login_status})"
      echo "Hint: if email confirmation is enabled, set CONFIRMED_EMAIL and CONFIRMED_PASSWORD and rerun."
    fi
  fi

  if [[ -z "$ACCESS_TOKEN" || -z "$REFRESH_TOKEN" ]]; then
    skip "me endpoint (no valid access token available)"
    skip "refresh endpoint (no valid refresh token available)"
  else
    # 3) /auth/me with valid token
    local f_me_ok="$TMP_DIR/me_ok.json"
    local me_ok_status
    me_ok_status=$(request "GET" "/auth/me" "" "$ACCESS_TOKEN" "$f_me_ok" || true)
    if [[ "$me_ok_status" == "200" ]]; then
      pass "me with valid token returns 200"
    else
      fail "me with valid token returns 200 (got ${me_ok_status})"
      echo "Response body:"
      print_body "$f_me_ok"
    fi

    # 4) /auth/refresh with valid refresh token
    local f_refresh_ok="$TMP_DIR/refresh_ok.json"
    local refresh_ok_status
    refresh_ok_status=$(request "POST" "/auth/refresh" "{\"refresh_token\":\"${REFRESH_TOKEN}\"}" "" "$f_refresh_ok" || true)
    if [[ "$refresh_ok_status" == "200" ]]; then
      pass "refresh with valid token returns 200"

      local new_access
      new_access="$(extract_json_field "$f_refresh_ok" "access_token")"
      if [[ -n "$new_access" ]]; then
        local f_me_new="$TMP_DIR/me_new.json"
        local me_new_status
        me_new_status=$(request "GET" "/auth/me" "" "$new_access" "$f_me_new" || true)
        if [[ "$me_new_status" == "200" ]]; then
          pass "me with refreshed access token returns 200"
        else
          fail "me with refreshed access token returns 200 (got ${me_new_status})"
          echo "Response body:"
          print_body "$f_me_new"
        fi
      else
        fail "refresh returned 200 but no access_token in body"
        echo "Response body:"
        print_body "$f_refresh_ok"
      fi
    else
      fail "refresh with valid token returns 200 (got ${refresh_ok_status})"
      echo "Response body:"
      print_body "$f_refresh_ok"
    fi
  fi

  # 5) Negative: login wrong password
  local f_login_bad="$TMP_DIR/login_bad.json"
  local login_bad_status
  login_bad_status=$(request "POST" "/auth/login" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"wrong-password\"}" "" "$f_login_bad" || true)
  if [[ "$login_bad_status" == "401" ]]; then
    pass "login with wrong password returns 401"
  else
    fail "login with wrong password returns 401 (got ${login_bad_status})"
    echo "Response body:"
    print_body "$f_login_bad"
  fi

  # 6) Negative: /auth/me without token
  local f_me_no_token="$TMP_DIR/me_no_token.json"
  local me_no_token_status
  me_no_token_status=$(request "GET" "/auth/me" "" "" "$f_me_no_token" || true)
  if [[ "$me_no_token_status" == "401" ]]; then
    pass "me without token returns 401"
  else
    fail "me without token returns 401 (got ${me_no_token_status})"
    echo "Response body:"
    print_body "$f_me_no_token"
  fi

  # 7) Negative: /auth/me with invalid token
  local f_me_bad_token="$TMP_DIR/me_bad_token.json"
  local me_bad_token_status
  me_bad_token_status=$(request "GET" "/auth/me" "" "definitely.invalid.token" "$f_me_bad_token" || true)
  if [[ "$me_bad_token_status" == "401" ]]; then
    pass "me with invalid token returns 401"
  else
    fail "me with invalid token returns 401 (got ${me_bad_token_status})"
    echo "Response body:"
    print_body "$f_me_bad_token"
  fi

  # 8) Negative: refresh with invalid token
  local f_refresh_bad="$TMP_DIR/refresh_bad.json"
  local refresh_bad_status
  refresh_bad_status=$(request "POST" "/auth/refresh" "{\"refresh_token\":\"bad-refresh-token\"}" "" "$f_refresh_bad" || true)
  if [[ "$refresh_bad_status" == "401" ]]; then
    pass "refresh with invalid token returns 401"
  else
    fail "refresh with invalid token returns 401 (got ${refresh_bad_status})"
    echo "Response body:"
    print_body "$f_refresh_bad"
  fi

  # 9) Negative: malformed JSON
  local f_bad_json="$TMP_DIR/bad_json.json"
  local bad_json_status
  bad_json_status=$(request "POST" "/auth/login" "{not-json" "" "$f_bad_json" || true)
  if [[ "$bad_json_status" == "400" ]]; then
    pass "malformed JSON returns 400"
  else
    fail "malformed JSON returns 400 (got ${bad_json_status})"
    echo "Response body:"
    print_body "$f_bad_json"
  fi

  hr
  echo "Summary: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT} SKIP=${SKIP_COUNT}"
  hr

  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    exit 1
  fi
}

run_tests
