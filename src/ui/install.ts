import { h } from './dom';
import { icon } from './icons';

// One-tap install for players sent here by the landing page (?install).
//
// A page on another site can't install this PWA: the browser only offers its install
// prompt (beforeinstallprompt) to the app's own origin. So the landing page's Install
// buttons open the game with ?install and this card finishes the job here: the browser's
// own prompt when it has one (Chrome, Edge, Samsung Internet), otherwise the steps for
// this device (iPhone Safari's Share > Add to Home Screen, Firefox, a prompt that never
// came). Without ?install nothing changes: the browser keeps its usual install hints.

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const isIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = (): boolean => /Android/i.test(navigator.userAgent);
const installed = (): boolean =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function manualSteps(): string {
  if (isIos()) return 'Tap the Share button (the square with an arrow) at the bottom of Safari, then "Add to Home Screen".';
  if (isAndroid()) return 'Open the browser menu (⋮) and tap "Install app" or "Add to Home screen".';
  if (/Firefox\//.test(navigator.userAgent)) return 'Firefox can\'t install web apps on computers. Open this page in Chrome or Edge and click Install there.';
  return 'Click the install icon at the right end of the address bar, or open the browser menu and choose "Install Arena Legends". Already installed? Open it from your apps.';
}

/** Shows the install card when the page was opened with ?install (and isn't the installed app already). */
export function setupInstall(parent: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  if (!params.has('install')) return;
  params.delete('install');
  const q = params.toString();
  history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  if (installed()) return;

  let prompt: InstallPrompt | null = null;
  let ready: (() => void) | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our card asks instead of the browser's mini bar
    prompt = e as InstallPrompt;
    ready?.();
  });
  window.addEventListener('appinstalled', () => done('Installed! Open Arena Legends from your home screen or app list.'));

  const text = h('p', null, 'Get the game as an app: its own icon, full screen, no browser bars.');
  const okBtn = h<HTMLButtonElement>('button.btn.primary', { onclick: () => void install() }, icon('down'), isIos() ? 'Show me how' : 'Install');
  const laterBtn = h<HTMLButtonElement>('button.btn', { onclick: () => close() }, 'Not now');
  const opts = h('div.opts', null, laterBtn, okBtn);
  // data-nofs: a tap here must not also go fullscreen (that would spend the tap's user gesture).
  const wrap: HTMLDivElement = h<HTMLDivElement>('div.sheet-wrap.confirm', { 'data-nofs': '', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div.sheet.plate', { role: 'dialog', 'aria-label': 'Install Arena Legends' },
      h('div.sheet-head', null, h('h2', null, 'Install Arena Legends')),
      h('div.sheet-body.confirm-body', null, text, opts)));
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') close();
  };
  function close(): void {
    window.removeEventListener('keydown', onKey, true);
    wrap.remove();
  }
  function done(msg: string): void {
    text.textContent = msg;
    okBtn.remove();
    laterBtn.textContent = 'OK';
  }
  async function install(): Promise<void> {
    if (!prompt && !isIos()) {
      // The browser may still be checking the app; a tap stays valid for a few seconds.
      okBtn.disabled = true;
      await new Promise<void>((res) => { ready = res; setTimeout(res, 1500); });
      okBtn.disabled = false;
    }
    const p = prompt as InstallPrompt | null;
    if (!p) { done(manualSteps()); return; }
    prompt = null; // a prompt can be shown only once
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') done('Installing... Open Arena Legends from your home screen or app list.');
  }

  window.addEventListener('keydown', onKey, true);
  parent.appendChild(wrap);
}
