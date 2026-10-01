# Kenxu
Private subscription and traffic-accounting portal for trusted friends. Built and maintained by DonsonHH.

## Features

- Administrator-created accounts, per-user node grants, password reset and subscription rotation.
- Xboard-inspired user/admin navigation: dashboard, subscriptions, node state, usage history, account settings and private management.
- Per-user Xray traffic ledger, cumulative counter epochs, duplicate suppression and separate logical routes on a shared collector.
- Optional Jetson WebSocket gateway for third-party nodes, without exposing provider credentials to friends.
- Monthly usage displayed in Clash Verge using subscription response headers.
- 100 GB display allowance only: **no traffic restriction, speed limit or automatic suspension**.
- Subscription refresh recommendation: 720 minutes; website polling: 60 seconds. Node sampling remains 15 seconds.
- Separate loopback user/admin servers, scrypt password hashes, HttpOnly/SameSite sessions, CSRF/Origin checks and private/no-store subscription responses.

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

Meter nodes require private registration and a compatible local collector. The optional reusable collector/playbook lives in [DonsonHH/my-ansible-playbooks](https://github.com/DonsonHH/my-ansible-playbooks). Register each physical core once; attach forwarded logical routes to the same physical agent. The UK SOCKS relay is TCP-only. Third-party gateways need private upstream configuration, a loopback API, and a fixed-path authenticated VLESS/WebSocket inlet; adding a node to a YAML file alone does not install these components.

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

This is a small invitation-only service, not a fully audited public commercial system. Login rate limits are in memory and reset with the process. Disabled managed users are removed on successful collector synchronization; existing long-lived connections can continue until closed. Legacy shared credentials remain outside that revocation mechanism.

## License

MIT; see [LICENSE](LICENSE). Bundled frontend library notices are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
