# Arena Legends

A 1v1 auto-battler in pixel art. Build one fighter (name, species, body form,
colours, six gear slots) and watch the adaptive AI duel.

## Run

```
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build (dist/, with PWA service worker)
npm test           # sim, AI and patch-notes tests
npm run sim        # balance report: thousands of AI duels, win rates per form and item
```

## How it fits together

- `src/sim`: deterministic battle at a fixed 60 Hz (seeded RNG), gear catalog,
  AI brains with look-ahead. Knows nothing about drawing.
- `src/render/pixel`: the rasterizer (SDF shapes, materials with lit/shade ramps,
  ink outlines) that every sprite, icon and effect is drawn with. No image files.
- `src/render/sprite`: rig, poses, the body/outfit/weapon drawing, animation
  clips (`anims.ts`), the animator that maps sim state to frames, and a lazy
  sprite bank.
- `src/render/arenaArt.ts` + `arena.ts`: parallax layers and the perspective floor.
- `src/render/battleView.ts`: steps the sim, interpolates, draws everything into a
  low-res buffer that `screen.ts` blits at an integer scale.
- `src/ui`: DOM menus, creator, gear picker, HUD, results, patch notes.

Dev previews (PNG sheets of animations, arenas, icons) live in `scripts/` and run
with `npx vitest run --config vitest.scripts.config.ts scripts/<name>.test.ts`.
`scripts/appicon.test.ts` regenerates the PWA icons in `public/icons`.

Every merge to main bumps `package.json` and adds a player-facing entry to
`src/patchnotes.ts`.
