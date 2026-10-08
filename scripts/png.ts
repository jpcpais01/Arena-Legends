import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

/** Minimal RGBA PNG writer for dev previews. `data` is ImageData-layout Uint32 (0xAABBGGRR). */
export function writePng(path: string, w: number, h: number, data: Uint32Array, scale = 1, bg = 0): void {
  const W = w * scale, H = h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      let c = data[Math.floor(y / scale) * w + Math.floor(x / scale)];
      if (!(c >>> 24)) c = bg;
      const o = y * (W * 4 + 1) + 1 + x * 4;
      raw[o] = c & 255; raw[o + 1] = (c >>> 8) & 255; raw[o + 2] = (c >>> 16) & 255; raw[o + 3] = c >>> 24;
    }
  }
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (b: Buffer) => {
    let c = -1;
    for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type), body]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

/** Packs frames side by side onto one sheet. */
export class Sheet {
  readonly data: Uint32Array;
  constructor(readonly w: number, readonly h: number, bg = 0) {
    this.data = new Uint32Array(w * h).fill(bg);
  }
  blit(src: Uint32Array, sw: number, sh: number, dx: number, dy: number): void {
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const c = src[y * sw + x];
      if (!(c >>> 24)) continue;
      const X = dx + x, Y = dy + y;
      if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
      this.data[Y * this.w + X] = c;
    }
  }
}
