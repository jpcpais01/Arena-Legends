/**
 * What gets converted and how. Paths are module paths relative to the web
 * game's src/ folder, without the .ts extension.
 */
export interface ManualModule {
  /** class_name of the hand-written GDScript that implements this module's exports. */
  cls: string;
}

export interface Config {
  /** Modules to convert; their imports are followed (except manual ones). */
  entries: string[];
  /** Modules implemented by hand in GDScript (same exported names, snake_case). */
  manual: Record<string, ManualModule>;
  /** Functions not emitted because a hand-written version lives in the module's patch file. */
  skip: Record<string, string[]>;
  /**
   * TS interfaces that are classes on the GDScript side (member access with
   * `.`, `X.new()` instead of dictionaries). Value: the GDScript class.
   */
  classTypes: Record<string, string>;
}

export const CONFIG: Config = {
  entries: [
    'render/sprite/draw',
    'render/sprite/look',
    'render/sprite/anims',
    'render/sprite/animator',
    'render/sprite/winPoses',
    'sim/battle',
    'sim/headless',
    'sim/loadout',
    'sim/training',
    'sim/ai/brain',
    'sim/ai/opponent',
    'character/skins',
    'character/collection',
    'character/appearance',
    'character/finales',
    'character/entrances',
  ],
  manual: {
    'render/pixel/raster': { cls: 'PixelRaster' },
    'render/pixel/sdf': { cls: 'PixelSdf' },
    'render/pixel/paint': { cls: 'PixelPaint' },
  },
  skip: {
    'render/sprite/draw': ['blendShapes', 'drawSmear', 'drawRing', 'hairCap', 'above'],
    'render/sprite/weaponKit': ['clearShape'],
    'core/rng': ['randomSeed'],
    'sim/battle': ['isPlain'],
    'render/sprite/skins/corsair': ['along'],
  },
  classTypes: {
    'render/pixel/sdf:Shape': 'PixelSdf.Shape',
    'render/pixel/raster:Raster': 'PixelRaster.Raster',
  },
};
