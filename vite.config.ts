import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Shown small in the bottom-left corner: package version plus the short commit,
// so a glance tells which build a device is running. Vercel builds have no .git,
// but they provide the commit in VERCEL_GIT_COMMIT_SHA.
function buildVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!sha) {
    try { sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
  }
  return sha ? `v${pkg.version} · ${sha.slice(0, 7)}` : `v${pkg.version}`;
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    target: 'es2022',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Arena Legends',
        short_name: 'Arena Legends',
        description: 'Pixel-art 1v1 auto battler: build a fighter, then watch the adaptive AI duel.',
        theme_color: '#120c1a',
        background_color: '#120c1a',
        id: '/',
        // Standalone with no orientation: on Xiaomi (HyperOS/MIUI) a WebAPK installed
        // with display "fullscreen" or any fixed orientation never launches. The game
        // goes fullscreen and locks landscape itself on a tap (src/ui/fullscreen.ts).
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
