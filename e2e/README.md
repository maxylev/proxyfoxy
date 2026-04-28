# 🧪 E2E Test Suite

Docker-based end-to-end tests that validate every ProxyFoxy protocol, CLI command, and network flow against real proxy daemons.

## Quick Start

```bash
cd e2e && docker compose up --build --abort-on-container-exit
```

## Architecture

```
┌──────────────────────────┐       ┌──────────────────────────┐
│        server            │       │       provider           │
│  (privileged Alpine)     │       │  (Alpine)                │
│                          │       │                          │
│  • proxyfoxy add …       │◄──────│  proxyfoxy provider      │
│  • curl tests            │ 9000  │  res_user:res_pass@      │
│  • run.sh orchestration  │       │    server:9000           │
└──────────────────────────┘       └──────────────────────────┘
           │  proxyfoxy-net (Docker network)
           ▼
    icanhazip.com / internet
```

- **server** — Runs the full test suite as root (privileged for iptables). Creates proxies with `proxyfoxy add`, then validates them with `curl`.
- **provider** — Connects to the server's residential gateway on port 9000, simulating a home PC exit node.

## Test Files

| File                | Protocol    | What is tested                                                                                                       |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `01-http.sh`        | HTTP        | Squid setup, authenticated request, bad creds rejected, unauthenticated blocked, teardown                            |
| `02-socks5.sh`      | SOCKS5      | Dante setup, authenticated request, bad creds rejected, teardown                                                     |
| `03-mtproto.sh`     | MTProto     | MTG setup, port listening, list/status output, teardown                                                              |
| `04-residential.sh` | Residential | Master gateway + consumer port, provider auto-join, SOCKS5 auth relay through provider, status pool output, teardown |
| `05-stats.sh`       | Analytics   | Traffic generation, `status` output parsing (port, protocol, traffic section, service state)                         |
| `06-limits.sh`      | Limits      | `--limit=1KB` stored in DB and displayed by `status`                                                                 |
| `07-change.sh`      | Hot-reload  | Old creds work → `change` password → new creds work, old rejected                                                    |
| `08-lifecycle.sh`   | Lifecycle   | `list` output, `stop`/`start` cycle, input validation (shell injection, bad port, out-of-range port)                 |

## Extending

Add a new test file following the convention:

```bash
# e2e/tests/09-my-test.sh
section "My New Test"

proxyfoxy add test_user test_pass 9000 http
# ... assertions using pass(), fail(), assert_http(), etc.
proxyfoxy delete test_user 9000
```

Then append to `run.sh`:

```bash
source /e2e/tests/09-my-test.sh
```

## Assertion Helpers

Available in every test file (defined in `run.sh`):

| Helper                                 | Description                              |
| -------------------------------------- | ---------------------------------------- |
| `pass "desc"`                          | Record a passing assertion               |
| `fail "desc"`                          | Record a failing assertion               |
| `skip "desc"`                          | Record a skipped assertion               |
| `assert_exit "desc" cmd …`             | Assert command exits 0                   |
| `assert_fail "desc" cmd …`             | Assert command exits non-zero            |
| `assert_output "desc" "needle" cmd …`  | Assert command stdout contains string    |
| `assert_http "desc" "200" curl-opts …` | Assert curl returns specific HTTP status |
| `wait_for_port PORT [TRIES]`           | Block until TCP port is reachable        |
| `section "Title"`                      | Print a section header                   |
