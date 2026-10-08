// Crisp pixel art in the DOM: a canvas is shown at a whole number of device
// pixels per art pixel, so no pixel ends up wider than its neighbour (Windows
// display scaling at 125-150% and phones at 2.75x would smear it otherwise).

/** CSS size for `art` pixels shown about `css` CSS pixels wide, rounded to a whole device-pixel scale. */
export function pxSize(art: number, css: number): number {
  const dpr = window.devicePixelRatio || 1;
  const s = Math.max(1, Math.round((css * dpr) / art));
  return (art * s) / dpr;
}

const boxes = new Map<Element, HTMLCanvasElement>();
let ro: ResizeObserver | null = null;

function apply(box: Element, c: HTMLCanvasElement): void {
  const r = box.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  const s = Math.max(1, Math.floor(Math.min((r.width * dpr) / c.width, (r.height * dpr) / c.height)));
  c.style.width = `${(c.width * s) / dpr}px`;
  c.style.height = `${(c.height * s) / dpr}px`;
}

/**
 * Keeps `canvas` as large as fits inside `box` at a whole device-pixel scale.
 * The box should be sized by the layout (not by the canvas). Call the returned
 * function when the canvas goes away.
 */
export function fitPixels(canvas: HTMLCanvasElement, box: HTMLElement): () => void {
  ro ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const c = boxes.get(e.target);
      if (c) apply(e.target, c);
    }
  });
  boxes.set(box, canvas);
  ro.observe(box);
  return () => {
    boxes.delete(box);
    ro?.unobserve(box);
  };
}
