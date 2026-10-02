# Central Orbit plant console

Waste to energy plant dashboard (simulated data), served as static files.
Deploy: Cloudflare Workers with static assets, directory `./public`.

## Pages
Operations: Plant (animated schematic), Event log, Alarm rules, Maintenance, Shift handover
Materials: Suppliers, Mass and energy
Business: Finance, What-if, Grid export, Carbon credits, Impact
Company: Sites, Ask the plant

## Files
- `public/index.html` page shell and navigation
- `public/assets/sim.js` plant simulator (deterministic), alert rules, drops, events
- `public/assets/core.js` charts, plant, carbon, events, analysis, truck and audit modals
- `public/assets/ops.js` schematic, maintenance, shifts, suppliers, mass and energy
- `public/assets/business.js` finance, what-if, grid export, impact
- `public/assets/platform.js` roles, alarm rules and notifications, sites, ask the plant, app install
- `public/manifest.webmanifest`, `public/sw.js` installable app (phone or desktop)

All prices, costs, factors and maintenance intervals are placeholders, editable in the app and saved in the browser.
