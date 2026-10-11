# Arena Legends landing page

A static page (plain HTML, CSS and JS, no build) that shows off the game and sends
players to it: Play in browser, or Install for computer, Android or iPhone.

- The game's address lives in one place: `GAME_URL` at the top of `main.js`.
- Install on computer / Android opens the game with `?install`; the game then shows its
  own install box (`src/ui/install.ts`), because browsers only let a site install itself.
  iPhone has no install prompt, so the page shows Safari's Share > Add to Home Screen steps.
- Screenshots in `img/` are real captures of the game (1600px, plus `-sm` 800px versions).

## Deploy on Vercel

New project > import `jpcpais01/Arena-Legends` > set **Root Directory** to `landing`,
Framework Preset **Other**, leave Build Command and Output Directory empty. No ignored-build
step on purpose: a skip-when-unchanged check made Vercel skip the very first deploy (the
latest commit on main rarely touches this folder).

Preview locally: `npx serve landing`.
