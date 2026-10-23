# Arena Legends for Android (Godot 4)

The native Android version of the game: Godot 4.7, GDScript, Mobile renderer
(Vulkan). CI (`.github/workflows/android.yml`) exports a signed arm64 APK on
every pull request that touches `godot/`, and publishes it as the GitHub
release `android-v<version>` on every push to main.

## Layout

- `gen/`: GDScript generated from the web game's TypeScript (simulation,
  adaptive AI, sprite art, arenas, effects, battle view). Never edit by hand;
  regenerate instead.
- `src/`: hand-written engine code.
  - `ts/ts.gd`: the small JS runtime the generated code calls (`TS.*`).
  - `core/canvas2d.gd`: the canvas the converted drawing code paints on. `Gpu`
    turns draw calls into RenderingServer canvas items in four layers (world,
    over, back/sky, atop); `Cpu` paints offscreen pixel buffers.
  - `art/`: the GPU sprite forge (`forge.gd` + compute shaders), op-stream
    raster (`px_raster.gd`) and the sprite bank (frames recorded on a worker,
    baked as one atlas).
  - `battle/`: `screen.gd` composites the layers (sky, light shafts) and scales
    the art pixels to the screen; `feed.gd` runs the simulation on its own
    thread ahead of the picture; `hud.gd`; `battle_scene.gd` ties a match
    together.
  - `render/arena_cache.gd`: painted arenas kept in memory and on disk
    (`user://arenas`), painted ahead on a worker.
  - `boot/game.gd`: the game's flow (title, home, fights, results, sheets)
    and the saved state it touches (hero, rival, record, gems, XP, settings,
    all in `Store`, the web's localStorage keys).
  - `ui/`: the menus, drawn in device pixels to match the web's phone
    landscape CSS. `ui.gd` is the kit: the rem/px scale (`UI.r`, `UI.c`,
    `UI.px` device pixels per art pixel), palette, fonts (Rubik; Pixelify Sans
    with Rubik digits via `pixel-*.woff2`), pixel frames, bevels, glyphs,
    logo and portrait backdrops. The pixel fonts carry no digits, so Rubik's
    show instead (the web's 'AL Digits'). `px_button.gd` is the web's `.btn`;
    `rich.gd` lays out mixed-style wrapped text for custom-drawn pieces;
    `sheet.gd` the modal sheet the settings, notes, results, loadouts and
    confirm popups build on; `armory.gd` the Armory (a full screen over the
    arena, which `BattleScene.freeze` stops rendering while it's covered);
    `creator.gd` the hero creator (new hero or editing, its reveal, the Stats
    step); `scroll_view.gd` a custom-drawn scroller; `fighter_preview.gd` a
    hero in a little stage (a `Canvas2D.Gpu` inside a Control) that also plays
    entrances, finishers and victory poses; `portraits.gd` the still hero
    portraits on pick cards (a few drawn per frame, one forge job each);
    `gear_icons.gd` bakes item icons on the GPU, batched per frame.
    The Shop: `shop_screen.gd` (featured set, shelves), `gacha_screen.gd` the
    base of `chest_screen.gd` and `forge_screen.gd` (the scene, the panel, the
    reveal and its cards), `shop_kit.gd` the shared pieces (Shop header, price
    buttons, cards, tier banner), `promo_sheet.gd` the code popup with its own
    keyboard. `UI.short()` is the web's short landscape query (a phone held
    sideways), which tightens a few panels.
  - `fx/scene_gl.gd`: the chest and Forge scenes' display (the web's GlFx for
    those canvases: light, bloom and grade in one shader pass).
  - `core/account.gd`: accounts stand-in until online play is ported.
  - `patches/`: hand-written replacements and additions merged into generated
    modules (ignored by Godot itself, see below).
- `assets/`: fonts (OFL) and the baked logo (`tools/ref/logo.mjs`).
- `tools/ts2gd/`: the TypeScript → GDScript converter. `tools/ref/`: scripts that
  dump reference data from the web code for the tests.
- `test/`: headless checks and tools (see below).

## Regenerating `gen/`

    cd godot/tools/ts2gd && npm ci && npx tsx src/main.ts

`src/config.ts` lists the entry modules, hand-written (manual) modules, and
what to skip or rename. A patch file `src/patches/<module>.gd` is appended to
that module; `src/patches/<module>.<Class>.gd` goes inside that class. Skip a
function or `Class.method` in the config and write it in a patch to replace it
(the per-pixel paint helpers, `buildArena`, the jobless sprite bakes).

## Checks

    G=/path/to/Godot_v4.7.2-stable_linux.x86_64
    $G --headless --path godot --import
    $G --headless --path godot -s res://test/compile_check.gd
    # Simulation vs the web: trace from tools/ref/simtrace.ts
    $G --headless --path godot -s res://test/sim_test.gd -- /tmp/simtrace.json
    # Arena pixels vs the web: reference from tools/ref/arenadump.ts
    $G --headless --path godot -s res://test/arena_dump.gd -- OUT isle
    # Screenshots of a running battle (needs a GPU or xvfb + lavapipe)
    xvfb-run $G --path godot --rendering-driver vulkan --rendering-method mobile \
      --resolution 1600x720 -s res://test/battle_shot.gd -- OUT SEED ARENA 6 12
    # Screenshots of the menus: title, home, settings, notes, Armory, loadouts, a fight, results
    xvfb-run $G --path godot --rendering-driver vulkan --rendering-method mobile \
      --resolution 1600x720 -s res://test/ui_shot.gd -- OUT
    # ...or a first start through the hero creator (clears the saved hero)
    xvfb-run $G --path godot --rendering-driver vulkan --rendering-method mobile \
      --resolution 1600x720 -s res://test/ui_shot.gd -- OUT creator
    # ...or the Shop: offers, promo code, a Mythic chest pull, Open 10, the Forge
    xvfb-run $G --path godot --rendering-driver vulkan --rendering-method mobile \
      --resolution 1600x720 -s res://test/ui_shot.gd -- OUT shop

The simulation must stay identical to the web's (every reference battle replays
tick for tick), and arenas paint pixel for pixel the same.
