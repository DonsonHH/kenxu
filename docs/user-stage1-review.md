# User experience and connectivity review

## First review

Local and remote repository revisions matched, the existing thirteen backend checks passed and the dependency audit had no known production vulnerabilities. The two private listeners and live Jetson services were checked independently. No VPS configuration, provider credentials or campus login was changed.

| Before | After | Why |
| --- | --- | --- |
| Similar light user/admin workspace | Teal user workspace and light navigation; dark violet private admin console retained | Distinct roles at a glance |
| Repeated small operational notes | Compact labels; detailed explanations in the usage guide | Let users focus on subscription and connection |
| Meter heartbeat presented as node state | Jetson authenticated small HTTP requests through each source proxy, dated and cached | Heartbeat is not connectivity evidence |
| Long introductory copy | Direct import/select/enable steps and question-based help | Explain the task without marketing filler |

The interface was built with a single Sonner Toaster and existing promise/error feedback. The documentation pass removed promotional and implementation-heavy wording; factual caveats remain in the guide rather than disappearing.

## Node checks

`kenxu-node-checks.service` runs independently of website visitors, defaulting to a cycle every fifteen minutes. It starts one temporary loopback Xray/SOCKS client at a time, using the private source's existing personal credentials; these identities are outside per-friend metering. Each check requests a small HTTPS test response, with a bounded fallback endpoint. No speed-test downloads or visitor-triggered bursts are used. Temporary configs are private and removed, raw commands and credentials are never logged.

The observer is Jetson. A normal result verifies the source node's authenticated proxy **exit path from Jetson**, not the visitor's ISP route or the public Cloudflare gateway edge. Third-party nodes use the original purchased upstream for this test; their public WSS gateway still has its own external dependencies. The UK logical source uses its existing SG2 user route. Source changes invalidate cached status, and stale samples show pending update rather than normal. Unsupported transports are marked explicitly. Up to seven days of genuine checks are retained; there is no invented past uptime.

User status responses are grant-filtered and contain node names, latency, timestamps and status only, not IPs, UUIDs, upstream keys or other accounts. Browser refresh reads the stored results and does not trigger probes. SQLite busy timeout handles concurrent local checker and ledger writes. A private single-process lock prevents overlapping checkers.

## Verification

Fourteen backend tests and two isolated browser suites pass, covering account/role isolation, disabled gateways, month boundaries, source changes/stale health, mobile navigation, settings persistence and detailed admin flows. The settings browser assertion now waits for persisted values rather than using the earlier-changing document title as completion evidence. The deployment stages a release, takes a stopped-service data backup and retains the prior release before adding the private checker service.

The live first cycle and release health are checked before the first-stage push. Later chart work is committed separately so these changes have a recoverable checkpoint.
