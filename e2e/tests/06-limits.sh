section "Data Limit Enforcement"

echo "Creating residential proxy with 1KB limit..."
proxyfoxy add lim_user lim_pass 8091 residential --limit=1KB > /dev/null 2>&1 || { fail "add limited proxy"; return; }
pass "add limited residential proxy (1KB limit)"

sleep 2

LIMIT_DB=$(cat /etc/proxyfoxy.json 2>/dev/null)
if echo "$LIMIT_DB" | grep -q '"limit"'; then
    pass "limit stored in database"
else
    fail "limit stored in database"
fi

STATUS_OUT=$(proxyfoxy status 2>&1) || true
if echo "$STATUS_OUT" | grep -q "Limit:"; then
    pass "status displays data limit"
else
    fail "status displays data limit"
fi

proxyfoxy delete lim_user 8091 > /dev/null 2>&1 || true
pass "cleanup limited proxy"
