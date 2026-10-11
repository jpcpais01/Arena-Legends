// Pixelify Sans draws its 5 like an S and its 2 like a Z, so prices, gem counts,
// levels and room codes misread on a phone. The pixel face keeps its letters but
// takes its digits from Rubik: 'AL Digits' covers only 0-9 and sits first in
// --font-pixel, so the browser uses it for digits and Pixelify for everything else.
// The file is the same Rubik 700 the UI text already loads (one download).
import rubikBold from '@fontsource/rubik/files/rubik-latin-700-normal.woff2?url';

export function installDigits(): void {
  try {
    const face = new FontFace('AL Digits', `url(${rubikBold}) format('woff2')`, { unicodeRange: 'U+0030-0039', weight: '100 900' });
    document.fonts.add(face);
    void face.load().catch(() => {});
  } catch { /* old browser: Pixelify digits stay */ }
}
