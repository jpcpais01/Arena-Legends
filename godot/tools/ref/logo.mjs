// Bakes the web game's logo (src/ui/logo.ts) to godot/assets/ui/logo.png.
// Run the web dev server first (npm run dev -- --port 5199), then:
//   node godot/tools/ref/logo.mjs   (needs Playwright with Chromium)
import { chromium } from 'playwright';
import fs from 'node:fs';

const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5199/');
await p.waitForTimeout(3000);
const url = await p.evaluate(async () => {
  const m = await import('/src/ui/logo.ts');
  return (await m.drawLogo()).toDataURL();
});
fs.writeFileSync(new URL('../../assets/ui/logo.png', import.meta.url), Buffer.from(url.split(',')[1], 'base64'));
await b.close();
