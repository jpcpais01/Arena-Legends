import type { AbilityDef } from '../sim/types';
import { mix } from './pixel/color';
import type { CharacterArt } from './sprite/look';
import type { SkinArt } from './sprite/skins';

/**
 * Super attacks: the main weapon's skill and the special item's big moves
 * (meteor, phantom flurry, totem). Render-side only, the sim never reads it.
 * Each one has an element that picks its charge-up, release and impact
 * effects and sounds, and a colour pair (the weapon or item skin's own
 * colours when it has them).
 */
export type SuperElement = 'steel' | 'fire' | 'storm' | 'arcane' | 'soul' | 'venom' | 'earth' | 'wind';

export interface SuperLook {
  name: string;
  /** Item ultimates get the full-screen treatment; weapon skills a side callout. */
  ult: boolean;
  el: SuperElement;
  hi: number;
  lo: number;
  /** Particle shape for its sparks: the weapon skin's own (flames, petals, snowflakes) or the element's. */
  kind: 'twinkle' | 'flame' | 'petal' | 'flake';
}

const LOOKS: Record<string, [SuperElement, number, number]> = {
  rising_cleave: ['steel', 0xe8f0ff, 0x5a7ac8],
  iaido: ['wind', 0xf5f8ff, 0x6ab8f0],
  skull_crack: ['earth', 0xffe08a, 0xb07a20],
  venom_flurry: ['venom', 0xc8ff6a, 0x2a9a3a],
  flame_wave: ['fire', 0xffe070, 0xe0401a],
  ground_slam: ['earth', 0xf0d098, 0x9a6a3a],
  skewer: ['steel', 0xf8f0b0, 0xa08a2a],
  whirlwind: ['wind', 0xffe0d0, 0xd04a3a],
  hex_orb: ['arcane', 0xe8c0ff, 0x8a3ae8],
  power_shot: ['wind', 0xfff0c0, 0xd08a3a],
  chain_hook: ['steel', 0xe0e8f0, 0x5a6a80],
  grave_harvest: ['soul', 0xb0ffd8, 0x1a9a7a],
  fleche: ['steel', 0xffffff, 0xd0a040],
  thunderclap: ['storm', 0xe0f8ff, 0x3aa8ff],
  crescent_chop: ['steel', 0xf0f4ff, 0x7a8ac8],
  bone_spikes: ['soul', 0xf0e8d0, 0x7ac860],
  meteor: ['fire', 0xffe070, 0xd8301a],
  phantom_flurry: ['arcane', 0xd8e8ff, 0x5a7aff],
  thunder_totem: ['storm', 0xe0f8ff, 0x3aa8ff],
};

/** True for the moves that get the super treatment. */
export function isSuper(ab: AbilityDef): boolean {
  return ab.slot === 'skill' || (ab.slot === 'item' && (ab.kind === 'meteor' || ab.kind === 'blade' || ab.kind === 'totem'));
}

const cache = new WeakMap<CharacterArt, Map<string, SuperLook>>();

/** How a fighter's super looks: its name, element and colours (skinned when the gear is). */
export function superLook(ab: AbilityDef, art: CharacterArt | undefined): SuperLook {
  let m = art && cache.get(art);
  const hit = m?.get(ab.id);
  if (hit) return hit;
  const [el, hi0, lo0] = LOOKS[ab.id] ?? ['steel', 0xffffff, 0xc8a050];
  const ult = ab.slot === 'item';
  // Any skinned weapon or special item brings its own colours.
  const skin = ult ? art?.specialSkin?.glow : skinColours(art?.mainSkin);
  const skinKind = ult ? art?.specialSkin?.fx?.kind : art?.mainSkin?.fx?.kind;
  const look: SuperLook = { name: ab.name, ult, el, hi: skin?.[0] ?? hi0, lo: skin?.[1] ?? lo0, kind: skinKind ?? (el === 'fire' ? 'flame' : 'twinkle') };
  if (art) {
    if (!m) cache.set(art, (m = new Map()));
    m.set(ab.id, look);
  }
  return look;
}

/**
 * A weapon skin's colours for its super: a legendary or epic skin's sparks,
 * a mythic one's trail, or for a rare one (colours only) its glowing
 * material, else its brightest polished one.
 */
export function skinColours(skin: SkinArt | null | undefined): [number, number] | undefined {
  if (!skin) return undefined;
  if (skin.fx) return [skin.fx.spark, skin.fx.spark2];
  if (skin.trail) return skin.trail;
  const mats = Object.values(skin.mats ?? {});
  const glow = mats.find((m) => m.glow);
  if (glow) return [mix(glow.base, 0xffffff, 0.3), mix(glow.base, 0x101020, 0.25)];
  const shiny = mats.filter((m) => m.shiny).sort((a, b) => luma(b.base) - luma(a.base)).at(0);
  return shiny ? [mix(shiny.base, 0xffffff, 0.45), mix(shiny.base, 0x101020, 0.2)] : undefined;
}

function luma(c: number): number {
  return ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
}
