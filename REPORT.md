# ProxyFoxy QA Report

Date: 2026-05-01

## Summary

Comprehensive CLI, protocol, residential relay, Docker e2e, and browser-extension testing was performed. The CLI/protocol suites are green. Chrome for Testing was then used for real browser-extension proxy routing and found one product/browser compatibility failure: authenticated SOCKS5 proxies do not work through Chrome's extension proxy API.

## Final Results

| Area                                      | Command                                                                                               | Result                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Node sanity and extension runtime tests   | `npm test`                                                                                            | Passed                                                                                 |
| Full Docker e2e suite                     | `npm run test:e2e`                                                                                    | 82 passed, 0 failed, 1 skipped                                                         |
| Two-container residential simulation      | `docker compose -f docker-compose.two-container.yml up --build --abort-on-container-exit` from `e2e/` | 9 passed, 0 failed                                                                     |
| Real Chrome for Testing extension routing | `npm run test:browser`                                                                                | HTTP passed, Residential passed, SOCKS5 failed with `net::ERR_SOCKS_CONNECTION_FAILED` |

The single skip is expected in Docker: the MTProto daemon listen check is skipped because OpenRC service supervision is limited inside the privileged Alpine test container. MTProto add/list/status/delete coverage still passed.

## Coverage

CLI commands covered:

- `help`, `--help`, `-h`
- `version`, `--version`, `-v`
- `add`
- `delete`
- `change`
- `list`
- `status`
- `stop`
- `start`
- `provider`
- `providers list`
- `providers block`
- `providers unblock`
- `providers whitelist`
- `providers unwhitelist`

Protocols covered:

- HTTP proxy via Squid, including successful authenticated traffic, bad credentials, unauthenticated blocking, password hot reload, lifecycle stop/start, and cleanup.
- SOCKS5 proxy via Dante, including successful authenticated traffic, bad credentials, and cleanup.
- MTProto via MTG, including proxy creation, status/list output, and cleanup.
- Residential relay, including master gateway, provider token auth, SOCKS5 consumer mode, HTTP CONNECT consumer mode, bad consumer credentials, provider pool status, traffic limits, provider block/unblock/whitelist management, and cleanup.

Browser extension covered:

- PAC generation for SOCKS5, HTTP, and residential proxy profiles.
- Include/exclude/kill-switch routing logic.
- Proxy credential handling through `webRequest.onAuthRequired`.
- Runtime `connect`, `disconnect`, `getStats`, and proxy settings behavior using a mocked Chrome extension API.
- Privacy header helpers, tracker detection, and traffic stat accounting.
- Real Chrome for Testing extension loading with `--load-extension`.
- Real browser traffic through ProxyFoxy HTTP and residential proxy profiles.
- Real browser SOCKS5 profile behavior, which currently fails for authenticated ProxyFoxy SOCKS5 proxies.

## Changes Made

- Added a true two-container residential Docker simulation:
  - `e2e/docker-compose.two-container.yml`
  - `e2e/two-container-server.sh`
  - `e2e/two-container-provider.sh`
- Added a real browser-extension e2e harness using Chrome for Testing:
  - `e2e/docker-compose.browser.yml`
  - `e2e/browser-server.sh`
  - `e2e/browser-provider.sh`
  - `tests/browser-extension-e2e.js`
- Updated `e2e/Dockerfile.e2e` so all top-level e2e shell scripts are executable in the image.
- Strengthened `tests/sanity.test.js` with a Chrome extension service-worker runtime smoke test using mocked Chrome APIs.
- Added this report: `REPORT.md`.

## Bugs Found and Fixed

- Coverage gap: residential e2e only simulated the provider process inside the server container. Fixed by adding a real separate provider container that connects to the server container over Docker networking.
- Coverage gap: extension tests only validated pure helper functions. Fixed by adding runtime coverage for service-worker message handling, PAC proxy installation, proxy auth credentials, webRequest stats, and disconnect cleanup.
- Coverage gap: extension proxy routing had not been tested in a real browser. Fixed by adding a Chrome for Testing e2e harness.

No functional CLI/protocol regression was found in the final automated runs.

## Browser Extension Findings

Chrome for Testing was available at `chrome/mac_arm-148.0.7778.97/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` and successfully loaded the unpacked extension with `--load-extension`.

Real browser results:

- HTTP profile: passed. Browser traffic reached `https://icanhazip.com` through the authenticated Squid proxy.
- Residential profile: passed. Browser traffic reached `https://icanhazip.com` through the authenticated residential consumer port and separate provider container.
- SOCKS5 profile: failed. The extension installed a `SOCKS5 127.0.0.1:11080` PAC entry, but Chrome navigation failed with `net::ERR_SOCKS_CONNECTION_FAILED` against ProxyFoxy's authenticated Dante SOCKS5 proxy.

Root cause assessment:

- ProxyFoxy's SOCKS5 proxy itself is healthy: `curl --socks5-hostname browser_socks:socks_pass@127.0.0.1:11080 https://icanhazip.com` returned HTTP 200.
- The extension's PAC installation is healthy: Chrome reported the expected SOCKS5 PAC script.
- Chrome's extension proxy API/PAC path does not provide username/password authentication to SOCKS5 proxies the way it does for HTTP proxy auth challenges. The extension's `webRequest.onAuthRequired` path covers HTTP/CONNECT proxy authentication but does not make authenticated SOCKS5 usable in Chrome.

Recommended product fix:

- For browser-extension support, expose a browser-compatible HTTP CONNECT endpoint for SOCKS5-backed exits, or document/warn that SOCKS5 profiles in Chrome require unauthenticated SOCKS5 or an external local bridge.
- Keep CLI SOCKS5 support unchanged; the CLI/Docker SOCKS5 proxy works correctly with clients that support SOCKS5 username/password auth.

## Residual Risks

- Real third-party residential IP quality and geo-targeting were not tested because no external residential provider credentials were supplied.
- MTProto network behavior was not fully exercised beyond daemon creation/list/status/delete because Telegram-specific client validation is outside the current e2e harness.
- Full live popup UI profile creation was not automated; the real browser e2e drives the extension service worker through Chrome DevTools Protocol and verifies actual browser traffic.
- Authenticated SOCKS5 through the Chrome extension remains a known failing case unless a browser-compatible bridge or unauthenticated SOCKS5 mode is added.
