# Kenxu
Private subscription and traffic-accounting portal for trusted friends. Built and maintained by DonsonHH.

Current version: **1.1.0**. See [appearance, authentication and performance review](docs/review-v1.1.0.md), or the [first stable release](docs/release-v1.0.0.md).

## Features

- Administrator-created accounts, per-user node grants, password reset and subscription rotation.
- Xboard-inspired user/admin navigation: dashboard, subscriptions, node state, usage history, account settings and private management.
- Per-user Xray traffic ledger, cumulative counter epochs, duplicate suppression and separate logical routes on a shared collector.
- Optional Jetson WebSocket gateway for third-party nodes, without exposing provider credentials to friends.
- Monthly usage displayed in Clash Verge using subscription response headers.
- 100 GB display allowance only: **no traffic restriction, speed limit or automatic suspension**.
- Subscription refresh recommendation: 720 minutes; website polling: 60 seconds. Traffic counter sampling remains 15 seconds; independent Jetson exit checks default to 15 minutes.
- Distinct teal user/violet admin workspaces, with locally bundled charts for daily usage, route shares, rankings, connection results and infrastructure resources.
- Separate loopback user/admin servers, scrypt password hashes, HttpOnly/SameSite sessions, CSRF/Origin checks and private/no-store subscription responses.

## Private management console

The administrator port uses a distinct **Kenxu Control** identity. It supports editable ordinary-user usernames, display names, contact emails, administrator-only notes, labels, display allowance overrides and optional account expiry. Rename revokes existing user sessions/subscription links while retaining accounting identities. Expiry is checked at login, session/subscription use and node client synchronization; it is not a traffic quota.

User and node rows open detailed upload/download breakdowns and 30-day daily records. Settings persist validated site/admin titles, website and subscription intervals, default display GB, password floor, new-session duration, and monitoring source/cache policy. Existing accounts/default intervals are preserved unless explicitly edited.

The user workspace shows only the account's own data and granted nodes. Node state comes from `kenxu-node-checks.service`: bounded authenticated HTTPS requests through each private source proxy from Jetson, not collector heartbeat. Administrators can set the check interval from 5 to 120 minutes. Source changes and stale samples are not shown as normal. The checker tests the source exit path; it does not certify a visitor's ISP or the public gateway edge. See [the user/connectivity review](docs/user-stage1-review.md).

Chart.js is bundled locally without a CDN. Changing the user's 7/30-day chart view does not send another request. Hidden panels are rendered on demand, unchanged snapshots reuse charts, and missing readings remain unknown instead of being invented as zero. Admin resource charts reuse the read-only monitor cache and are not exposed to ordinary users. See [the semifinal review](docs/charts-semifinal-review.md).

The monitoring adapter is read-only and uses an operator-provided HTTPS root plus the server-side `MONITOR_ALLOWED_ORIGINS` allowlist (comma-separated origins). It caches a bounded public bootstrap response, returns selected CPU/memory/disk/network/uptime fields only, and does not weaken monitoring-site frame protections. Infrastructure period totals are not per-user proxy usage.

Audit logs default to the latest 24 hours, with signed continuation pages into the retained 30-day window. Startup/hourly maintenance removes only audit entries older than 30 days, not the traffic ledger. The former 500-row cap is removed; already-deleted historical entries cannot be reconstructed.

On Windows, configure the ignored private `deploy/admin-ssh.config` from the example and install a dedicated, restricted forwarding key. `node deploy/launch-admin.mjs --check` validates configuration; `deploy/create-admin-shortcut.ps1` creates a desktop link. The launcher checks/starts a hidden local forwarding session and opens the private portal without storing server passwords or creating/overwriting the portal administrator. Web login remains required. Keep private keys outside this repository. See [the administration review](docs/admin-control-review.md).

