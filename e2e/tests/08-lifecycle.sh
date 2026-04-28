section "Lifecycle: List, Stop, Start, Uninstall"

proxyfoxy add lc_user lc_pass 8094 http > /dev/null 2>&1 || true
proxyfoxy add lc_sock lc_pass 8095 socks5 > /dev/null 2>&1 || true
sleep 2

LIST_OUT=$(proxyfoxy list 2>&1) || true
echo "$LIST_OUT" | grep -q "8094" && pass "list shows port 8094" || fail "list shows port 8094"
echo "$LIST_OUT" | grep -q "8095" && pass "list shows port 8095" || fail "list shows port 8095"
echo "$LIST_OUT" | grep -q "lc_user" && pass "list shows username" || fail "list shows username"

assert_exit "stop http proxy" proxyfoxy stop http
sleep 1
assert_fail "http proxy rejects after stop" \
    curl -s -o /dev/null --max-time 5 -x http://lc_user:lc_pass@127.0.0.1:8094 https://icanhazip.com

assert_exit "start http proxy" proxyfoxy start http
sleep 2
assert_http "http proxy works after start" "200" \
    -x http://lc_user:lc_pass@127.0.0.1:8094 https://icanhazip.com

proxyfoxy delete lc_user 8094 > /dev/null 2>&1 || true
proxyfoxy delete lc_sock 8095 > /dev/null 2>&1 || true

section "Input Validation"

assert_fail "reject shell injection in username" \
    proxyfoxy 'add' 'user;rm -rf /' 'pass' 8096

assert_fail "reject non-numeric port" \
    proxyfoxy 'add' 'user' 'pass' 'abc'

assert_fail "reject out-of-range port" \
    proxyfoxy 'add' 'user' 'pass' 99999

pass "input validation complete"
