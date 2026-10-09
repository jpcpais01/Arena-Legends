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
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap', { onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate.notes-sheet', { role: 'dialog', 'aria-label': 'Patch notes', style: { width: 'min(640px, 100%)' } },
      h('div.sheet-head', null, h('h2', null, 'Patch notes'),
        h('button.btn.icon', { title: 'Close', 'aria-label': 'Close', onclick: close }, icon('close'))),
      h('div.sheet-body.notes-body', null,
        ...PATCH_NOTES.map((n) => h('section.note', null,
          h('div.note-head', null, h('span.note-ver', null, 'v' + n.version), h('b', null, n.title), h('span.note-date', null, formatDate(n.date))),
          h('ul', null, ...n.notes.map((t) => h('li', null, t))),
        ))),
    ),
  );
  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
}
