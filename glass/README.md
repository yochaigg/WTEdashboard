# Central Orbit gas console (glass factory version)

Same plant and dashboard, but the cleaned syngas is piped to a glass factory and burned in its furnace instead of natural gas.
No engines and no grid sales. Syngas is sold per MWh of heat at a discount (default 25 %) to the natural gas price.

Deploy: Cloudflare Workers with static assets, directory `./public` (worker name `wte-glass-dashboard`).
Settings are stored in the browser under `wtg_` keys, separate from the power version.