Layout and information architecture reference [cedar2025/Xboard](https://github.com/cedar2025/Xboard); see [study and compatibility notes](docs/xboard-study.md). This is an independently implemented Node/SQLite portal, not a deployment of Xboard's PHP/billing engine.

## Local setup

Node.js >=22.13 and pnpm are required.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Copy `.env.example` to a private `.env`, set the data directory outside the public assets, then initialize interactively:

```sh
pnpm admin create-admin owner
pnpm admin import /absolute/path/to/private-source.yaml
pnpm start
```

Administrator passwords are entered privately in an interactive terminal, never through command arguments or environment variables. Existing administrators are not overwritten. User endpoint defaults to loopback port 4450; private administration defaults to loopback port 4451. No real accounts, source configurations, node keys or collector tokens are included.

## Production and metering

Set an exact HTTPS `PUBLIC_ORIGIN`, the loopback `ADMIN_ORIGIN`, and an absolute private `DATA_DIR`. The service refuses implicit production defaults. Both listeners bind to `127.0.0.1`; publish **only the user port** through the HTTP Tunnel. Use a private SSH port forward for administration. Example service units are in `deploy/`; adapt user/path/origin values for your host.

Meter nodes require private registration and a compatible local collector. The optional reusable collector/playbook lives in [DonsonHH/my-ansible-playbooks](https://github.com/DonsonHH/my-ansible-playbooks). Register each physical core once; attach forwarded logical routes to the same physical agent. The UK SOCKS relay is TCP-only. Third-party gateways need private upstream configuration, a loopback API, and a fixed-path authenticated VLESS/WebSocket inlet; adding a node to a YAML file alone does not install these components. To enable cached source exit checks, install the example `deploy/kenxu-node-checks.service` with private `DATA_DIR`, Xray and curl available on Jetson.

Only managed, authorized routes get independent credentials. Old shared credentials, DIRECT and bypassed routes cannot be attributed to a friend. Source file replacement does not update a third-party gateway's upstream automatically. Collector heartbeats are not end-to-end node health tests. Short polling does not guarantee lossless accounting after an abrupt core crash.

## Subscription display

Kenxu returns monthly `upload` and `download` plus `total=107374182400` in `subscription-userinfo`. This is the client's 100 GB display reference, not an enforced quota. The Beijing natural-month boundary resets the **monthly view**, retaining cumulative history. No expiry is invented.

`profile-update-interval: 12` means 720 minutes. Existing Clash Verge profiles with a manually saved 360-minute interval need that option changed to 720. Client card usage updates when the remote subscription is refreshed, not every time the webpage refreshes. A local YAML file does not fetch subscription headers.

## Verification

```sh
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm audit --prod
```

Browser checks use isolated fictional accounts and temporary databases, then clean them up. On hosts with an installed browser, `PLAYWRIGHT_CHANNEL=msedge` or `chrome` is also supported. Screenshots/results go to ignored `test-output/`. The header tests cover per-user isolation, Beijing month rollover, HEAD responses and continued availability after crossing 100 GB.

See the [review and captured flows](docs/review-20261001.md) for the source-informed design and validation boundaries. The published images show fictional test data only.

## Security and backups

Do not commit `.env`, private YAML, SQLite files, subscription keys, collector registrations, screenshots containing real links or SSH inventories. The repository intentionally excludes machine-specific access helpers and private delivery records.

Subscription URLs are bearer credentials. Never publicly share them or enable proxy access logs containing them. Do not use Cloudflare cache-everything, browser challenges or interactive Access login on subscription/collector routes; clients need non-interactive access. External script injection is blocked by the CSP, but is not a replacement for protecting the origin.

Stop the portal before making a filesystem copy of its entire private data directory (including WAL/key files). Preserve backup permissions. Stage releases and switch the release link atomically, retaining the previous version. Do not copy just a live SQLite main file over a WAL database. Keep the ledger and collector queue when rolling back.

When permanently removing a disabled ordinary account, record its exact collector identities with `store.meter.retireUserCredentials(id)` before deleting credentials or account rows, in the same transaction. Xray and queued reports can retain counters after client removal. Retirement markers let those reports drain without recreating removed usage; all other unknown or wrong-agent identities remain rejected. Back up first and retain markers with the ledger.

This is a small invitation-only service, not a fully audited public commercial system. Authentication limits persist in SQLite across restarts: per-realm/account/source/global fixed windows and a shared password-work concurrency budget. See the 1.1.0 review for exact thresholds and the trusted Cloudflare-header deployment assumption. Disabled managed users are removed on successful collector synchronization; existing long-lived connections can continue until closed. Legacy shared credentials remain outside that revocation mechanism.

## License

MIT; see [LICENSE](LICENSE). Bundled frontend library notices are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
