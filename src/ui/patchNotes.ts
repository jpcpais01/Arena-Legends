// The version label in the corner and the patch notes sheet its button opens.
import { sfx } from '../audio/sfx';
import { PATCH_NOTES } from '../patchnotes';
import { h, save, store } from './dom';
import { icon } from './icons';

const SEEN_KEY = 'al.notesSeen';

/** Version text plus a notes button; a dot marks a version the player hasn't read about. */
export function versionBadge(label: string, parent: () => HTMLElement): HTMLElement {
  const latest = PATCH_NOTES[0].version;
  const btn = h<HTMLButtonElement>('button.btn.icon', {
    title: 'Patch notes', 'aria-label': 'Patch notes',
    onclick: () => {
      sfx.play('ui');
      save(SEEN_KEY, latest);
      btn.classList.remove('unseen');
      openPatchNotes(parent());
    },
  }, icon('notes'));
  if (store<string>(SEEN_KEY, '') !== latest) btn.classList.add('unseen');
  const refresh = h<HTMLButtonElement>('button.btn.icon', {
    title: 'Check for updates', 'aria-label': 'Check for updates',
    onclick: () => {
      sfx.play('ui');
      refresh.disabled = true;
      refresh.classList.add('spin');
      void reloadLatest();
    },
  }, icon('refresh'));
  return h('div.version', null, btn, refresh, h('span', null, label));
}

/** Asks the service worker for the newest deploy, lets it take over, then reloads.
 *  A plain reload of an installed PWA can be answered from the old cache. */
async function reloadLatest(): Promise<void> {
  try {
    const reg = await withTimeout(navigator.serviceWorker?.getRegistration(), 2000);
    if (reg) {
      await withTimeout(reg.update(), 5000);
      const fresh = reg.installing ?? reg.waiting;
      if (fresh) {
        const swapped = new Promise<void>((done) => navigator.serviceWorker.addEventListener('controllerchange', () => done(), { once: true }));
        fresh.postMessage({ type: 'SKIP_WAITING' });
        await withTimeout(swapped, 8000);
      }
    }
  } catch { /* offline or no service worker: a plain reload still helps */ }
  location.reload();
}

function withTimeout<T>(p: Promise<T> | undefined, ms: number): Promise<T | undefined> {
  return Promise.race([p ?? Promise.resolve(undefined), new Promise<undefined>((r) => setTimeout(r, ms))]);
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function openPatchNotes(parent: HTMLElement): void {
  if (parent.querySelector('.notes-sheet')) return;
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') close();
  };
  const close = () => {
    sfx.play('ui');
    window.removeEventListener('keydown', onKey, true);
    wrap.remove();
  };
  // Wide screens get an index of versions beside the notes: tap one to jump to it.
  const sections = PATCH_NOTES.map((n) => h('section.note', null,
    h('div.note-head', null, h('span.note-ver', null, 'v' + n.version), h('b', null, n.title), h('span.note-date', null, formatDate(n.date))),
    h('ul', null, ...n.notes.map((t) => h('li', null, t))),
  ));
  const body = h('div.sheet-body.notes-body', null, ...sections);
  const links = PATCH_NOTES.map((n, i) => h<HTMLButtonElement>(`button.notes-link${i ? '' : '.on'}`, {
    onclick: () => { sfx.play('select'); body.scrollTo({ top: sections[i].offsetTop - 6 }); },
  }, h('b', null, 'v' + n.version), h('span', null, n.title)));
  let on = 0;
  body.addEventListener('scroll', () => {
    const y = body.scrollTop + 24;
    let i = sections.findIndex((el) => el.offsetTop + el.offsetHeight > y);
    if (i < 0) i = sections.length - 1;
    if (i === on) return;
    links[on].classList.remove('on');
    links[i].classList.add('on');
    on = i;
    links[i].scrollIntoView({ block: 'nearest' });
  }, { passive: true });
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate.notes-sheet', { role: 'dialog', 'aria-label': 'Patch notes' },
      h('div.sheet-head', null, h('h2', null, 'Patch notes'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
      h('div.notes-panes', null, h('nav.notes-index', { 'aria-label': 'Versions' }, ...links), body),
    ),
  );
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
}
