section "Provider Management"

echo "Setting up residential proxy for provider tests..."
proxyfoxy add pm_user pm_pass 8093 residential > /dev/null 2>&1 || { fail "add residential proxy"; return; }
sleep 2
wait_for_port 9000 20 || { fail "gateway listening on 9000"; return; }
pass "gateway up for provider tests"

echo "Waiting for provider to connect..."
PROVIDER_IP=""
for i in $(seq 1 30); do
    if [ -f /var/run/proxyfoxy_state.json ]; then
        STATE=$(cat /var/run/proxyfoxy_state.json 2>/dev/null)
        if echo "$STATE" | grep -q '"ip"'; then
            PROVIDER_IP=$(echo "$STATE" | grep -o '"ip":"[^"]*"' | head -1 | cut -d'"' -f4)
            break
        fi
    fi
    sleep 1
done

if [ -z "$PROVIDER_IP" ]; then
    fail "provider connected for management tests"
    proxyfoxy delete pm_user 8093 > /dev/null 2>&1 || true
    return
fi
pass "provider connected for management tests"

echo "Testing providers list command..."
assert_output "providers list shows connected IP" "$PROVIDER_IP" proxyfoxy providers

echo "Testing blacklist..."
proxyfoxy providers block "$PROVIDER_IP" suspicious > /dev/null 2>&1 || { fail "block provider"; return; }
pass "block provider IP"
assert_output "providers list shows blacklisted IP" "$PROVIDER_IP" proxyfoxy providers
assert_output "providers list shows reason" "suspicious" proxyfoxy providers

sleep 3
PROVIDER_STATE=$(cat /var/run/proxyfoxy_state.json 2>/dev/null)
if echo "$PROVIDER_STATE" | grep -q "$PROVIDER_IP"; then
    fail "blacklisted provider was disconnected"
else
    pass "blacklisted provider was disconnected"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    --socks5-hostname pm_user:pm_pass@127.0.0.1:8093 https://icanhazip.com 2>/dev/null) || CODE="000"
if [ "$CODE" != "200" ]; then
    pass "proxy rejects with no providers available"
else
    fail "proxy should reject with no providers (got HTTP $CODE)"
fi

echo "Testing unblock..."
proxyfoxy providers unblock "$PROVIDER_IP" > /dev/null 2>&1 || { fail "unblock provider"; return; }
pass "unblock provider IP"

sleep 5
PROVIDER_BACK=false
for i in $(seq 1 20); do
    if [ -f /var/run/proxyfoxy_state.json ]; then
        STATE=$(cat /var/run/proxyfoxy_state.json 2>/dev/null)
        if echo "$STATE" | grep -q '"ip"'; then
            PROVIDER_BACK=true
            break
        fi
    fi
    sleep 1
done

if [ "$PROVIDER_BACK" = true ]; then
    pass "provider reconnected after unblock"
else
    fail "provider reconnected after unblock (timeout)"
fi

echo "Testing whitelist..."
proxyfoxy providers whitelist "$PROVIDER_IP" > /dev/null 2>&1 || { fail "whitelist provider"; return; }
pass "whitelist provider IP"
assert_output "providers list shows whitelist" "$PROVIDER_IP" proxyfoxy providers

echo "Testing whitelist removal..."
proxyfoxy providers unwhitelist "$PROVIDER_IP" > /dev/null 2>&1 || { fail "unwhitelist provider"; return; }
pass "unwhitelist provider IP"

BL_FILE=$(cat /etc/proxyfoxy_blacklist.json 2>/dev/null)
if echo "$BL_FILE" | grep -q "$PROVIDER_IP"; then
    fail "blacklist should be empty after unblock"
else
    pass "blacklist is clean"
fi

proxyfoxy delete pm_user 8093 > /dev/null 2>&1 || true
pass "cleanup provider management tests"
