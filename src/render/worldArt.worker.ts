// Paints the region map off the main thread (it takes the better part of a
// second on a phone) and hands the pixels back without copying them.
import { paintSunhaven } from './worldArt';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(m: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = () => {
  const a = paintSunhaven();
  const pix = [a.base, a.waves, a.isle, ...a.clouds];
  ctx.postMessage({
    w: a.w, h: a.h, isleAt: a.isleAt,
    layers: pix.map((p) => ({ w: p.w, h: p.h, buf: p.data.buffer })),
  }, pix.map((p) => p.data.buffer));
};
