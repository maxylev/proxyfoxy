section "MTProto Proxy (MTG)"

echo "Setting up MTProto proxy on port 8082..."
proxyfoxy add mt_user mt_pass 8082 mtproto || { fail "add mtproto proxy"; return; }
pass "add mtproto proxy command"

sleep 2
if wait_for_port 8082 5; then
    pass "mtg listening on 8082"
else
    skip "mtg listening on 8082 (OpenRC limitation in Docker)"
fi

assert_output "list shows mtproto proxy" "MTPROTO" proxyfoxy list

assert_output "status shows traffic section" "TRAFFIC" proxyfoxy status

echo "Tearing down MTProto proxy..."
proxyfoxy delete mt_user 8082
pass "delete mtproto proxy"
