import { h } from './dom';
import { logo } from './logo';
import { fitPixels } from './pixelfit';

/**
 * Title screen over the live arena: the logo, a ribbon and a blinking
 * "Tap to start". Any tap or key starts the game.
 */
export class TitleScreen {
  readonly el: HTMLElement;
  private done = false;

  constructor(onStart: () => void) {
    const art = h('div.title-logo');
    let unfit = () => {};
    void logo().then((c) => { art.append(c); unfit = fitPixels(c, art); });
    const start = () => {
      if (this.done) return;
      this.done = true;
      window.removeEventListener('keydown', onKey);
      this.el.classList.add('out');
      onStart();
      setTimeout(() => { unfit(); this.el.remove(); }, 400);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); start(); }
    };
    window.addEventListener('keydown', onKey);
    this.el = h('div.title', { role: 'button', 'aria-label': 'Tap to start', onclick: start },
      h('div.title-main', null,
        art,
        h('div.ribbon.title-ribbon', null, h('span', null, '1v1 Auto Battler'))),
      h('div.title-start', null, h('span', null, 'Tap to start')),
    );
  }
}
