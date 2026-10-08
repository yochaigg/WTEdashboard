# Central Orbit gas console (glass factory version)

Same plant and dashboard, but the cleaned syngas is piped to a glass factory and burned in its furnace instead of natural gas.
No engines and no grid sales. Syngas is sold per MWh of heat at a discount (default 25 %) to the natural gas price.

Deploy: Cloudflare Workers with static assets, directory `./public` (worker name `wte-glass-dashboard`).
Settings are stored in the browser under `wtg_` keys, separate from the power version.

## Sign-in
Two passwords, set as secrets on the `wte-glass-dashboard` worker: `ADMIN_PASSWORD` (can change everything) and `VIEWER_PASSWORD` (read only; every field is locked except search and the what-if sandbox).
`SESSION_SECRET` (any long random text) is optional. Until `ADMIN_PASSWORD` is set the page stays locked (it only opens without a password on localhost, for testing).
Throughput is 425 t/day by default for everyone; only an admin can change it.
