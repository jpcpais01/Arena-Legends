import type { GearId } from '../sim/types';
import { css, mix } from './pixel/color';
import { projSprite, skinDraws } from './projArt';
import { charmSprite, hawkSprite, hourglassSprite, wardSprite, whelpSprite, type HawkPose } from './specialArt';
import type { Sprite } from './sprite/bank';
import type { CharacterArt } from './sprite/look';

/**
 * The special items that ride along with a fighter, at rest: the ward stone's
 * orbit, the hourglass and the totem charm at the back shoulder, the hawk on
 * its perch, the whelp over the head, the wisp lantern and an epic core.
 * Battle animates their attacks itself; previews (Armory, creator) draw these
 * idle versions with `drawCompanions`, in the same spots battle uses.
 */

/** Body landmarks for a character's build, in px above the feet. */
export function bodyMarks(art: CharacterArt): { shPx: number; topPx: number; spread: number } {
  const b = art.body;
  const shPx = Math.round((b.footH + b.shin + b.thigh) * 0.94 + b.torso * 0.9);
  return { shPx, topPx: Math.round(shPx + b.neck + b.headRy * 2), spread: Math.round(b.shoulderSpread) };
}

function put(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip: boolean): void {
  if (!flip) { g.drawImage(s.img, x - s.ox, y - s.oy); return; }
  g.save();
  g.translate(x + 1, 0);
  g.scale(-1, 1);
  g.drawImage(s.img, -s.ox, y - s.oy);
  g.restore();
}

/**
 * Draws the idle companion of `special` around a fighter standing at (gx, gy),
 * facing `facing` (1 right, -1 left), `t` seconds into its loop. `layer` 'back'
 * goes before the body (the far half of the ward stone's orbit), 'front' after.
 * Returns where a legendary skin's sparkles should come from, if anywhere.
 */
export function drawCompanions(
  g: CanvasRenderingContext2D, art: CharacterArt, special: GearId | undefined,
  gx: number, gy: number, t: number, facing: number, layer: 'back' | 'front',
): [number, number] | null {
  if (!special) return null;
  const m = bodyMarks(art);
  const skin = art.specialSkinId;
  const flip = facing < 0;
  if (layer === 'front' && skinDraws('core', skin)) {
    // An epic core floats at the far shoulder, bobbing.
    const s = projSprite('core', Math.floor(t * 6), 0, skin);
    g.drawImage(s.img, gx - facing * 13 - s.ox, Math.round(gy - 56 + Math.sin(t * 2.4) * 1.5) - s.oy);
  }
  if (special === 'ward_stone') {
    const a = t * 2.2;
    if ((Math.sin(a) < 0) !== (layer === 'back')) return null;
    const x = Math.round(gx + Math.cos(a) * 13), y = Math.round(gy - m.shPx * 0.72 + Math.sin(a) * 3 + Math.sin(t * 3));
    if (layer === 'back') g.globalAlpha = 0.85;
    put(g, wardSprite(false, skin, Math.floor(t * 6)), x, y, false);
    g.globalAlpha = 1;
    return layer === 'front' ? [x, y] : null;
  }
  if (layer === 'back') return null;
  if (special === 'hourglass') {
    const x = gx - facing * 12, y = Math.round(gy - m.shPx - 4 + Math.sin(t * 2.2) * 1.5);
    put(g, hourglassSprite(Math.floor(t * 5), skin), x, y, false);
    return [x, y];
  }
  if (special === 'thunder_totem') {
    const x = gx - facing * 12, y = Math.round(gy - m.shPx - 6 + Math.sin(t * 2.6) * 1.5);
    put(g, charmSprite(skin), x, y, flip);
    return [x, y];
  }
  if (special === 'hunter_hawk') {
    // On the perch: looks about every few seconds, rouses its wings now and then.
    const x = gx - facing * (m.spread + 7), y = gy - m.shPx + 2;
    const k = t % 6;
    const pose: HawkPose = k > 5.5 ? (k > 5.75 ? 'down' : 'up') : k > 2.4 && k < 3.3 ? 'perch1' : 'perch0';
    put(g, hawkSprite(pose, skin), x, y, flip);
    return [x, y - 5];
  }
  if (special === 'dragon_whelp') {
    const x = gx - facing * 4, y = gy - m.topPx - 5 + Math.round(Math.sin(t * 4) * 1.5);
    put(g, whelpSprite(Math.floor(t * 7) & 1 ? 'hover1' : 'hover0', skin), x, y, flip);
    return [x, y];
  }
  if (special === 'wisp_lantern') {
    // The wisp lantern floats behind the shoulder.
    const fx = gx - facing * 16, fy = Math.round(gy - 67 + Math.sin(t * 3) * 2);
    if (skinDraws('lantern', skin)) {
      const s = projSprite('lantern', Math.floor(t * 6), 0, skin);
      g.drawImage(s.img, fx - s.ox, fy - s.oy);
      return [fx, fy];
    }
    const sk = art.specialSkin?.mats;
    const metal = sk?.lantern?.base ?? 0xc89a30, light = sk?.wisp?.base ?? 0x7ae8ff, hot = sk?.wispHot?.base ?? 0xf0ffff;
    g.fillStyle = css(metal); g.fillRect(fx - 2, fy - 4, 5, 1); g.fillRect(fx - 2, fy + 3, 5, 1); g.fillRect(fx, fy - 6, 1, 2);
    g.fillStyle = css(mix(metal, 0x1a0c08, 0.6)); g.fillRect(fx - 2, fy - 3, 1, 6); g.fillRect(fx + 2, fy - 3, 1, 6);
    g.fillStyle = css(light); g.fillRect(fx - 1, fy - 3, 3, 6);
    g.fillStyle = css(hot); g.fillRect(fx, fy - 1, 1, 2);
    return [fx, fy];
  }
  return null;
}
