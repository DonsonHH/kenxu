# Xboard study and Kenxu adaptation

Reference: [cedar2025/Xboard](https://github.com/cedar2025/Xboard), revision `4f48e61a2cbc6db5338872b6bdb45ef954ec1256`.

Read the project's README, MIT license, official user/admin screenshots, theme configuration, web/client routes, and Clash/ClashMeta subscription serializers. Its README describes a Laravel/Octane backend, React/Shadcn admin panel and Vue user interface. The included default user theme is distributed as a compiled theme; its admin distribution is a separate submodule. A UI screenshot is not proof that an install contains all those frontends or that their API contracts fit an existing deployment.

## Adopted structure

| Xboard concept | Kenxu implementation |
| --- | --- |
| Sidebar workspace and top bar | Desktop persistent sidebar; mobile accessible drawer |
| My Subscription | Natural-month usage, display allowance, refresh period, subscription actions |
| Shortcut section | Subscription, documentation, assigned node status |
| User center | Account information and password change |
| Transfer details | Own daily upload/download history for the last 30 days |
| Admin dashboard | Users, managed collectors, monthly upload/download and recent reports |
| User/node/system management | Separate private-only views, filtering, access dialogs and audit log |
| Subscription metadata | Standard `subscription-userinfo`, update interval and web-page headers |

Payment, orders, coupons, commissions, public registration and quota-enforced account suspension are deliberately omitted: this is a private friend-sharing service, not a commercial billing panel. The Node/SQLite ledger, per-user Xray credentials and Jetson relay remain in place. No Laravel/PHP engine or Xboard theme bundle is embedded in this application. The UI is independently implemented from the reference structure, with attribution in the footer.

## Compatibility

Clash Verge Rev parses `subscription-userinfo` from subscription HTTP response headers and multiplies `profile-update-interval` by 60 (hours to minutes). See its [primary parser](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/src/config/prfitem.rs). Kenxu returns interval `12`, meaning 720 minutes, and this example shape:

```http
subscription-userinfo: upload=123; download=456; total=107374182400
profile-update-interval: 12
```

Upload/download represent that user's current Beijing calendar month, not lifetime usage. `expire` is omitted because there is no subscription expiry configured. `total` is 100 × 1024³ bytes, matching the client's binary GB display. It does not authorize any limiter or disable an account. Existing client profiles with an explicit 360-minute option may retain it; change their option to 720. A local YAML import does not fetch these response headers. The client's card updates with the subscription, whereas the website queries usage every minute.
