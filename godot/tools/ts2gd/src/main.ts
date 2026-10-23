import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config';
import { Converter } from './emit';

/**
 * Converts the configured web-game modules (and everything they import) to
 * GDScript under godot/gen/. Usage: npm run convert [-- --only mod/path].
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const srcRoot = path.join(repo, 'src');
const outRoot = path.join(repo, 'godot/gen');

const files = new Set<string>();
const program0 = ts.createProgram(CONFIG.entries.map((e) => path.join(srcRoot, e + '.ts')), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true, skipLibCheck: true, noEmit: true, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [],
});
const conv = new Converter(program0, srcRoot);

// Module closure: entries plus imports, stopping at hand-written modules.
const queue = CONFIG.entries.map((e) => path.join(srcRoot, e + '.ts'));
while (queue.length) {
  const f = queue.shift()!;
  if (files.has(f)) continue;
  const mod = conv.modPath(f);
  if (CONFIG.manual[mod]) continue;
  files.add(f);
  const sf = program0.getSourceFile(f);
  if (!sf) { console.error('missing', f); continue; }
  for (const st of sf.statements) {
    if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      if (ts.isImportDeclaration(st) && st.importClause?.isTypeOnly) continue;
      const spec = st.moduleSpecifier.text;
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(f), spec) + '.ts';
      const idx = path.resolve(path.dirname(f), spec, 'index.ts');
      queue.push(fs.existsSync(target) ? target : idx);
    }
  }
}

const sfs = [...files].map((f) => program0.getSourceFile(f)!).filter(Boolean);
for (const sf of sfs) conv.analyze(sf);
// Register class names in a stable order.
for (const sf of [...sfs].sort((a, b) => a.fileName.localeCompare(b.fileName))) conv.classFor(conv.modPath(sf.fileName));

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const outs = [];
// Twins can be requested by later files: convert twice so every file sees the full set.
for (let pass = 0; pass < 2; pass++) {
  outs.length = 0;
  conv.problems.length = 0;
  for (const sf of sfs) {
    const mod = conv.modPath(sf.fileName);
    if (only && mod !== only) continue;
    outs.push(conv.convertFile(sf));
  }
}
fs.rmSync(outRoot, { recursive: true, force: true });
for (const o of outs) {
  const p = path.join(outRoot, o.file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let text = o.lines.join('\n');
  const patch = path.join(repo, 'godot/src/patches', o.file);
  if (fs.existsSync(patch)) text += '\n# --- hand-written (godot/src/patches/' + o.file + ') ---\n\n' + fs.readFileSync(patch, 'utf8');
  fs.writeFileSync(p, text);
}
const byFile = new Map<string, string[]>();
for (const p of conv.problems) {
  const k = p.file;
  if (!byFile.has(k)) byFile.set(k, []);
  byFile.get(k)!.push(`  ${p.line}: ${p.msg}`);
}
for (const [f, ps] of byFile) console.log(f + '\n' + ps.join('\n'));
console.log(`${outs.length} modules, ${conv.problems.length} problems, ${[...files].length} files in closure`);
