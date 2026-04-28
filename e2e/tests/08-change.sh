section "Password Hot-Reload"

proxyfoxy add chg_user old_pass 8092 http
rc-service squid restart 2>/dev/null || true
sleep 3
wait_for_port 8092 10 || { fail "squid listening on 8092 for change test"; return; }
pass "squid listening on 8092 for change test"

assert_http "old credentials work" "200" \
    -x http://chg_user:old_pass@127.0.0.1:8092 https://icanhazip.com

assert_fail "wrong credentials rejected" \
    curl -s -o /dev/null --max-time 10 -x http://chg_user:wrong@127.0.0.1:8092 https://icanhazip.com

echo "Changing password..."
proxyfoxy change chg_user new_pass
pass "change password command"

sleep 2

assert_http "new credentials work" "200" \
    -x http://chg_user:new_pass@127.0.0.1:8092 https://icanhazip.com

assert_fail "old credentials rejected after change" \
    curl -s -o /dev/null --max-time 10 -x http://chg_user:old_pass@127.0.0.1:8092 https://icanhazip.com

proxyfoxy delete chg_user 8092 > /dev/null 2>&1 || true
pass "cleanup change test"
