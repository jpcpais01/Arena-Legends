import { it } from 'vitest';
import { GEAR_SLOTS, gearIdsFor } from '../src/sim/gear';
import { iconFrame } from '../src/render/icons';
import { pack } from '../src/render/pixel/color';
import { Sheet, writePng } from './png';

/** Dev preview: every gear icon, one slot per row. */
it('gear icons', () => {
  const cell = 44;
  const sheet = new Sheet(10 * cell, GEAR_SLOTS.length * cell, pack(0x2a2236));
  GEAR_SLOTS.forEach((slot, row) => {
    gearIdsFor(slot).forEach((id, i) => {
      const f = iconFrame(id);
      sheet.blit(f.data, f.w, f.h, i * cell + Math.floor((cell - f.w) / 2), row * cell + Math.floor((cell - f.h) / 2));
    });
  });
  writePng(process.env.OUT ?? '/tmp/icons.png', sheet.w, sheet.h, sheet.data, 3);
});
