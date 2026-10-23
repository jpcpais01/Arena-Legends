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
  - `patches/`: hand-written replacements and additions merged into generated
    modules (ignored by Godot itself, see below).
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

The simulation must stay identical to the web's (every reference battle replays
tick for tick), and arenas paint pixel for pixel the same.
