# Two Paydays: notes for making changes

This repository is the source and the published build of **Two Paydays**, a household money planner installed as a
web app on the owner's Mac. GitHub Pages serves the repository root; the installed app updates itself from it.

## Privacy rules (the repository is public)

- **No personal data, ever.** The household's figures, names, employers, banks and places live only in the app's own
  storage on the owner's Mac and in backup files they keep. Never commit a backup (`two-paydays-backup-*.json`).
- **Keep the code generic.** Anything specific to the household belongs in their data, not in the code:
  auto-sort rules (`plan.rules`), house presets (`plan.calc.house.presets`), the household description used by
  "Ask Claude" (`plan.household.about`), account and pot names.

## Layout

- `index.html`, `sw.js`, `manifest.webmanifest`, `version.json`, `icons/`, `fonts/`: **build output** (the app). Don't edit by hand.
- `source/src/`: the planner, shared by both builds
  - `engine.js`: all money logic (pay splits, shared pools, pots, debts, cuts, projections, auto-sort, CSV import). Pure functions.
  - `core.js`: state, storage (claude.ai database online, `localStorage` key `tp:localdb` in the Mac app), formatting, helpers.
  - `charts.js`: hand-made SVG charts.
  - `ui1.js` … `ui4.js`: pages and components (Preact + htm, no build step). `head.html`: styles and theme tokens.
- `source/macapp/`: Mac app pieces: `release.json` (version + what's-new notes), `sw.template.js` (offline and
  update worker), `updates.js` (Update now button), `icons.js` + `icons/`.
- `source/vendor/`: htm + Preact standalone bundle. `source/fonts/`: Manrope and Bricolage Grotesque (OFL).
- `window.TP_APP` is set only in the Mac app build; code checks `APP` (core.js) for app-only behaviour
  (saving files to Downloads, backup reminders, version and updates).

## Build, test, release

```sh
python3 source/build.py            # build the Mac app into the repository root
python3 source/build.py --online   # also the single-page claude.ai version into source/online/ (not committed)
npm i playwright && npx playwright install chromium
node source/test_app.js            # install, offline, backup, update-with-data-kept, every page renders
```

To release: make the change, bump `version` and write plain-English `notes` in `source/macapp/release.json`, build,
run the test, then commit and push to `main`. GitHub Pages publishes within a minute or two; the installed app shows
**Update now** the next time it opens (or within a few hours). Never ship a release that needs the data reshaped
without code in `core.js`/`engine.js` that upgrades old data on load: people's data stays in their app across updates.

## Data model (short)

- `config/plan`: members, accounts, categories (budgets; `payer` is a member id or a shared pool id), pots, plan lines
  (monthly transfers into pots), debts, rules, calculator settings. Shared pools: `plan.joint` (the joint account) and
  `plan.pools.<id>` (e.g. a grocery pot), each with its own split (`proportional`, `equal`, `fixed`, `remainder`).
- `months/YYYY-MM`: pay received, transactions, ticks (transfers marked done), one-month changes, budget moves, notes.
- `config/checklist`: the setup to-do list.
