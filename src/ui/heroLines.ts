import type { SpeciesId } from '../character/appearance';
import type { FightStyleId } from '../sim/styles';
import type { FormId } from '../sim/types';

// What the hero says on the creator stage when you pick something: a little
// personality for every choice. Flavour only.

export const SPECIES_LINE: Record<SpeciesId, string> = {
  human: 'Just me, my scarf and my nerve.',
  imp: 'Heh. Horns AND wings.',
  myco: 'I grew into this.',
  ogrin: 'Ogrin smash. Politely.',
  wisp: "Don't blow me out.",
  golem: 'Solid choice.',
};

export const FORM_LINE: Record<FormId, string> = {
  robust: 'Built like a wall.',
  agile: 'Catch me if you can!',
  balanced: 'A bit of everything.',
  slender: 'Long arms, short temper.',
  mighty: 'Feel that power!',
  ethereal: 'Half here, half not.',
  stout: 'Low and unstoppable.',
  feral: 'Grrrah!',
  titan: 'The ground shakes when I walk.',
};

/** A battle cry per fighting style, shown big on the Style step too. */
export const STYLE_LINE: Record<FightStyleId, string> = {
  balanced: 'I read the fight, then I win it.',
  relentless: 'No breaks. No mercy.',
  tactician: 'Patience. Then the perfect strike.',
  skirmisher: 'Hit, vanish, hit again.',
  guardian: 'Go on. Break my guard.',
};

export const LOOK_LINES = ['Looking sharp.', 'Oh, I like that.', 'Fresh!', "That's my colour.", 'Fierce.', 'Dressed to win.', 'Yes. This is me.'];

export const BACKDROP_LINES = ['Home sweet home.', 'What a view.', 'My kind of place.', 'Paint me like this.'];

export const STAT_LINES = ['Feel the gains!', 'Stronger already.', 'Training pays off.', 'One more rep!'];

export const pickLine = (lines: readonly string[]) => lines[Math.floor(Math.random() * lines.length)];
