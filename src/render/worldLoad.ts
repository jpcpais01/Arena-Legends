// The region map as canvases, painted once per session: in a worker when the
// browser has them, else on the main thread. `loadWorld()` can be called early
// (the menu warms it up when idle) so the map is ready when the World opens.

export interface WorldCanvases {
  w: number;
  h: number;
  base: HTMLCanvasElement;
  waves: HTMLCanvasElement;
  isle: HTMLCanvasElement;
  isleAt: { x: number; y: number };
  clouds: HTMLCanvasElement[];
}

interface Layer { w: number; h: number; buf: ArrayBuffer }
interface Painted { w: number; h: number; isleAt: { x: number; y: number }; layers: Layer[] }

let pending: Promise<WorldCanvases> | null = null;

export function loadWorld(): Promise<WorldCanvases> {
  pending ??= offThread().catch(onThread).then(toCanvases);
  pending.catch(() => { pending = null; });
  return pending;
}

function offThread(): Promise<Painted> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') { reject(new Error('no workers')); return; }
    const w = new Worker(new URL('./worldArt.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { w.terminate(); resolve(e.data as Painted); };
    w.onerror = (e) => { w.terminate(); reject(e); };
    w.postMessage(0);
  });
}

async function onThread(): Promise<Painted> {
  const { paintSunhaven } = await import('./worldArt');
  const a = paintSunhaven();
  return { w: a.w, h: a.h, isleAt: a.isleAt, layers: [a.base, a.waves, a.isle, ...a.clouds].map((p) => ({ w: p.w, h: p.h, buf: p.data.buffer as ArrayBuffer })) };
}

function toCanvases(p: Painted): WorldCanvases {
  const cv = (l: Layer) => {
    const c = document.createElement('canvas');
    c.width = l.w;
    c.height = l.h;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(l.buf), l.w, l.h), 0, 0);
    return c;
  };
  const [base, waves, isle, ...clouds] = p.layers.map(cv);
  return { w: p.w, h: p.h, base, waves, isle, isleAt: p.isleAt, clouds };
}
