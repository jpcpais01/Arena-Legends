import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';
import { CONFIG } from './config';
import { ident, pascal } from './names';

const HOST_TYPES = new Set(['CanvasRenderingContext2D', 'HTMLCanvasElement', 'CanvasGradient', 'ImageData', 'OffscreenCanvas', 'CanvasImageSource']);

/**
 * TypeScript → GDScript converter for the web game's art library and sim.
 *
 * Each TS module becomes one GDScript file with a `class_name`; its
 * functions become static funcs, module values static vars, classes inner
 * classes, object literals Dictionaries and arrow functions lambdas. The
 * type checker drives the details JS and GDScript disagree on: truthiness of
 * objects, `/` on integers, `.call()` on function values, which property
 * reads may be missing, and which closures are surface textures (`Tex`):
 * those are emitted in "builder mode", where arithmetic builds an
 * expression tree (TX.*) that the GPU forge compiles to bytecode.
 */

type Lines = string[];

export interface ModuleOut {
  mod: string;
  cls: string;
  file: string;
  lines: Lines;
}

export interface Problem {
  file: string;
  line: number;
  msg: string;
}

const TAB = '\t';

/** Per-function emission state. */
class Scope {
  pre: Lines = [];
  temps = 0;
  constructor(
    readonly parent: Scope | null,
    readonly builder: boolean,
    /** Name of the inner class whose method this is (members via self). */
    readonly cls: string | null,
    readonly isStatic: boolean,
    /** True for lambdas (they can't see `self`-less statics without qualification issues). */
    readonly lambda: boolean,
  ) {}
  tmp(prefix = 't'): string {
    let s: Scope = this;
    while (s.parent && s.lambda) s = s.parent;
    return `_${prefix}${s.temps++}`;
  }
}

export class Converter {
  readonly checker: ts.TypeChecker;
  readonly modules = new Map<string, string>(); // module path → class name
  readonly problems: Problem[] = [];
  /** Function-like nodes that are surface textures (builder mode). */
  readonly texFns = new Set<ts.Node>();
  /** Module functions that need a builder-mode twin (`name__tx`). */
  readonly twins = new Map<ts.FunctionDeclaration | ts.VariableDeclaration, Set<string>>();
  readonly twinNeeded = new Set<ts.Node>();
  /** `let` variables captured by a closure and reassigned: boxed in a one-element array. */
  readonly boxed = new Set<ts.Symbol>();
  /** Boxed lambdas that call themselves: the box is declared before the lambda is made. */
  readonly selfRec = new Set<ts.Symbol>();
  /** Module functions used as values: the most arguments a caller of the value may pass. */
  readonly valueArity = new Map<ts.Node, number>();
  /** Classes instantiated with Object.create(X.prototype) somewhere. */
  readonly blankable = new Set<ts.Node>();
  /** Locals renamed because GDScript forbids redeclaring a name anywhere in a function. */
  private renames = new Map<ts.Symbol, string>();
  /** Names declared so far in the function being emitted (lambdas share it). */
  private declared: Set<string> | null = null;
  /** Locals known to hold ints (range loop counters). */
  readonly ints = new Set<ts.Symbol>();
  /** Locals declared with a float type hint. */
  readonly floats = new Set<ts.Symbol>();
  private sf!: ts.SourceFile;
  private mod = '';
  private scope!: Scope;

  constructor(readonly program: ts.Program, readonly srcRoot: string) {
    this.checker = program.getTypeChecker();
  }

  // ---------------------------------------------------------------------------
  // Modules
  // ---------------------------------------------------------------------------

  modPath(file: string): string {
    return path.relative(this.srcRoot, file).replace(/\\/g, '/').replace(/\.tsx?$/, '');
  }

  classFor(mod: string): string {
    const m = CONFIG.manual[mod];
    if (m) return m.cls;
    let c = this.modules.get(mod);
    if (!c) {
      const parts = mod.split('/');
      c = pascal(parts.slice(-2));
      const taken = new Set(this.modules.values());
      if (taken.has(c)) c = pascal(parts.slice(-3));
      this.modules.set(mod, c);
    }
    return c;
  }

  problem(node: ts.Node, msg: string): void {
    const sf = node.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    this.problems.push({ file: this.modPath(sf.fileName), line: line + 1, msg });
  }

  // ---------------------------------------------------------------------------
  // Analysis passes
  // ---------------------------------------------------------------------------

  isTexType(t: ts.Type | undefined): boolean {
    if (!t) return false;
    if (t.aliasSymbol?.name === 'Tex') return true;
    if (t.isUnion()) return t.types.some((u) => this.isTexType(u));
    return false;
  }

  /** Marks texture closures and boxed captures in one file. */
  analyze(sf: ts.SourceFile): void {
    const visit = (n: ts.Node): void => {
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
        if (this.isTexType(this.checker.getContextualType(n))) this.texFns.add(n);
      }
      if (ts.isVariableDeclaration(n) && n.type && n.initializer && this.isTexType(this.checker.getTypeFromTypeNode(n.type))) {
        if (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) this.texFns.add(n.initializer);
      }
      if ((ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) && ts.isExpression(n) && !ts.isDeclarationStatement(n.parent)) {
        const ctx = this.contextualTypeSafe(n);
        if (ctx && this.isTexType(ctx)) {
          const fn = this.functionOf(n);
          if (fn) this.texFns.add(fn);
        }
      }
      if ((ts.isBinaryExpression(n) && isAssignOp(n.operatorToken.kind) && ts.isIdentifier(n.left)) ||
        ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && ts.isIdentifier(n.operand) &&
          (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken))) {
        const id = (ts.isBinaryExpression(n) ? n.left : (n as ts.PrefixUnaryExpression).operand) as ts.Identifier;
        const sym = this.checker.getSymbolAtLocation(id);
        const decl = sym?.valueDeclaration;
        if (sym && decl && (ts.isVariableDeclaration(decl) || ts.isParameter(decl))) {
          const declFn = enclosingFunction(decl);
          const useFn = enclosingFunction(n);
          // Captured and written from a closure, or written after a closure captured it.
          if (declFn && useFn !== declFn) this.boxed.add(sym);
          else if (declFn && this.capturedByClosure(sym, decl, declFn)) this.boxed.add(sym);
        }
      }
      // A local lambda that calls itself: boxed, so the closure can see the variable it is stored in.
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && enclosingFunction(n)) {
        const init = unwrap(n.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          const self = this.checker.getSymbolAtLocation(n.name);
          let rec = false;
          const scan = (k: ts.Node) => { if (rec) return; if (ts.isIdentifier(k) && this.checker.getSymbolAtLocation(k) === self) rec = true; else ts.forEachChild(k, scan); };
          scan(init.body);
          if (rec && self) { this.boxed.add(self); this.selfRec.add(self); }
        }
      }
      // A module function referenced as a value.
      if (ts.isIdentifier(n) && ts.isExpression(n) && !(ts.isCallExpression(n.parent) && n.parent.expression === n) &&
        !ts.isDeclarationStatement(n.parent) && !ts.isVariableDeclaration(n.parent) && !ts.isImportSpecifier(n.parent) &&
        !ts.isExportSpecifier(n.parent) && !ts.isPropertyAccessExpression(n.parent)) {
        let s = ts.isShorthandPropertyAssignment(n.parent) ? this.checker.getShorthandAssignmentValueSymbol(n.parent) : this.checker.getSymbolAtLocation(n);
        if (s && s.flags & ts.SymbolFlags.Alias) s = this.checker.getAliasedSymbol(s);
        const d = s?.valueDeclaration;
        const fnNode = d && ts.isFunctionDeclaration(d) ? d : d && ts.isVariableDeclaration(d) && d.initializer &&
          (ts.isArrowFunction(unwrap(d.initializer)) || ts.isFunctionExpression(unwrap(d.initializer))) ? unwrap(d.initializer) : null;
        if (fnNode) {
          const k = this.contextArity(n);
          if (k > (this.valueArity.get(fnNode) ?? 0)) this.valueArity.set(fnNode, k);
        }
      }
      // Object.create(X.prototype): X gets a constructor that can be skipped.
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === 'Object' && n.expression.name.text === 'create' && n.arguments.length === 1) {
        const p = unwrap(n.arguments[0]);
        if (ts.isPropertyAccessExpression(p) && p.name.text === 'prototype') {
          const d = this.checker.getSymbolAtLocation(p.expression)?.valueDeclaration;
          if (d && ts.isClassDeclaration(d)) this.blankable.add(d);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  private capturedCache = new Map<ts.Symbol, boolean>();
  private capturedByClosure(sym: ts.Symbol, decl: ts.Node, declFn: ts.Node): boolean {
    let r = this.capturedCache.get(sym);
    if (r !== undefined) return r;
    r = false;
    const name = sym.name;
    const walk = (n: ts.Node, inner: boolean): void => {
      if (r) return;
      if (ts.isIdentifier(n) && n.text === name && inner && this.checker.getSymbolAtLocation(n) === sym) { r = true; return; }
      const isFn = n !== declFn && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n));
      ts.forEachChild(n, (c) => walk(c, inner || isFn));
    };
    walk(declFn, false);
    void decl;
    this.capturedCache.set(sym, r);
    return r;
  }

  private contextualTypeSafe(n: ts.Expression): ts.Type | undefined {
    const p = n.parent;
    if (!p) return undefined;
    if (ts.isCallExpression(p) && p.arguments.includes(n)) return this.checker.getContextualType(n);
    if (ts.isPropertyAssignment(p) && p.initializer === n) return this.checker.getContextualType(n);
    if (ts.isVariableDeclaration(p) && p.initializer === n) return this.checker.getContextualType(n);
    if (ts.isReturnStatement(p)) return this.checker.getContextualType(n);
    if (ts.isArrayLiteralExpression(p)) return this.checker.getContextualType(n);
    if (ts.isConditionalExpression(p) && p.condition !== n) return this.checker.getContextualType(n);
    if (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || p.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      return this.checker.getContextualType(n);
    }
    return undefined;
  }

  /** The function a reference points at (const f = () => ..., function f() {}). */
  private functionOf(n: ts.Expression): ts.Node | null {
    let sym = this.checker.getSymbolAtLocation(n);
    if (!sym) return null;
    if (sym.flags & ts.SymbolFlags.Alias) sym = this.checker.getAliasedSymbol(sym);
    const d = sym.valueDeclaration;
    if (!d) return null;
    if (ts.isFunctionDeclaration(d)) return d;
    if (ts.isVariableDeclaration(d) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) return d.initializer;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  typeOf(n: ts.Node): ts.Type {
    return this.checker.getTypeAtLocation(n);
  }

  isNumber(t: ts.Type): boolean {
    if (t.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) return true;
    if (t.flags & ts.TypeFlags.EnumLiteral) return true;
    if (t.isUnion()) return t.types.every((u) => this.isNumber(u));
    return false;
  }
  isString(t: ts.Type): boolean {
    if (t.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral)) return true;
    if (t.isUnion()) return t.types.every((u) => this.isString(u));
    return false;
  }
  isBool(t: ts.Type): boolean {
    if (t.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return true;
    if (t.isUnion()) return t.types.every((u) => this.isBool(u));
    return false;
  }
  /** Primitive (or nullable primitive): plain GDScript truthiness matches JS. */
  isPrimitiveish(t: ts.Type): boolean {
    const ok = (u: ts.Type) => !!(u.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.StringLike | ts.TypeFlags.BooleanLike |
      ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void | ts.TypeFlags.Never | ts.TypeFlags.EnumLike));
    if (t.isUnion()) return t.types.every(ok);
    return ok(t);
  }
  isArrayType(t: ts.Type): boolean {
    const nn = this.checker.getNonNullableType(t);
    if (this.checker.isArrayType(nn) || this.checker.isTupleType(nn)) return true;
    const s = nn.getSymbol()?.name;
    return s === 'Array' || s === 'ReadonlyArray' || s === 'Uint32Array' || s === 'Uint8Array' || s === 'Float32Array' ||
      s === 'Float64Array' || s === 'Int32Array' || s === 'Uint16Array' || s === 'Int8Array' || s === 'Int16Array' || s === 'Uint8ClampedArray';
  }
  symName(t: ts.Type): string | undefined {
    return this.checker.getNonNullableType(t).getSymbol()?.name;
  }
  isMapType(t: ts.Type): boolean {
    const s = this.symName(t);
    return s === 'Map' || s === 'ReadonlyMap' || s === 'WeakMap';
  }
  isSetType(t: ts.Type): boolean {
    const s = this.symName(t);
    return s === 'Set' || s === 'ReadonlySet' || s === 'WeakSet';
  }
  isFunctionType(t: ts.Type): boolean {
    const nn = this.checker.getNonNullableType(t);
    if (nn.isUnion()) return nn.types.every((u) => this.isFunctionType(u));
    return nn.getCallSignatures().length > 0 && !this.isClassInstance(nn);
  }
  /** Instances of TS classes and class-mapped interfaces (member access, not dictionary keys). */
  isClassInstance(t: ts.Type): boolean {
    const nn = this.checker.getNonNullableType(t);
    if (nn.isUnion()) return nn.types.length > 0 && nn.types.every((u) => this.isClassInstance(u));
    const s = nn.getSymbol();
    if (!s) return false;
    if (this.classTypeOf(s)) return true;
    if (this.isHostType(s)) return true;
    return !!(s.flags & ts.SymbolFlags.Class);
  }

  /** Browser canvas types, implemented by the Canvas2D runtime (member access, snake_case). */
  isHostType(s: ts.Symbol): boolean {
    if (!HOST_TYPES.has(s.name)) return false;
    const d = s.declarations?.[0];
    return !!d && !d.getSourceFile().fileName.includes('/src/');
  }

  /** `o.k` or `o[k]` where `o` is a string-keyed record without a declared `k`. */
  readsRecordKey(e: ts.Expression): boolean {
    const n = unwrap(e);
    if (!ts.isPropertyAccessExpression(n) && !ts.isElementAccessExpression(n)) return false;
    const ot = this.checker.getTypeAtLocation(n.expression);
    if (!ot.getStringIndexType()) return false;
    return !ts.isPropertyAccessExpression(n) || !ot.getProperty(n.name.text);
  }

  /** GDScript type hint for a TS type (empty when untyped). */
  hint(t: ts.Type): string {
    if (t.flags & ts.TypeFlags.Any || t.flags & ts.TypeFlags.Unknown) return '';
    if (this.isNumber(t) && !(t.flags & ts.TypeFlags.Union && (t as ts.UnionType).types.some((u) => u.flags & ts.TypeFlags.Undefined))) return 'float';
    if (this.isBool(t)) return 'bool';
    if (this.isString(t)) return 'String';
    return '';
  }

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  convertFile(sf: ts.SourceFile): ModuleOut {
    this.sf = sf;
    this.mod = this.modPath(sf.fileName);
    const cls = this.classFor(this.mod);
    const out: Lines = [];
    out.push(`# Generated by godot/tools/ts2gd from src/${this.mod}.ts. Do not edit by hand.`);
    const head = leadingDoc(sf, sf.statements[0]);
    out.push(`class_name ${cls}`);
    out.push('');
    void head;
    const statics: Lines = [];
    const init: Lines = [];
    const funcs: Lines = [];
    const classes: Lines = [];
    const skip = new Set(CONFIG.skip[this.mod] ?? []);
    this.scope = new Scope(null, false, null, true, false);
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) ||
        ts.isExportAssignment(st)) continue;
      const doc = this.docLines(st, '');
      if (ts.isFunctionDeclaration(st)) {
        if (!st.body) continue;
        const name = st.name!.text;
        if (skip.has(name)) continue;
        funcs.push(...doc, ...this.funcDecl(st, ident(name), '', true, this.texFns.has(st)), '');
        continue;
      }
      if (ts.isClassDeclaration(st)) {
        classes.push(...doc, ...this.classDecl(st), '');
        continue;
      }
      if (ts.isVariableStatement(st)) {
        if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) continue;
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) { this.problem(d, 'destructuring at module level'); continue; }
          const name = d.name.text;
          if (skip.has(name)) continue;
          const init0 = d.initializer ? unwrap(d.initializer) : undefined;
          // Module-level arrow functions become static funcs (callable directly, cheaper than lambdas).
          if (init0 && (ts.isArrowFunction(init0) || ts.isFunctionExpression(init0)) && !this.isReassigned(d)) {
            funcs.push(...doc, ...this.funcDecl(init0, ident(name), '', true, this.texFns.has(init0)), '');
            continue;
          }
          statics.push(...doc, ...this.moduleVar(d));
        }
        continue;
      }
      if (ts.isEnumDeclaration(st)) { this.problem(st, 'enum'); continue; }
      // Top-level statements run once when the script loads.
      this.scope = new Scope(null, false, null, true, false);
      init.push(...this.stmt(st, TAB));
    }
    // Builder twins of helpers called from textures.
    const twins = this.emitTwins(sf, skip);
    out.push(...statics);
    if (statics.length) out.push('');
    if (init.length) out.push('static func _static_init() -> void:', ...init, '');
    out.push(...funcs, ...twins, ...classes);
    while (out.length && out[out.length - 1] === '') out.pop();
    out.push('');
    return { mod: this.mod, cls, file: this.mod + '.gd', lines: out };
  }

  private emitTwins(sf: ts.SourceFile, skip: Set<string>): Lines {
    const out: Lines = [];
    const done = new Set<ts.Node>();
    let again = true;
    while (again) {
      again = false;
      for (const st of sf.statements) {
        const fns: [ts.Node, string][] = [];
        if (ts.isFunctionDeclaration(st) && st.body && st.name) fns.push([st, st.name.text]);
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            const i = d.initializer && unwrap(d.initializer);
            if (i && ts.isIdentifier(d.name) && (ts.isArrowFunction(i) || ts.isFunctionExpression(i))) fns.push([i, d.name.text]);
          }
        }
        for (const [fn, name] of fns) {
          if (!this.twinNeeded.has(fn) || done.has(fn) || this.texFns.has(fn) || skip.has(name)) continue;
          done.add(fn);
          again = true;
          out.push(`## Builder-mode twin of ${ident(name)} (called from surface textures).`);
          out.push(...this.funcDecl(fn as ts.FunctionLikeDeclaration, ident(name) + '__tx', '', true, true), '');
        }
      }
    }
    return out;
  }

  private isReassigned(d: ts.VariableDeclaration): boolean {
    return (d.parent.flags & ts.NodeFlags.Const) === 0;
  }

  private moduleVar(d: ts.VariableDeclaration): Lines {
    const name = ident((d.name as ts.Identifier).text, true);
    const isConst = (d.parent.flags & ts.NodeFlags.Const) !== 0;
    if (!d.initializer) return [`static var ${name}`];
    const init = unwrap(d.initializer);
    if (isConst && isLiteralPrimitive(init)) {
      return [`const ${name} = ${this.expr(init)}`];
    }
    // Initializers that need statements get their own builder func.
    const sc = this.scope = new Scope(null, false, null, true, false);
    const e = this.expr(d.initializer);
    if (sc.pre.length) {
      const fn = `_init_${name.toLowerCase()}`;
      return [`static var ${name} = ${fn}()`, `static func ${fn}():`, ...sc.pre.map((l) => TAB + l), `${TAB}return ${e}`];
    }
    return [`static var ${name} = ${e}`];
  }

  private docLines(node: ts.Node, ind: string): Lines {
    const text = this.sf.getFullText();
    const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
    const out: Lines = [];
    for (const r of ranges) {
      const raw = text.slice(r.pos, r.end);
      if (raw.startsWith('//')) out.push(ind + '#' + raw.slice(2).replace(/\s+$/, ''));
      else {
        const body = raw.replace(/^\/\*\*?/, '').replace(/\*\/$/, '');
        const ls = body.split('\n').map((l) => l.replace(/^\s*\* ?/, '').replace(/\s+$/, ''));
        while (ls.length && !ls[0].trim()) ls.shift();
        while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
        const isDoc = raw.startsWith('/**');
        for (const l of ls) out.push(ind + (isDoc ? '## ' : '# ') + l);
      }
    }
    return out.map((l) => l.replace(/\s+$/, ''));
  }

  // ---------------------------------------------------------------------------
  // Classes
  // ---------------------------------------------------------------------------

  private classDecl(c: ts.ClassDeclaration): Lines {
    const name = c.name!.text;
    const out: Lines = [];
    const ext = c.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
    out.push(`class ${name}${ext ? ' extends ' + this.typeRef(ext.expression) : ''}:`);
    const I = TAB;
    const fields: Lines = [];
    const methods: Lines = [];
    const ctor = c.members.find(ts.isConstructorDeclaration);
    // Parameter properties.
    const paramProps = ctor?.parameters.filter((p) => p.modifiers?.some((m) =>
      m.kind === ts.SyntaxKind.ReadonlyKeyword || m.kind === ts.SyntaxKind.PublicKeyword || m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword)) ?? [];
    for (const p of paramProps) {
      const h = this.hint(this.typeOf(p));
      fields.push(`${I}var ${ident((p.name as ts.Identifier).text)}${h ? ': ' + h : ''}`);
    }
    const fieldInits: [string, ts.Expression][] = [];
    for (const m of c.members) {
      const doc = this.docLines(m, I);
      if (ts.isPropertyDeclaration(m)) {
        const n = ident(propName(m.name));
        const st = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);
        const h = this.hint(this.typeOf(m));
        if (st) {
          this.scope = new Scope(null, false, name, true, false);
          const e = m.initializer ? this.expr(m.initializer) : '';
          fields.push(...doc, `${I}static var ${n}${e ? ' = ' + e : ''}`);
        } else {
          fields.push(...doc, `${I}var ${n}${h ? ': ' + h : ''}`);
          if (m.initializer) fieldInits.push([n, m.initializer]);
        }
      } else if (ts.isMethodDeclaration(m) && m.body) {
        const st = !!m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);
        const key = `${name}.${propName(m.name)}`;
        if (CONFIG.skip[this.mod]?.includes(key)) continue;
        const renamed = CONFIG.rename?.[this.mod]?.[key];
        methods.push(...doc, ...this.funcDecl(m, renamed ?? ident(propName(m.name)), I, st, false, name), '');
      } else if (ts.isGetAccessorDeclaration(m) && m.body) {
        methods.push(...doc, ...this.funcDecl(m, 'get_' + ident(propName(m.name)), I, false, false, name), '');
      } else if (ts.isSetAccessorDeclaration(m) && m.body) {
        methods.push(...doc, ...this.funcDecl(m, 'set_' + ident(propName(m.name)), I, false, false, name), '');
      }
    }
    // Constructor: parameter properties, field initializers, then the body.
    const sc = this.scope = new Scope(null, false, name, false, false);
    const body: Lines = [];
    const outerDeclared = this.declared;
    this.declared = new Set();
    const blank = this.blankable.has(c);
    let params = ctor ? this.params(ctor.parameters, I + TAB, body, blank) : '';
    if (blank) {
      // Object.create(X.prototype) → X.new(TS.BLANK): no field initializers, no constructor body.
      const first = params ? params.split(' = ')[0] : '__blank';
      if (!params) params = '__blank = null';
      body.unshift(`${I}${TAB}if is_same(${first}, TS.BLANK): return`);
    }
    for (const p of paramProps) {
      const n = ident((p.name as ts.Identifier).text);
      body.push(`${I}${TAB}self.${n} = ${n}`);
    }
    for (const [n, e] of fieldInits) {
      const v = this.expr(e);
      body.push(...sc.pre.splice(0).map((l) => I + TAB + l), `${I}${TAB}self.${n} = ${v}`);
    }
    if (ctor?.body) {
      for (const st of ctor.body.statements) {
        if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) && st.expression.expression.kind === ts.SyntaxKind.SuperKeyword) {
          const args = st.expression.arguments.map((a) => this.expr(a)).join(', ');
          body.unshift(...sc.pre.splice(0).map((l) => I + TAB + l), `${I}${TAB}super(${args})`);
          continue;
        }
        body.push(...this.stmt(st, I + TAB));
      }
    }
    this.declared = outerDeclared;
    out.push(...fields);
    if (body.length || params) {
      out.push(`${I}func _init(${params}) -> void:`);
      out.push(...(body.length ? body : [`${I}${TAB}pass`]));
      out.push('');
    }
    out.push(...methods);
    // Hand-written members (godot/src/patches/<module>.<Class>.gd), indented into the class.
    const patch = path.join(this.srcRoot, '../godot/src/patches', `${this.mod}.${name}.gd`);
    if (fs.existsSync(patch)) {
      out.push(`${I}# --- hand-written (godot/src/patches/${this.mod}.${name}.gd) ---`, '');
      for (const l of fs.readFileSync(patch, 'utf8').replace(/\s+$/, '').split('\n')) out.push(l ? I + l : '');
    }
    if (out.length === 1) out.push(`${I}pass`);
    while (out[out.length - 1] === '') out.pop();
    return out;
  }

  // ---------------------------------------------------------------------------
  // Functions
  // ---------------------------------------------------------------------------

  private params(ps: ts.NodeArray<ts.ParameterDeclaration>, bodyInd: string, prelude: Lines, blank = false): string {
    const out: string[] = [];
    // Blankable constructors take untyped, defaulted parameters so `X.new(TS.BLANK)` type-checks.
    let optionalSeen = blank;
    for (const p of ps) {
      if (p.name.kind === ts.SyntaxKind.Identifier && p.name.text === 'this') continue;
      if (p.dotDotDotToken) {
        out.push(`...${this.declName(p.name as ts.Identifier)}: Array`);
        continue;
      }
      let name: string;
      if (ts.isIdentifier(p.name)) name = this.declName(p.name);
      else {
        name = this.scope.tmp('p');
        prelude.push(...this.destructure(p.name, name, bodyInd));
      }
      const t = this.typeOf(p);
      const sym = ts.isIdentifier(p.name) ? this.checker.getSymbolAtLocation(p.name) : undefined;
      if (p.initializer) {
        optionalSeen = true;
        const init = unwrap(p.initializer);
        // JS applies a default for `undefined` arguments too (an absent optional
        // field passed along), so defaults resolve in the body, not the signature.
        if (isLiteralPrimitive(init) && !blank && false) {
          const h = this.scope.builder ? "" : this.hint(t);
          let v = this.expr(init);
          if (h === 'float' && /^-?\d+$/.test(v)) v += '.0';
          if (h === 'float' && sym) this.floats.add(sym);
          out.push(`${name}${h ? ': ' + h : ''} = ${v}`);
        } else {
          out.push(`${name} = null`);
          const sc = this.scope;
          const v = this.expr(p.initializer);
          prelude.push(...sc.pre.splice(0).map((l) => bodyInd + l), `${bodyInd}if ${name} == null: ${name} = ${v}`);
        }
      } else if (p.questionToken || optionalSeen) {
        optionalSeen = true;
        out.push(`${name} = null`);
      } else {
        const h = this.scope.builder || (sym && this.boxed.has(sym)) ? "" : this.hint(t);
        if (h === 'float' && sym) this.floats.add(sym);
        out.push(`${name}${h ? ': ' + h : ''}`);
      }
      if (sym && this.boxed.has(sym)) prelude.push(`${bodyInd}${name} = [${name}]`);
    }
    return out.join(', ');
  }

  funcDecl(fn: ts.FunctionLikeDeclaration, name: string, ind: string, isStatic: boolean, builder: boolean, cls: string | null = null): Lines {
    const outer = this.scope;
    const outerDeclared = this.declared;
    if (!this.declared) this.declared = new Set();
    const sc = this.scope = new Scope(null, builder, cls ?? null, isStatic, false);
    const prelude: Lines = [];
    let params = this.params(fn.parameters, ind + TAB, prelude);
    // Textures are called as (x, y, phase), and function values may get more
    // arguments than they declare: pad with optional parameters.
    const want = Math.max(builder ? 3 : 0, this.valueArity.get(fn) ?? 0);
    if (!fn.parameters.some((p) => p.dotDotDotToken)) for (let k = fn.parameters.length; k < want; k++) params += (params ? ', ' : '') + `_a${k} = null`;
    const body: Lines = [...prelude];
    const ret = this.retHint(fn, builder);
    if (fn.body && ts.isBlock(fn.body)) body.push(...this.block(fn.body.statements, ind + TAB));
    else if (fn.body) {
      const e = this.expr(fn.body as ts.Expression);
      body.push(...sc.pre.splice(0).map((l) => ind + TAB + l), `${ind}${TAB}${this.isVoidExpr(fn.body as ts.Expression) ? '' : 'return '}${e}`);
    }
    this.scope = outer;
    this.declared = outerDeclared;
    const head = `${ind}${isStatic && !cls ? 'static ' : isStatic ? 'static ' : ''}func ${name}(${params})${ret}:`;
    return [head, ...(body.length ? body : [`${ind}${TAB}pass`])];
  }

  private retHint(fn: ts.FunctionLikeDeclaration, builder: boolean): string {
    if (builder) return '';
    const sig = this.checker.getSignatureFromDeclaration(fn);
    if (!sig) return '';
    const rt = this.checker.getReturnTypeOfSignature(sig);
    if (rt.flags & ts.TypeFlags.Void) return ' -> void';
    const h = this.hint(rt);
    // Untyped returns are spelled out: GDScript otherwise infers some of them as null.
    return ' -> ' + (h || 'Variant');
  }

  /** Arrow function or function expression as a GDScript lambda (hoisted when multi-line). */
  private lambda(fn: ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration): string {
    const builder = this.texFns.has(fn) || this.scope.builder;
    const outer = this.scope;
    const sc = this.scope = new Scope(outer, builder, outer.cls, outer.isStatic, true);
    const outerDeclared = this.declared;
    if (!this.declared) this.declared = new Set();
    const prelude: Lines = [];
    let params = this.params(fn.parameters, TAB, prelude);
    const want = Math.max(builder ? 3 : 0, ts.isMethodDeclaration(fn) ? this.methodArity(fn) : this.contextArity(fn));
    for (let k = fn.parameters.length; k < want; k++) params += (params ? ', ' : '') + `_a${k} = null`;
    let body: Lines;
    if (fn.body && ts.isBlock(fn.body)) body = [...prelude, ...this.block(fn.body.statements, TAB)];
    else {
      const e = this.expr(fn.body as ts.Expression);
      const ret = this.isVoidExpr(fn.body as ts.Expression) ? '' : 'return ';
      if (!sc.pre.length && !prelude.length) {
        this.scope = outer;
        this.declared = outerDeclared;
        return `(func(${params}): ${ret}${e})`;
      }
      body = [...prelude, ...sc.pre.splice(0).map((l) => TAB + l), `${TAB}${ret}${e}`];
    }
    this.scope = outer;
    this.declared = outerDeclared;
    if (!body.length) body = [`${TAB}pass`];
    const t = outer.tmp('fn');
    outer.pre.push(`var ${t} = func(${params}):`, ...body);
    return t;
  }

  // ---------------------------------------------------------------------------
  // Statements
  // ---------------------------------------------------------------------------

  private block(stmts: ts.NodeArray<ts.Statement> | ts.Statement[], ind: string): Lines {
    const out: Lines = [];
    // Function declarations are hoisted in JS: emit them first.
    const fns = stmts.filter(ts.isFunctionDeclaration);
    const rest = stmts.filter((s) => !ts.isFunctionDeclaration(s));
    for (const f of fns) out.push(...this.localFunction(f, ind));
    if (this.scope.builder) out.push(...this.builderBlock(rest, ind));
    else for (const s of rest) out.push(...this.stmt(s, ind));
    return out;
  }

  private localFunction(f: ts.FunctionDeclaration, ind: string): Lines {
    const name = ident(f.name!.text);
    const outer = this.scope;
    const sc = this.scope = new Scope(outer, this.texFns.has(f), outer.cls, outer.isStatic, true);
    const prelude: Lines = [];
    const params = this.params(f.parameters, ind + TAB, prelude);
    const body = [...prelude, ...this.block(f.body!.statements, ind + TAB)];
    this.scope = outer;
    void sc;
    return [`${ind}var ${name} = func ${name}(${params}):`, ...(body.length ? body : [`${ind}${TAB}pass`])];
  }

  /** Emits one statement, flushing the pre-statements its expressions needed. */
  stmt(s: ts.Statement, ind: string): Lines {
    const sc = this.scope;
    const saved = sc.pre;
    sc.pre = [];
    const body = this.stmtInner(s, ind);
    const pre = sc.pre.map((l) => ind + l);
    sc.pre = saved;
    return [...this.docLines(s, ind).filter(() => !ts.isBlock(s)), ...pre, ...body];
  }

  private stmtInner(s: ts.Statement, ind: string): Lines {
    const k = s.kind;
    if (ts.isVariableStatement(s)) return this.varDecls(s.declarationList, ind);
    if (ts.isExpressionStatement(s)) return this.exprStmt(s.expression, ind);
    if (ts.isReturnStatement(s)) {
      if (!s.expression) return [`${ind}return`];
      if (this.returnsVoid(s) || this.isVoidExpr(s.expression)) {
        // `return voidCall()`: run it, then return.
        const v = this.expr(s.expression);
        return [...this.scope.pre.splice(0).map((l) => ind + l), `${ind}${v}`, `${ind}return`];
      }
      return [`${ind}return ${this.expr(s.expression)}`];
    }
    if (ts.isIfStatement(s)) return this.ifStmt(s, ind);
    if (ts.isBlock(s)) {
      const b = this.block(s.statements, ind);
      return b;
    }
    if (ts.isForStatement(s)) return this.forStmt(s, ind);
    // Loops with nothing to run before `continue` (an outer for(;;)'s increment must not leak in).
    if (ts.isForOfStatement(s) || ts.isForInStatement(s) || ts.isWhileStatement(s) || ts.isDoStatement(s)) {
      this.loopIncr.push([]);
      try { return this.plainLoop(s, ind); } finally { this.loopIncr.pop(); }
    }
    if (k === ts.SyntaxKind.BreakStatement) return [`${ind}break`];
    if (k === ts.SyntaxKind.ContinueStatement) return [...this.continueIncr(ind), `${ind}continue`];
    return this.stmt2(s, ind);
  }

  private plainLoop(s: ts.ForOfStatement | ts.ForInStatement | ts.WhileStatement | ts.DoStatement, ind: string): Lines {
    if (ts.isForOfStatement(s)) return this.forOf(s, ind);
    if (ts.isForInStatement(s)) {
      const v = this.loopVar(s.initializer);
      return [`${ind}for ${v} in ${this.expr(s.expression)}:`, ...this.body(s.statement, ind + TAB)];
    }
    if (ts.isWhileStatement(s)) {
      return [`${ind}while ${this.cond(s.expression)}:`, ...this.body(s.statement, ind + TAB)];
    }
    {
      const b = this.body(s.statement, ind + TAB);
      const sc = this.scope;
      const saved = sc.pre; sc.pre = [];
      const c = this.cond(s.expression);
      const pre = sc.pre.map((l) => ind + TAB + l);
      sc.pre = saved;
      return [`${ind}while true:`, ...b, ...pre, `${ind}${TAB}if not (${c}): break`];
    }
  }

  private stmt2(s: ts.Statement, ind: string): Lines {
    const k = s.kind;
    if (ts.isSwitchStatement(s)) return this.switchStmt(s, ind);
    if (ts.isThrowStatement(s)) return [`${ind}push_error(str(${this.expr(s.expression)}))`, `${ind}return${this.returnsVoid(s) ? '' : ' null'}`];
    if (ts.isTryStatement(s)) {
      return [...this.block(s.tryBlock.statements, ind), ...(s.finallyBlock ? this.block(s.finallyBlock.statements, ind) : [])];
    }
    if (k === ts.SyntaxKind.EmptyStatement) return [];
    if (ts.isFunctionDeclaration(s)) return this.localFunction(s, ind);
    if (ts.isClassDeclaration(s)) { this.problem(s, 'local class'); return []; }
    if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) return [];
    if (ts.isLabeledStatement(s)) { this.problem(s, 'label'); return this.stmtInner(s.statement, ind); }
    this.problem(s, 'statement ' + ts.SyntaxKind[k]);
    return [`${ind}pass # TODO ${ts.SyntaxKind[k]}`];
  }

  /** True when the function enclosing `n` returns nothing (GDScript rejects `return null` there). */
  private returnsVoid(n: ts.Node): boolean {
    const fn = enclosingFunction(n);
    if (!fn || !ts.isFunctionLike(fn)) return false;
    const sig = this.checker.getSignatureFromDeclaration(fn as ts.SignatureDeclaration);
    if (!sig) return false;
    return !!(this.checker.getReturnTypeOfSignature(sig).flags & ts.TypeFlags.Void) && !this.texFns.has(fn);
  }

  /** Expression with a void type (a call to a function that returns nothing). */
  private isVoidExpr(e: ts.Expression): boolean {
    e = unwrap(e);
    // push/unshift return the new length in JS but nothing in GDScript (nobody reads it).
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ['push', 'unshift'].includes(e.expression.name.text) &&
      this.isArrayType(this.typeOf(e.expression.expression))) return true;
    return !!(this.checker.getTypeAtLocation(e).flags & ts.TypeFlags.Void);
  }

  /** `continue` inside a converted for(;;) loop must run the increment first. */
  private loopIncr: string[][] = [];
  private continueIncr(ind: string): Lines {
    const top = this.loopIncr[this.loopIncr.length - 1];
    return top ? top.map((l) => ind + l) : [];
  }

  private body(s: ts.Statement, ind: string): Lines {
    const b = ts.isBlock(s) ? this.block(s.statements, ind) : this.stmt(s, ind);
    return b.length ? b : [`${ind}pass`];
  }

  /** GDScript name for a local declaration: unique within the enclosing function. */
  private declName(id: ts.Identifier): string {
    const base = ident(id.text);
    if (!this.declared) return base;
    let n = base;
    for (let k = 2; this.declared.has(n); k++) n = `${base}_${k}`;
    this.declared.add(n);
    const sym = this.checker.getSymbolAtLocation(id);
    if (sym) {
      if (n !== base) this.renames.set(sym, n);
      else this.renames.delete(sym);
    }
    return n;
  }

  private varDecls(list: ts.VariableDeclarationList, ind: string): Lines {
    const out: Lines = [];
    for (const d of list.declarations) {
      if (!ts.isIdentifier(d.name)) {
        const src = d.initializer ? this.expr(d.initializer) : 'null';
        const t = ts.isIdentifier(unwrap(d.initializer!)) ? src : this.scope.tmp('d');
        if (t !== src) out.push(...this.scope.pre.splice(0).map((l) => ind + l), `${ind}var ${t} = ${src}`);
        out.push(...this.scope.pre.splice(0).map((l) => ind + l), ...this.destructure(d.name, t, ind));
        continue;
      }
      const name = this.declName(d.name);
      const sym = this.checker.getSymbolAtLocation(d.name);
      const boxed = sym && this.boxed.has(sym);
      const t = this.typeOf(d);
      // A read of a record's key (`mark.x`) can be missing even when TS types it as a number.
      const h = boxed || this.scope.builder || (d.initializer && this.readsRecordKey(d.initializer)) ? '' : this.hint(t);
      if (h === 'float' && sym) this.floats.add(sym);
      if (!d.initializer) {
        out.push(`${ind}var ${name}${h ? ': ' + h : ''}${boxed ? ' = [null]' : ''}`);
        continue;
      }
      if (boxed && sym && this.selfRec.has(sym)) {
        out.push(`${ind}var ${name} = [null]`);
        const fv = this.expr(d.initializer);
        out.push(...this.scope.pre.splice(0).map((l) => ind + l), `${ind}${name}[0] = ${fv}`);
        continue;
      }
      let v = this.expr(d.initializer);
      if (boxed) v = `[${v}]`;
      out.push(...this.scope.pre.splice(0).map((l) => ind + l), `${ind}var ${name}${h ? ': ' + h : ''} = ${v}`);
    }
    return out;
  }

  /** Whether element `i` of what `p` destructures can be read directly: false only for a
   *  union with a shorter side (`skinColours(s) ?? []`); plain arrays read directly. */
  private tupleHas(p: ts.ArrayBindingPattern, i: number): boolean {
    const t = this.checker.getTypeAtLocation(p);
    if (!t.isUnion()) return true;
    return t.types.every((u) => {
      if (!this.checker.isTupleType(u)) return false;
      const target = (u as ts.TypeReference).target as ts.TupleType;
      return i < target.minLength;
    });
  }

  /** Destructuring patterns into plain reads. */
  private destructure(p: ts.BindingName, src: string, ind: string): Lines {
    const out: Lines = [];
    if (ts.isObjectBindingPattern(p)) {
      for (const el of p.elements) {
        if (el.dotDotDotToken) {
          const keys = p.elements.filter((e) => !e.dotDotDotToken).map((e) => JSON.stringify(propName((e.propertyName ?? e.name) as ts.PropertyName)));
          out.push(`${ind}var ${this.declName(el.name as ts.Identifier)} = TS.omit(${src}, [${keys.join(', ')}])`);
          continue;
        }
        const key = propName((el.propertyName ?? el.name) as ts.PropertyName);
        const objT = this.checker.getTypeAtLocation(p);
        const read = this.isClassInstance(objT) ? `${src}.${ident(key)}` : `${src}.get(${JSON.stringify(key)})`;
        if (ts.isIdentifier(el.name)) {
          const name = this.declName(el.name);
          if (el.initializer) {
            const v = this.expr(el.initializer);
            out.push(...this.scope.pre.splice(0).map((l) => ind + l), `${ind}var ${name} = ${read}`, `${ind}if ${name} == null: ${name} = ${v}`);
          } else out.push(`${ind}var ${name} = ${read}`);
        } else {
          const t = this.scope.tmp('d');
          out.push(`${ind}var ${t} = ${read}`, ...this.destructure(el.name, t, ind));
        }
      }
    } else {
      p.elements.forEach((el, i) => {
        if (ts.isOmittedExpression(el)) return;
        if (el.dotDotDotToken) {
          out.push(`${ind}var ${this.declName(el.name as ts.Identifier)} = ${src}.slice(${i})`);
          return;
        }
        // Past the end of a shorter side (`f() ?? []`) reads as JS does: null.
        const read = this.tupleHas(p, i) ? `${src}[${i}]` : `TS.at(${src}, ${i})`;
        if (ts.isIdentifier(el.name)) {
          const name = this.declName(el.name);
          if (el.initializer) {
            out.push(`${ind}var ${name} = TS.at(${src}, ${i})`, `${ind}if ${name} == null: ${name} = ${this.expr(el.initializer)}`);
          } else out.push(`${ind}var ${name} = ${read}`);
        } else {
          const t = this.scope.tmp('d');
          out.push(`${ind}var ${t} = ${read}`, ...this.destructure(el.name, t, ind));
        }
      });
    }
    return out;
  }

  private exprStmt(e: ts.Expression, ind: string): Lines {
    e = unwrap(e);
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (isAssignOp(op)) return this.assign(e, ind);
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return [`${ind}if ${this.cond(e.left)}:`, ...this.exprStmtBody(e.right, ind + TAB)];
      if (op === ts.SyntaxKind.BarBarToken) return [`${ind}if not (${this.cond(e.left)}):`, ...this.exprStmtBody(e.right, ind + TAB)];
      if (op === ts.SyntaxKind.CommaToken) return [...this.exprStmt(e.left, ind), ...this.exprStmt(e.right, ind)];
    }
    if (ts.isConditionalExpression(e)) {
      return [`${ind}if ${this.cond(e.condition)}:`, ...this.exprStmtBody(e.whenTrue, ind + TAB), `${ind}else:`, ...this.exprStmtBody(e.whenFalse, ind + TAB)];
    }
    if ((ts.isPrefixUnaryExpression(e) || ts.isPostfixUnaryExpression(e)) &&
      (e.operator === ts.SyntaxKind.PlusPlusToken || e.operator === ts.SyntaxKind.MinusMinusToken)) {
      const t = this.lvalue(e.operand);
      return [`${ind}${t} ${e.operator === ts.SyntaxKind.PlusPlusToken ? '+=' : '-='} 1`];
    }
    if (ts.isCallExpression(e) && this.optionalCallStmt(e)) {
      const { guard, call } = this.optionalCallStmt(e)!;
      return [`${ind}if ${guard}:`, `${ind}${TAB}${call}`];
    }
    if (ts.isVoidExpression(e)) return this.exprStmt(e.expression, ind);
    if (ts.isDeleteExpression(e)) {
      const t = unwrap(e.expression);
      if (ts.isPropertyAccessExpression(t)) return [`${ind}${this.expr(t.expression)}.erase(${JSON.stringify(t.name.text)})`];
      if (ts.isElementAccessExpression(t)) return [`${ind}${this.expr(t.expression)}.erase(${this.key(t.argumentExpression, t.expression)})`];
    }
    const v = this.expr(e);
    if (/^[A-Za-z_][\w.]*$/.test(v)) return [];
    return [`${ind}${v}`];
  }

  private exprStmtBody(e: ts.Expression, ind: string): Lines {
    const sc = this.scope;
    const saved = sc.pre; sc.pre = [];
    const b = this.exprStmt(e, ind);
    const pre = sc.pre.map((l) => ind + l);
    sc.pre = saved;
    const out = [...pre, ...b];
    return out.length ? out : [`${ind}pass`];
  }

  /** `a?.b(...)` / `a.b?.(...)` as a statement: a guarded call. */
  private optionalCallStmt(e: ts.CallExpression): { guard: string; call: string } | null {
    const callee = unwrap(e.expression);
    const chain = ts.isOptionalChain(e) || (ts.isPropertyAccessExpression(callee) && ts.isOptionalChain(callee));
    if (!chain) return null;
    if (ts.isOptionalChain(e) && this.deepestLink(e) !== e && this.deepestLink(e) !== callee) {
      // a?.b.c(): every `?.` link becomes a guard, the call runs on plain reads.
      const guards: string[] = [];
      const undo: ts.Node[] = [];
      for (let l = this.deepestLink(e); l; l = this.deepestLink(e)) {
        const o = this.expr(l.expression);
        guards.push(`${o} != null`);
        this.noOpt.add(l);
        this.subst.set(l.expression, o);
        undo.push(l);
      }
      const call = this.expr(e);
      for (const l of undo) { this.noOpt.delete(l); this.subst.delete(l.expression); }
      return { guard: guards.join(' and '), call };
    }
    if (e.questionDotToken) {
      const f = this.expr(callee);
      return { guard: `${f} != null`, call: this.callWith(e, f) };
    }
    if (ts.isPropertyAccessExpression(callee) && callee.questionDotToken) {
      const obj = this.expr(callee.expression);
      const plain = this.callExpr(e, true);
      return { guard: `${obj} != null`, call: plain };
    }
    return null;
  }

  private assign(e: ts.BinaryExpression, ind: string): Lines {
    const op = e.operatorToken.kind;
    const left = unwrap(e.left);
    if (ts.isPropertyAccessExpression(left) && left.name.text === 'length' && op === ts.SyntaxKind.EqualsToken && this.isArrayType(this.typeOf(left.expression))) {
      const v = this.expr(e.right);
      return [...this.scope.pre.splice(0).map((l) => ind + l), `${ind}${paren(this.expr(left.expression))}.resize(int(${v}))`];
    }
    if (ts.isArrayLiteralExpression(left) && op === ts.SyntaxKind.EqualsToken) {
      const t = this.scope.tmp('a');
      const out = [`${ind}var ${t} = ${this.expr(e.right)}`];
      left.elements.forEach((el, i) => {
        if (!ts.isOmittedExpression(el)) out.push(`${ind}${this.lvalue(el)} = ${t}[${i}]`);
      });
      return [...this.scope.pre.splice(0).map((l) => ind + l), ...out];
    }
    if (ts.isBinaryExpression(unwrap(e.right)) && isAssignOp((unwrap(e.right) as ts.BinaryExpression).operatorToken.kind) && op === ts.SyntaxKind.EqualsToken) {
      // a = b = c
      const inner = unwrap(e.right) as ts.BinaryExpression;
      const first = this.assign(inner, ind);
      return [...first, `${ind}${this.lvalue(left)} = ${this.lvalue(inner.left)}`];
    }
    if (op === ts.SyntaxKind.QuestionQuestionEqualsToken || op === ts.SyntaxKind.BarBarEqualsToken || op === ts.SyntaxKind.AmpersandAmpersandEqualsToken) {
      const lv = this.lvalue(left);
      const read = this.expr(left);
      const v = this.expr(e.right);
      const pre = this.scope.pre.splice(0).map((l) => ind + TAB + l);
      const c = op === ts.SyntaxKind.QuestionQuestionEqualsToken ? `${read} == null` : op === ts.SyntaxKind.BarBarEqualsToken ? `not ${this.truthy(read, this.typeOf(left))}` : this.truthy(read, this.typeOf(left));
      return [`${ind}if ${c}:`, ...pre, `${ind}${TAB}${lv} = ${v}`];
    }
    const lv = this.lvalue(left);
    if (op === ts.SyntaxKind.EqualsToken) return [`${ind}${lv} = ${this.expr(e.right)}`];
    const bop = compoundOp(op);
    if (this.scope.builder) {
      return [`${ind}${lv} = ${this.binaryBuilder(bop, this.expr(left), this.expr(e.right))}`];
    }
    if (bop === '+' && (this.isString(this.typeOf(left)) || this.isString(this.typeOf(e.right)))) {
      return [`${ind}${lv} += ${this.strOf(e.right)}`];
    }
    if (bop === '/' ) return [`${ind}${lv} = ${this.expr(left)} / ${this.floatOf(e.right)}`];
    if (bop === '%') return [`${ind}${lv} = ${this.modOf(left, e.right)}`];
    if (bop === '**') return [`${ind}${lv} = pow(${this.expr(left)}, ${this.expr(e.right)})`];
    if (['|', '&', '^', '<<', '>>', '>>>'].includes(bop)) return [`${ind}${lv} = ${this.bitwise(bop, left, e.right)}`];
    return [`${ind}${lv} ${bop}= ${this.expr(e.right)}`];
  }

  private lvalue(e: ts.Expression): string {
    e = unwrap(e);
    if (ts.isIdentifier(e)) return this.identRef(e);
    if (ts.isPropertyAccessExpression(e)) {
      const objT = this.typeOf(e.expression);
      const obj = this.expr(e.expression);
      if (e.expression.kind === ts.SyntaxKind.ThisKeyword || this.isClassInstance(objT) || this.isStaticClassRef(e.expression)) {
        if (this.isArrayType(objT) && e.name.text === 'length') return `${obj}`;
        return `${obj}.${ident(e.name.text)}`;
      }
      return `${obj}[${JSON.stringify(e.name.text)}]`;
    }
    if (ts.isElementAccessExpression(e)) {
      // Writes need a whole index (GDScript refuses `arr[1.0] = v`).
      const k = this.isArrayType(this.typeOf(e.expression)) ? this.intOf(e.argumentExpression) : this.key(e.argumentExpression, e.expression);
      return `${this.expr(e.expression)}[${k}]`;
    }
    this.problem(e, 'lvalue ' + ts.SyntaxKind[e.kind]);
    return this.expr(e);
  }

  /**
   * `a && (x -= d) <= 0`: the right side has side effects that must only run
   * when the left passes, so the condition becomes statements into a flag.
   */
  private needsSequencing(e: ts.Expression): boolean {
    e = unwrap(e);
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      return hasSideEffect(e.right) || this.needsSequencing(e.left);
    }
    return false;
  }

  private seqCond(e: ts.Expression, flag: string, ind: string): Lines {
    e = unwrap(e);
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      const and = e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
      return [...this.seqCond(e.left, flag, ind), `${ind}if ${and ? '' : 'not '}${flag}:`, ...this.seqCond(e.right, flag, ind + TAB)];
    }
    const sc = this.scope;
    const saved = sc.pre; sc.pre = [];
    const c = this.cond(e);
    const pre = sc.pre;
    sc.pre = saved;
    return [...pre.map((l) => ind + l), `${ind}${flag} = ${c}`];
  }

  /** A condition as (statements, expression), sequencing side effects when needed. */
  private condParts(e: ts.Expression, ind: string): { pre: Lines; c: string } {
    if (this.needsSequencing(e)) {
      const flag = this.scope.tmp('c');
      return { pre: [`${ind}var ${flag} = false`, ...this.seqCond(e, flag, ind)], c: flag };
    }
    const sc = this.scope;
    const saved = sc.pre; sc.pre = [];
    const c = this.cond(e);
    const pre = sc.pre.map((l) => ind + l);
    sc.pre = saved;
    return { pre, c };
  }

  private ifStmt(s: ts.IfStatement, ind: string): Lines {
    const first = this.condParts(s.expression, ind);
    const out: Lines = [...first.pre, `${ind}if ${first.c}:`, ...this.body(s.thenStatement, ind + TAB)];
    let el = s.elseStatement;
    while (el) {
      if (ts.isIfStatement(el)) {
        const parts = this.condParts(el.expression, '');
        const c = parts.c;
        const pre = parts.pre;
        if (pre.length) {
          // The condition needs statements: nest instead of elif.
          out.push(`${ind}else:`, ...pre.map((l) => ind + TAB + l), `${ind}${TAB}if ${c}:`, ...this.body(el.thenStatement, ind + TAB + TAB));
          if (el.elseStatement) out.push(`${ind}${TAB}else:`, ...this.body(el.elseStatement, ind + TAB + TAB));
          return out;
        }
        out.push(`${ind}elif ${c}:`, ...this.body(el.thenStatement, ind + TAB));
        el = el.elseStatement;
      } else {
        out.push(`${ind}else:`, ...this.body(el, ind + TAB));
        el = undefined;
      }
    }
    return out;
  }

  private loopVar(init: ts.ForInitializer): string {
    if (ts.isVariableDeclarationList(init)) {
      const d = init.declarations[0];
      if (ts.isIdentifier(d.name)) return this.declName(d.name);
      return '_e';
    }
    return this.expr(init as ts.Expression);
  }

  private forStmt(s: ts.ForStatement, ind: string): Lines {
    const r = this.rangeLoop(s);
    if (r) {
      this.loopIncr.push([]);
      try { return [`${ind}for ${r.v} in ${r.range}:`, ...this.body(s.statement, ind + TAB)]; } finally { this.loopIncr.pop(); }
    }
    const out: Lines = [];
    if (s.initializer) {
      if (ts.isVariableDeclarationList(s.initializer)) out.push(...this.varDecls(s.initializer, ind));
      else out.push(...this.exprStmt(s.initializer, ind));
    }
    const sc = this.scope;
    let incr: Lines = [];
    if (s.incrementor) {
      // Its hoisted temporaries (`j = i++`) belong at the end of each pass, not before the loop.
      const keep = sc.pre; sc.pre = [];
      const st = this.exprStmt(s.incrementor, '');
      incr = [...sc.pre, ...st];
      sc.pre = keep;
    }
    const saved = sc.pre; sc.pre = [];
    const c = s.condition ? this.cond(s.condition) : 'true';
    const cpre = sc.pre;
    sc.pre = saved;
    this.loopIncr.push(incr);
    const b = this.body(s.statement, ind + TAB);
    this.loopIncr.pop();
    if (cpre.length) {
      out.push(`${ind}while true:`, ...cpre.map((l) => ind + TAB + l), `${ind}${TAB}if not (${c}): break`, ...b, ...incr.map((l) => ind + TAB + l));
    } else out.push(`${ind}while ${c}:`, ...b, ...incr.map((l) => ind + TAB + l));
    return out;
  }

  /** for (let i = a; i < b; i++) → for i in range(a, b) when i is only counted. */
  private rangeLoop(s: ts.ForStatement): { v: string; range: string } | null {
    if (!s.initializer || !ts.isVariableDeclarationList(s.initializer) || s.initializer.declarations.length !== 1) return null;
    const d = s.initializer.declarations[0];
    if (!ts.isIdentifier(d.name) || !d.initializer) return null;
    const sym = this.checker.getSymbolAtLocation(d.name);
    if (!sym || this.boxed.has(sym)) return null;
    if (!s.condition || !ts.isBinaryExpression(s.condition) || !ts.isIdentifier(s.condition.left) || s.condition.left.text !== d.name.text) return null;
    const inc = s.incrementor && unwrap(s.incrementor);
    let step = 0;
    if (inc && (ts.isPostfixUnaryExpression(inc) || ts.isPrefixUnaryExpression(inc)) && ts.isIdentifier(inc.operand) && inc.operand.text === d.name.text) {
      step = inc.operator === ts.SyntaxKind.PlusPlusToken ? 1 : inc.operator === ts.SyntaxKind.MinusMinusToken ? -1 : 0;
    } else if (inc && ts.isBinaryExpression(inc) && ts.isIdentifier(inc.left) && inc.left.text === d.name.text && ts.isNumericLiteral(unwrap(inc.right))) {
      const k = Number((unwrap(inc.right) as ts.NumericLiteral).text);
      if (Number.isInteger(k)) step = inc.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken ? k : inc.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken ? -k : 0;
    }
    if (!step) return null;
    if (!this.isIntExpr(d.initializer)) return null;
    // The counter must not be written in the body, and the bound must be stable.
    let written = false;
    const bound = s.condition.right;
    const boundSyms = new Set<ts.Symbol>();
    const collect = (n: ts.Node) => { if (ts.isIdentifier(n)) { const x = this.checker.getSymbolAtLocation(n); if (x) boundSyms.add(x); } ts.forEachChild(n, collect); };
    collect(bound);
    // JS re-evaluates the bound every pass: a call in it (rng.int(1, 3)) must keep doing so.
    let impure = false;
    const calls = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const f = n.expression;
        if (!(ts.isPropertyAccessExpression(f) && ts.isIdentifier(f.expression) && f.expression.text === 'Math' && f.name.text !== 'random')) impure = true;
      }
      ts.forEachChild(n, calls);
    };
    calls(bound);
    if (impure) return null;
    let boundTouched = false;
    const visit = (n: ts.Node) => {
      if (ts.isBinaryExpression(n) && isAssignOp(n.operatorToken.kind)) {
        const l = unwrap(n.left);
        if (ts.isIdentifier(l)) { const x = this.checker.getSymbolAtLocation(l); if (x === sym) written = true; if (x && boundSyms.has(x)) boundTouched = true; }
      }
      if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && ts.isIdentifier(n.operand) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) {
        const x = this.checker.getSymbolAtLocation(n.operand);
        if (x === sym) written = true;
        if (x && boundSyms.has(x)) boundTouched = true;
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['push', 'pop', 'splice', 'shift', 'unshift'].includes(n.expression.name.text)) {
        const t = n.expression.expression;
        if (ts.isIdentifier(t)) { const x = this.checker.getSymbolAtLocation(t); if (x && boundSyms.has(x)) boundTouched = true; }
      }
      ts.forEachChild(n, visit);
    };
    visit(s.statement);
    if (written || boundTouched) return null;
    const op = s.condition.operatorToken.kind;
    const a = this.intOf(d.initializer);
    const bInt = this.isIntExpr(bound);
    const b = this.expr(bound);
    let end: string;
    if (step > 0 && op === ts.SyntaxKind.LessThanToken) end = bInt ? b : `ceili(${b})`;
    else if (step > 0 && op === ts.SyntaxKind.LessThanEqualsToken) end = bInt ? `${paren(b)} + 1` : `floori(${b}) + 1`;
    else if (step < 0 && op === ts.SyntaxKind.GreaterThanEqualsToken) end = bInt ? `${paren(b)} - 1` : `ceili(${b}) - 1`;
    else if (step < 0 && op === ts.SyntaxKind.GreaterThanToken) end = bInt ? b : `floori(${b})`;
    else return null;
    this.ints.add(sym);
    const v = this.declName(d.name);
    const range = step === 1 && a === '0' ? `range(${end})` : step === 1 ? `range(${a}, ${end})` : `range(${a}, ${end}, ${step})`;
    return { v, range };
  }

  private forOf(s: ts.ForOfStatement, ind: string): Lines {
    const src = unwrap(s.expression);
    const t = this.typeOf(src);
    const init = s.initializer;
    const decl = ts.isVariableDeclarationList(init) ? init.declarations[0] : null;
    const pat = decl?.name;
    // for (const [k, v] of Object.entries(o)) / of map
    const entries = ts.isCallExpression(src) && ts.isPropertyAccessExpression(src.expression) && ts.isIdentifier(src.expression.expression) &&
      src.expression.expression.text === 'Object' && src.expression.name.text === 'entries';
    if (pat && ts.isArrayBindingPattern(pat) && (entries || this.isMapType(t)) && pat.elements.length <= 2) {
      const obj = entries ? this.expr((src as ts.CallExpression).arguments[0]) : this.expr(src);
      const k = pat.elements[0] && !ts.isOmittedExpression(pat.elements[0]) ? this.declName((pat.elements[0] as ts.BindingElement).name as ts.Identifier) : '_k';
      const out: Lines = [];
      let objRef = obj;
      if (!/^[\w.]+$/.test(obj)) { objRef = this.scope.tmp('o'); out.push(`${ind}var ${objRef} = ${obj}`); }
      const body: Lines = [];
      if (pat.elements[1] && !ts.isOmittedExpression(pat.elements[1])) {
        const vEl = pat.elements[1] as ts.BindingElement;
        if (ts.isIdentifier(vEl.name)) body.push(`${ind}${TAB}var ${this.declName(vEl.name)} = ${objRef}[${k}]`);
        else { const tv = this.scope.tmp('v'); body.push(`${ind}${TAB}var ${tv} = ${objRef}[${k}]`, ...this.destructure(vEl.name, tv, ind + TAB)); }
      }
      return [...out, `${ind}for ${k} in ${objRef}:`, ...body, ...this.body(s.statement, ind + TAB)];
    }
    let iter = this.expr(src);
    if (this.isMapType(t)) iter = `${iter}.values()`;
    if (pat && !ts.isIdentifier(pat)) {
      const tv = this.scope.tmp('e');
      return [`${ind}for ${tv} in ${iter}:`, ...this.destructure(pat, tv, ind + TAB), ...this.body(s.statement, ind + TAB)];
    }
    const v = pat ? this.declName(pat as ts.Identifier) : this.expr(init as ts.Expression);
    return [`${ind}for ${v} in ${iter}:`, ...this.body(s.statement, ind + TAB)];
  }

  private switchStmt(s: ts.SwitchStatement, ind: string): Lines {
    // A `break` out of the middle of a case: run the cases inside a one-pass loop it can leave.
    if (this.innerBreak(s)) {
      if (this.hasContinue(s)) this.problem(s, 'switch with both an early break and a continue');
      const inner = this.switchStmt0(s, ind + TAB);
      return [`${ind}while true:`, ...inner, `${ind}${TAB}break`];
    }
    return this.switchStmt0(s, ind);
  }

  /** A break inside a case that isn't the case's last statement (or sits in a nested block). */
  private innerBreak(s: ts.SwitchStatement): boolean {
    let found = false;
    const visit = (n: ts.Node, top: boolean) => {
      if (found) return;
      if (ts.isBreakStatement(n) && !n.label && !top) { found = true; return; }
      if (ts.isIterationStatement(n, false) || ts.isSwitchStatement(n) || ts.isFunctionLike(n)) return;
      ts.forEachChild(n, (k) => visit(k, false));
    };
    for (const c of s.caseBlock.clauses) {
      const st = c.statements.length === 1 && ts.isBlock(c.statements[0]) ? [...(c.statements[0] as ts.Block).statements] : [...c.statements];
      st.forEach((x, i) => visit(x, i === st.length - 1));
    }
    return found;
  }

  private hasContinue(s: ts.SwitchStatement): boolean {
    let found = false;
    const visit = (n: ts.Node) => {
      if (found) return;
      if (ts.isContinueStatement(n)) { found = true; return; }
      if (ts.isIterationStatement(n, false) || ts.isFunctionLike(n)) return;
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(s.caseBlock, visit);
    return found;
  }

  private switchStmt0(s: ts.SwitchStatement, ind: string): Lines {
    const v = this.scope.tmp('sw');
    const out: Lines = [`${ind}var ${v} = ${this.expr(s.expression)}`];
    let labels: string[] = [];
    let first = true;
    let dflt: ts.Statement[] | null = null;
    for (const c of s.caseBlock.clauses) {
      if (ts.isDefaultClause(c)) {
        dflt = c.statements.filter((x) => x.kind !== ts.SyntaxKind.BreakStatement) as ts.Statement[];
        continue;
      }
      labels.push(`${v} == ${this.expr(c.expression)}`);
      if (!c.statements.length) continue;
      const stmts = c.statements.filter((x, i) => !(x.kind === ts.SyntaxKind.BreakStatement && i === c.statements.length - 1));
      const sub: ts.Statement[] = stmts.length === 1 && ts.isBlock(stmts[0]) ? [...(stmts[0] as ts.Block).statements] : [...stmts];
      out.push(`${ind}${first ? 'if' : 'elif'} ${labels.join(' or ')}:`);
      const b = this.block(sub.filter((x, i, a) => !(x.kind === ts.SyntaxKind.BreakStatement && i === a.length - 1)), ind + TAB);
      out.push(...(b.length ? b : [`${ind}${TAB}pass`]));
      labels = [];
      first = false;
    }
    if (dflt) {
      const b = this.block(dflt, ind + TAB);
      if (first) out.push(...this.block(dflt, ind));
      else out.push(`${ind}else:`, ...(b.length ? b : [`${ind}${TAB}pass`]));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Builder mode (surface textures)
  // ---------------------------------------------------------------------------

  /**
   * A texture body as straight-line code that builds an expression tree.
   * Returns statements; `return` folds the rest of the block into selects.
   */
  private builderBlock(stmts: ts.Statement[], ind: string, cond: string | null = null): Lines {
    const out: Lines = [];
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      const rest = stmts.slice(i + 1);
      if (ts.isReturnStatement(s)) {
        out.push(...this.stmt(s, ind));
        return out;
      }
      if (ts.isIfStatement(s) && !cond) {
        const sc = this.scope;
        const saved = sc.pre; sc.pre = [];
        const c = this.expr(s.expression);
        const cv = sc.tmp('c');
        out.push(...sc.pre.map((l) => ind + l), `${ind}var ${cv} = ${c}`);
        sc.pre = saved;
        const thenStmts = blockStmts(s.thenStatement);
        const elseStmts = s.elseStatement ? blockStmts(s.elseStatement) : null;
        const thenRet = alwaysReturns(thenStmts);
        const elseRet = elseStmts ? alwaysReturns(elseStmts) : false;
        if (thenRet) {
          const a = this.builderValue(thenStmts, ind);
          const b = this.builderValue(elseStmts && elseRet ? elseStmts : [...(elseStmts ?? []), ...rest], ind, s);
          out.push(...a.lines, ...b.lines, `${ind}return TX.sel(${cv}, ${a.value}, ${b.value})`);
          return out;
        }
        if (elseStmts && elseRet) {
          const a = this.builderValue(elseStmts, ind);
          const b = this.builderValue([...thenStmts, ...rest], ind);
          out.push(...a.lines, ...b.lines, `${ind}return TX.sel(${cv}, ${b.value}, ${a.value})`);
          return out;
        }
        out.push(...this.builderBlock(thenStmts, ind, cv));
        if (elseStmts) out.push(...this.builderBlock(elseStmts, ind, `TX.not_(${cv})`));
        continue;
      }
      if (ts.isIfStatement(s) && cond) {
        const c = this.expr(s.expression);
        const cv = this.scope.tmp('c');
        out.push(...this.scope.pre.splice(0).map((l) => ind + l), `${ind}var ${cv} = TX.and_(${cond}, ${c})`);
        out.push(...this.builderBlock(blockStmts(s.thenStatement), ind, cv));
        if (s.elseStatement) out.push(...this.builderBlock(blockStmts(s.elseStatement), ind, `TX.and_(${cond}, TX.not_(${c}))`));
        continue;
      }
      if (cond && ts.isExpressionStatement(s)) {
        // Conditional assignment: v = sel(c, new, old).
        const e = unwrap(s.expression);
        let target: ts.Expression | null = null;
        let value: string | null = null;
        if (ts.isBinaryExpression(e) && isAssignOp(e.operatorToken.kind)) {
          target = e.left;
          const op = e.operatorToken.kind;
          value = op === ts.SyntaxKind.EqualsToken ? this.expr(e.right) : this.binaryBuilder(compoundOp(op), this.expr(e.left), this.expr(e.right));
        } else if ((ts.isPostfixUnaryExpression(e) || ts.isPrefixUnaryExpression(e)) && (e.operator === ts.SyntaxKind.PlusPlusToken || e.operator === ts.SyntaxKind.MinusMinusToken)) {
          target = e.operand;
          value = `TX.${e.operator === ts.SyntaxKind.PlusPlusToken ? 'add' : 'sub'}(${this.expr(e.operand)}, 1)`;
        }
        if (target && value) {
          const lv = this.lvalue(target);
          out.push(...this.scope.pre.splice(0).map((l) => ind + l), `${ind}${lv} = TX.sel(${cond}, ${value}, ${lv})`);
          continue;
        }
      }
      if (ts.isBlock(s)) { out.push(...this.builderBlock([...s.statements], ind, cond)); continue; }
      if (cond && !ts.isVariableStatement(s)) this.problem(s, 'texture: statement under a symbolic condition');
      if (ts.isForStatement(s) || ts.isForOfStatement(s)) {
        // Loops run at build time (their bounds are concrete).
        out.push(...this.stmt(s, ind));
        continue;
      }
      out.push(...this.stmt(s, ind));
    }
    return out;
  }

  /** A block that ends in a return, as lines plus the value it returns. */
  private builderValue(stmts: ts.Statement[], ind: string, at?: ts.Node): { lines: Lines; value: string } {
    const lines = this.builderBlock(stmts, ind);
    const last = lines[lines.length - 1] ?? '';
    const m = /^\s*return (.*)$/.exec(last);
    if (!m) {
      this.problem(stmts[0] ?? at ?? this.sf, 'texture branch without a return');
      return { lines, value: '0' };
    }
    const v = this.scope.tmp('r');
    return { lines: [...lines.slice(0, -1), `${ind}var ${v} = ${m[1]}`], value: v };
  }

  private binaryBuilder(op: string, a: string, b: string): string {
    const f = BUILDER_OPS[op];
    if (!f) return `${a} ${op} ${b}`;
    return `TX.${f}(${a}, ${b})`;
  }

  // ---------------------------------------------------------------------------
  // Expressions
  // ---------------------------------------------------------------------------

  /** Condition context: JS truthiness of the value. */
  cond(e: ts.Expression): string {
    e = unwrap(e);
    if (this.scope.builder) return this.expr(e);
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
      const c = this.cond(e.operand);
      const m = /^\((.*)\) != null$/.exec(c) ?? /^([\w.\[\]"]+) != null$/.exec(c);
      if (m && balanced(m[1])) return `${paren(m[1])} == null`;
      return `not ${paren(c)}`;
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return `${paren(this.cond(e.left))} and ${paren(this.cond(e.right))}`;
      if (op === ts.SyntaxKind.BarBarToken) return `${paren(this.cond(e.left))} or ${paren(this.cond(e.right))}`;
    }
    return this.truthy(this.expr(e), this.typeOf(e));
  }

  private truthy(v: string, t: ts.Type): string {
    if (this.isPrimitiveish(t)) return v;
    if (t.flags & ts.TypeFlags.Any) return `TS.truthy(${v})`;
    // Objects, arrays, functions: only null/undefined are falsy in JS.
    const nn = t.isUnion() ? t.types.filter((u) => !(u.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))) : [t];
    if (nn.some((u) => this.isPrimitiveish(u))) return `TS.truthy(${v})`;
    return `${paren(v)} != null`;
  }

  /** Links of an optional chain already guarded by an enclosing `(null if o == null else ...)`. */
  private noOpt = new Set<ts.Node>();
  /** Sub-expressions already emitted (chain roots), by node. */
  private subst = new Map<ts.Node, string>();

  /** The innermost `?.` link of the chain ending at `e` that is still unguarded. */
  private deepestLink(e: ts.Expression): (ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression) | null {
    let n: ts.Expression = e;
    let deepest: (ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression) | null = null;
    while (ts.isOptionalChain(n) || ts.isNonNullExpression(n)) {
      if (ts.isNonNullExpression(n)) { n = n.expression; continue; }
      const l = n as ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression;
      if (l.questionDotToken && !this.noOpt.has(l)) deepest = l;
      n = l.expression;
    }
    return deepest;
  }

  /**
   * `a?.b.c`: JS short-circuits the whole chain when `a` is nullish, so the
   * guard wraps every link after the `?.`, not just the next one.
   */
  private chainExpr(e: ts.Expression): string | null {
    const l = this.deepestLink(e);
    if (!l || l === e) return null;
    let o = this.expr(l.expression);
    // Hoisted to a temporary, unless the chain only runs conditionally (`x && a?.b()`):
    // a hoisted read would run (and fail) when the guard is false, so read it twice.
    if (!/^[\w.]+$/.test(o) && !this.conditional(e)) {
      const t = this.scope.tmp('q');
      this.scope.pre.push(`var ${t} = ${o}`);
      o = t;
    }
    this.noOpt.add(l);
    this.subst.set(l.expression, o);
    const inner = this.expr(e);
    this.noOpt.delete(l);
    this.subst.delete(l.expression);
    return `(null if ${o} == null else ${inner})`;
  }

  /** `e` is evaluated only on some paths of its statement (right of && || ??, a branch of ?:). */
  private conditional(e: ts.Node): boolean {
    for (let n: ts.Node = e; n.parent && !ts.isStatement(n.parent) && !ts.isFunctionLike(n.parent); n = n.parent) {
      const p = n.parent;
      if (ts.isBinaryExpression(p) && p.right === n && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)) return true;
      if (ts.isConditionalExpression(p) && p.condition !== n) return true;
    }
    return false;
  }

  expr(e: ts.Expression): string {
    const sub = this.subst.get(e);
    if (sub !== undefined) return sub;
    if (ts.isOptionalChain(e) && !(ts.isOptionalChain(e.parent) && (e.parent as ts.PropertyAccessExpression).expression === e)) {
      const c = this.chainExpr(e);
      if (c !== null) return c;
    }
    const k = e.kind;
    const B = this.scope.builder;
    switch (k) {
      case ts.SyntaxKind.NumericLiteral: return numLit(e.getText());
      case ts.SyntaxKind.StringLiteral: case ts.SyntaxKind.NoSubstitutionTemplateLiteral: return JSON.stringify((e as ts.StringLiteral).text);
      case ts.SyntaxKind.TrueKeyword: return 'true';
      case ts.SyntaxKind.FalseKeyword: return 'false';
      case ts.SyntaxKind.NullKeyword: return 'null';
      case ts.SyntaxKind.ThisKeyword: return 'self';
      case ts.SyntaxKind.SuperKeyword: return 'super';
      case ts.SyntaxKind.RegularExpressionLiteral: {
        // /body/flags: a dictionary with test() (all the game uses).
        const t = e.getText();
        const end = t.lastIndexOf('/');
        return `TS.regex(${JSON.stringify(t.slice(1, end))}, ${JSON.stringify(t.slice(end + 1))})`;
      }
    }
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) {
      const inner = this.expr(unwrap(e));
      return ts.isParenthesizedExpression(e) && !/^[\w.]+$/.test(inner) && !inner.startsWith('(') ? `(${inner})` : inner;
    }
    if (ts.isIdentifier(e)) {
      if (e.text === 'undefined') return 'null';
      if (e.text === 'Infinity') return 'INF';
      if (e.text === 'NaN') return 'NAN';
      return this.identRead(e);
    }
    if (ts.isTemplateExpression(e)) {
      const parts: string[] = [];
      if (e.head.text) parts.push(JSON.stringify(e.head.text));
      for (const sp of e.templateSpans) {
        parts.push(this.strOf(sp.expression));
        if (sp.literal.text) parts.push(JSON.stringify(sp.literal.text));
      }
      return parts.length ? `(${parts.join(' + ')})` : '""';
    }
    if (ts.isArrayLiteralExpression(e)) {
      const segs: string[] = [];
      let cur: string[] = [];
      for (const el of e.elements) {
        if (ts.isSpreadElement(el)) {
          if (cur.length) segs.push(`[${cur.join(', ')}]`);
          cur = [];
          segs.push(`TS.arr(${this.expr(el.expression)})`);
        } else if (ts.isOmittedExpression(el)) cur.push('null');
        else cur.push(this.expr(el));
      }
      if (cur.length || !segs.length) segs.push(`[${cur.join(', ')}]`);
      // [...xs] is a copy (TS.arr hands back the array itself).
      if (segs.length === 1 && segs[0].startsWith('TS.arr(')) return `${segs[0]}.duplicate()`;
      return segs.length === 1 ? segs[0] : `(${segs.join(' + ')})`;
    }
    if (ts.isObjectLiteralExpression(e)) return this.objectLit(e);
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return this.lambda(e);
    if (ts.isPropertyAccessExpression(e)) return this.propRead(e);
    if (ts.isElementAccessExpression(e)) return this.elemRead(e);
    if (ts.isCallExpression(e)) return this.callExpr(e);
    if (ts.isNewExpression(e)) return this.newExpr(e);
    if (ts.isConditionalExpression(e)) {
      if (B) return `TX.sel(${this.expr(e.condition)}, ${this.expr(e.whenTrue)}, ${this.expr(e.whenFalse)})`;
      return `(${this.expr(e.whenTrue)} if ${this.cond(e.condition)} else ${this.expr(e.whenFalse)})`;
    }
    if (ts.isPrefixUnaryExpression(e)) return this.prefix(e);
    if (ts.isPostfixUnaryExpression(e)) {
      // x++ used as a value: hoist.
      const lv = this.lvalue(e.operand);
      const t = this.scope.tmp('i');
      this.scope.pre.push(`var ${t} = ${lv}`, `${lv} ${e.operator === ts.SyntaxKind.PlusPlusToken ? '+=' : '-='} 1`);
      return t;
    }
    if (ts.isBinaryExpression(e)) return this.binary(e);
    if (ts.isTypeOfExpression(e)) return `TS.type_of(${this.expr(e.expression)})`;
    if (ts.isVoidExpression(e)) return 'null';
    if (ts.isSpreadElement(e)) return this.expr(e.expression);
    if (ts.isClassExpression(e)) { this.problem(e, 'class expression'); return 'null'; }
    this.problem(e, 'expression ' + ts.SyntaxKind[k]);
    return `null # TODO ${ts.SyntaxKind[k]}`;
  }

  private prefix(e: ts.PrefixUnaryExpression): string {
    const B = this.scope.builder;
    const op = e.operator;
    if (op === ts.SyntaxKind.MinusToken) {
      const inner = unwrap(e.operand);
      if (ts.isNumericLiteral(inner)) return '-' + numLit(inner.getText());
      return B ? `TX.neg(${this.expr(e.operand)})` : `-${paren(this.expr(e.operand))}`;
    }
    if (op === ts.SyntaxKind.PlusToken) return B ? this.expr(e.operand) : `TS.num(${this.expr(e.operand)})`;
    if (op === ts.SyntaxKind.ExclamationToken) {
      if (B) return `TX.not_(${this.expr(e.operand)})`;
      const c = this.cond(e.operand);
      const m = /^\((.*)\) != null$/.exec(c) ?? /^([\w.\[\]"]+) != null$/.exec(c);
      if (m && balanced(m[1])) return `${paren(m[1])} == null`;
      return `(not ${paren(c)})`;
    }
    if (op === ts.SyntaxKind.TildeToken) return B ? `TX.bnot(${this.expr(e.operand)})` : `(~${this.intOf(e.operand)})`;
    // ++x as a value
    const lv = this.lvalue(e.operand);
    this.scope.pre.push(`${lv} ${op === ts.SyntaxKind.PlusPlusToken ? '+=' : '-='} 1`);
    return lv;
  }

  private binary(e: ts.BinaryExpression): string {
    const op = e.operatorToken.kind;
    const B = this.scope.builder;
    if (isAssignOp(op)) {
      // Assignment used as a value: hoist, then read the target.
      this.scope.pre.push(...this.assign(e, ''));
      return this.expr(e.left);
    }
    if (op === ts.SyntaxKind.CommaToken) {
      this.scope.pre.push(...this.exprStmt(e.left, ''));
      return this.expr(e.right);
    }
    if (op === ts.SyntaxKind.InKeyword) return `${this.expr(e.right)}.has(${this.expr(e.left)})`;
    if (op === ts.SyntaxKind.InstanceOfKeyword) return `(${this.expr(e.left)} is ${this.typeRef(e.right)})`;
    if (op === ts.SyntaxKind.QuestionQuestionToken) {
      const a = this.expr(e.left);
      // The right side only runs when the left is nullish.
      const b = this.lazyRight(e.right);
      if (simpleExpr(a) || !hasCall(e.left)) return `(${a} if ${a} != null else ${b.v})`;
      return b.lazy ? `TS.nn_f(${a}, func(): return ${b.v})` : `TS.nn(${a}, ${b.v})`;
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
      if (B) return `TX.${op === ts.SyntaxKind.AmpersandAmpersandToken ? 'and_' : 'or_'}(${this.expr(e.left)}, ${this.expr(e.right)})`;
      const lt = this.typeOf(e.left), rt = this.typeOf(e.right);
      if (this.isBool(lt) && this.isBool(rt) || this.boolContext(e)) {
        return `(${paren(this.cond(e.left))} ${op === ts.SyntaxKind.AmpersandAmpersandToken ? 'and' : 'or'} ${paren(this.cond(e.right))})`;
      }
      const a = this.expr(e.left);
      const rb = this.lazyRight(e.right);
      const b = rb.v;
      const ta = this.truthy(a, lt);
      // JS evaluates the right side only when needed: a GDScript ternary does too
      // (the left is repeated when it's cheap; calls go through a thunk).
      if (!simpleExpr(a) && hasCall(e.left)) {
        const and = op === ts.SyntaxKind.AmpersandAmpersandToken;
        if (rb.lazy) return `TS.${and ? 'and_f' : 'or_f'}(${a}, func(): return ${b})`;
        return `TS.${and ? 'and_' : 'or_'}(${a}, ${b})`;
      }
      return op === ts.SyntaxKind.BarBarToken ? `(${a} if ${ta} else ${b})` : `(${b} if ${ta} else ${a})`;
    }
    const opText = ts.tokenToString(op)!;
    if (B) {
      const f = BUILDER_OPS[opText];
      if (f) return `TX.${f}(${this.expr(e.left)}, ${this.expr(e.right)})`;
      this.problem(e, 'texture op ' + opText);
    }
    switch (op) {
      case ts.SyntaxKind.EqualsEqualsEqualsToken: case ts.SyntaxKind.EqualsEqualsToken:
        return this.equality(e, '==');
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: case ts.SyntaxKind.ExclamationEqualsToken:
        return this.equality(e, '!=');
      case ts.SyntaxKind.PlusToken: {
        const ls = this.isString(this.typeOf(e.left)), rs = this.isString(this.typeOf(e.right));
        if (ls || rs) return `${this.strOf(e.left)} + ${this.strOf(e.right)}`;
        return `${this.opnd(e.left)} + ${this.opnd(e.right)}`;
      }
      case ts.SyntaxKind.SlashToken: return `${this.opnd(e.left)} / ${this.floatOf(e.right)}`;
      case ts.SyntaxKind.PercentToken: return this.modOf(e.left, e.right);
      case ts.SyntaxKind.AsteriskAsteriskToken: return `pow(${this.expr(e.left)}, ${this.expr(e.right)})`;
      case ts.SyntaxKind.BarToken: case ts.SyntaxKind.AmpersandToken: case ts.SyntaxKind.CaretToken:
      case ts.SyntaxKind.LessThanLessThanToken: case ts.SyntaxKind.GreaterThanGreaterThanToken:
      case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
        return this.bitwise(opText, e.left, e.right);
    }
    return `${this.opnd(e.left)} ${opText} ${this.opnd(e.right)}`;
  }

  private boolContext(e: ts.Node): boolean {
    let n: ts.Node = e;
    let p = n.parent;
    while (p && (ts.isParenthesizedExpression(p) || (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || p.operatorToken.kind === ts.SyntaxKind.BarBarToken)))) {
      n = p; p = p.parent;
    }
    if (!p) return false;
    if ((ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) && p.expression === n) return true;
    if (ts.isForStatement(p) && p.condition === n) return true;
    if (ts.isConditionalExpression(p) && p.condition === n) return true;
    if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return true;
    return false;
  }

  private equality(e: ts.BinaryExpression, op: string): string {
    const l = unwrap(e.left), r = unwrap(e.right);
    const isNullish = (x: ts.Expression) => x.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(x) && x.text === 'undefined');
    if (isNullish(r)) return `${this.opnd(l)} ${op} null`;
    if (isNullish(l)) return `${this.opnd(r)} ${op} null`;
    const lt = this.typeOf(l), rt = this.typeOf(r);
    const fam = (t: ts.Type) => {
      const nn = this.checker.getNonNullableType(t);
      return this.isNumber(nn) ? 'n' : this.isString(nn) ? 's' : this.isBool(nn) ? 'b' : null;
    };
    // Same primitive family (null allowed on either side): GDScript == agrees with JS.
    if (fam(lt) && fam(lt) === fam(rt)) return `${this.opnd(l)} ${op} ${this.opnd(r)}`;
    // Comparing values of different variant types errors in GDScript; JS just says false.
    const mixed = !(this.isNumber(lt) && this.isNumber(rt)) && !(this.isString(lt) && this.isString(rt)) && !(this.isBool(lt) && this.isBool(rt));
    if (mixed && (this.isPrimitiveish(lt) !== this.isPrimitiveish(rt) || lt.isUnion() || rt.isUnion())) {
      return `${op === '!=' ? 'not ' : ''}TS.eq(${this.expr(l)}, ${this.expr(r)})`;
    }
    if (mixed && !this.isPrimitiveish(lt)) return `${op === '!=' ? 'not ' : ''}is_same(${this.expr(l)}, ${this.expr(r)})`;
    return `${this.opnd(l)} ${op} ${this.opnd(r)}`;
  }

  /** Operand of an infix operator (parenthesized unless atomic). */
  private opnd(e: ts.Expression): string {
    return paren(this.expr(e));
  }

  private strOf(e: ts.Expression): string {
    const t = this.typeOf(e);
    const v = this.expr(e);
    if (this.isString(t)) return paren(v);
    return `TS.s(${v})`;
  }

  /** Right operand of `/`: forced to float unless it surely is one. */
  private floatOf(e: ts.Expression): string {
    const u = unwrap(e);
    const v = this.expr(e);
    if (ts.isNumericLiteral(u)) return /^0x/i.test(v) ? `float(${v})` : /[.e]/i.test(v) ? v : v + '.0';
    if (this.isFloatExpr(u)) return paren(v);
    return `float(${v})`;
  }

  private isFloatExpr(e: ts.Expression): boolean {
    e = unwrap(e);
    if (ts.isIdentifier(e)) {
      const s = this.checker.getSymbolAtLocation(e);
      return !!s && this.floats.has(s);
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ts.isIdentifier(e.expression.expression) && e.expression.expression.text === 'Math') {
      return ['sqrt', 'sin', 'cos', 'tan', 'atan2', 'atan', 'asin', 'acos', 'exp', 'log', 'hypot', 'random', 'pow'].includes(e.expression.name.text);
    }
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.SlashToken].includes(e.operatorToken.kind)) {
      return e.operatorToken.kind === ts.SyntaxKind.SlashToken || this.isFloatExpr(e.left) || this.isFloatExpr(e.right);
    }
    if (ts.isNumericLiteral(e)) return e.text.includes('.');
    return false;
  }

  /** Expressions that are integers in GDScript (range counters, sizes, int literals). */
  private isIntExpr(e: ts.Expression): boolean {
    e = unwrap(e);
    if (ts.isNumericLiteral(e)) return /^(0x[0-9a-f]+|\d+)$/i.test(e.text.replace(/_/g, ''));
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken) return this.isIntExpr(e.operand);
    if (ts.isIdentifier(e)) { const s = this.checker.getSymbolAtLocation(e); return !!s && this.ints.has(s); }
    if (ts.isPropertyAccessExpression(e) && e.name.text === 'length') return true;
    if (ts.isPropertyAccessExpression(e) && e.name.text === 'size' && (this.isMapType(this.typeOf(e.expression)) || this.isSetType(this.typeOf(e.expression)))) return true;
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if ([ts.SyntaxKind.BarToken, ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.CaretToken, ts.SyntaxKind.LessThanLessThanToken,
        ts.SyntaxKind.GreaterThanGreaterThanToken, ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken].includes(op)) return true;
      if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken].includes(op)) return this.isIntExpr(e.left) && this.isIntExpr(e.right);
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ts.isIdentifier(e.expression.expression) && e.expression.expression.text === 'Math') {
      return ['floor', 'ceil', 'round', 'trunc'].includes(e.expression.name.text) && false;
    }
    return false;
  }

  /** Integer value for range bounds and bit operations. */
  private intOf(e: ts.Expression): string {
    const v = this.expr(e);
    if (this.isIntExpr(e)) return v;
    const u = unwrap(e);
    if (ts.isCallExpression(u) && ts.isPropertyAccessExpression(u.expression) && ts.isIdentifier(u.expression.expression) && u.expression.expression.text === 'Math') {
      const f = u.expression.name.text;
      if (f === 'floor') return `floori(${this.expr(u.arguments[0])})`;
      if (f === 'ceil') return `ceili(${this.expr(u.arguments[0])})`;
      if (f === 'round') return `TS.roundi(${this.expr(u.arguments[0])})`;
    }
    return `int(${v})`;
  }

  private modOf(a: ts.Expression, b: ts.Expression): string {
    if (this.isIntExpr(a) && this.isIntExpr(b)) return `${this.opnd(a)} % ${this.opnd(b)}`;
    return `fmod(${this.expr(a)}, ${this.expr(b)})`;
  }

  private bitwise(op: string, a: ts.Expression, b: ts.Expression): string {
    const ub = unwrap(b), ua = unwrap(a);
    const A = () => this.intOf(a), B = () => this.intOf(b);
    const lit = (e: ts.Expression) => ts.isNumericLiteral(e) && /^(0x[0-9a-f]+|\d+)$/i.test(e.text) ? Number(e.text) : null;
    const kb = lit(ub), ka = lit(ua);
    const sh = (k: number | null) => k !== null ? String(k & 31) : `(${B()} & 31)`;
    // Inline int32 arithmetic: no calls in the hot paths (hashes, rng, colour packing).
    // x | 0 truncates to int32 in JS.
    if (op === '|' && kb === 0) return wrap32(this.intOf(a), this.isI32(a));
    if (op === '>>>') return kb === 0 ? `(${A()} & 0xFFFFFFFF)` : `((${A()} & 0xFFFFFFFF) >> ${sh(kb)})`;
    if (op === '<<') return wrap32(`(${A()} << ${sh(kb)})`, false);
    if (op === '>>') return `(${wrap32(A(), this.isI32(a))} >> ${sh(kb)})`;
    if (op === '&' && ((kb !== null && kb <= 0x7fffffff) || (ka !== null && ka <= 0x7fffffff))) return `(${A()} & ${B()})`;
    if (op === '^' || op === '|' || op === '&') return wrap32(`(${A()} ${op} ${B()})`, this.isI32(a) && this.isI32(b));
    return `(${A()} ${op} ${B()})`;
  }

  /** Expressions whose GDScript value is already a signed 32-bit int. */
  private isI32(e: ts.Expression): boolean {
    e = unwrap(e);
    if (ts.isNumericLiteral(e)) { const v = Number(e.text); return Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff; }
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      return [ts.SyntaxKind.BarToken, ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.CaretToken, ts.SyntaxKind.LessThanLessThanToken,
        ts.SyntaxKind.GreaterThanGreaterThanToken].includes(k);
    }
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ts.isIdentifier(e.expression.expression) &&
      e.expression.expression.text === 'Math' && e.expression.name.text === 'imul') return true;
    return false;
  }

  private objectLit(e: ts.ObjectLiteralExpression): string {
    const t = this.checker.getContextualType(e) ?? this.typeOf(e);
    const cls = this.classMapped(t);
    const segs: string[] = [];
    let cur: string[] = [];
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) {
        if (cur.length) segs.push(`{${cur.join(', ')}}`);
        cur = [];
        segs.push(this.expr(p.expression));
        continue;
      }
      if (ts.isShorthandPropertyAssignment(p)) {
        cur.push(`${JSON.stringify(p.name.text)}: ${this.identRead(p.name)}`);
        continue;
      }
      if (ts.isPropertyAssignment(p)) {
        const key = ts.isComputedPropertyName(p.name) ? this.expr(p.name.expression) : JSON.stringify(propName(p.name));
        cur.push(`${key}: ${this.expr(p.initializer)}`);
        continue;
      }
      if (ts.isMethodDeclaration(p)) {
        cur.push(`${JSON.stringify(propName(p.name))}: ${this.lambda(p)}`);
        continue;
      }
      if (ts.isGetAccessorDeclaration(p)) {
        // A getter on a literal: evaluate once (literals here are plain data).
        const v = this.lambda(p as unknown as ts.MethodDeclaration);
        cur.push(`${JSON.stringify(propName(p.name))}: ${v}.call()`);
        continue;
      }
      this.problem(p, 'object member ' + ts.SyntaxKind[p.kind]);
    }
    if (cur.length || !segs.length) segs.push(`{${cur.join(', ')}}`);
    // `{ ...x }` alone is still a copy.
    const onlySpread = segs.length === 1 && e.properties.length === 1 && ts.isSpreadAssignment(e.properties[0]);
    const dict = segs.length === 1 && !onlySpread ? segs[0] : `TS.merge([${segs.join(', ')}])`;
    if (cls) return `${cls}.from_dict(${dict})`;
    return dict;
  }

  private classMapped(t: ts.Type): string | null {
    const nn = this.checker.getNonNullableType(t);
    const s = nn.aliasSymbol ?? nn.getSymbol();
    if (!s || (nn.getSymbol()?.flags ?? 0) & ts.SymbolFlags.Class) return null;
    return this.classTypeOf(s);
  }

  /** GDScript class for a TS interface listed in CONFIG.classTypes ("module:Name"). */
  private classTypeOf(s: ts.Symbol): string | null {
    const d = s.declarations?.[0];
    if (!d) return null;
    return CONFIG.classTypes[`${this.modPath(d.getSourceFile().fileName)}:${s.name}`] ?? null;
  }

  /** Reference to a declaration: bare inside its module, ClassName.x outside. */
  private resolve(id: ts.Identifier): { sym: ts.Symbol; decl: ts.Declaration | undefined } | null {
    let sym = ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
      ? this.checker.getShorthandAssignmentValueSymbol(id.parent) : this.checker.getSymbolAtLocation(id);
    if (!sym) return null;
    if (sym.flags & ts.SymbolFlags.Alias) sym = this.checker.getAliasedSymbol(sym);
    return { sym, decl: sym.valueDeclaration ?? sym.declarations?.[0] };
  }

  private topLevelOwner(decl: ts.Declaration): string | null {
    const sf = decl.getSourceFile();
    let n: ts.Node = decl;
    if (ts.isVariableDeclaration(n)) n = n.parent.parent; // VariableStatement
    if (n.parent !== sf) return null;
    return this.modPath(sf.fileName);
  }

  private identRead(e: ts.Identifier): string {
    const r = this.resolve(e);
    const v = this.identRef(e);
    if (r && this.boxed.has(r.sym)) return v;
    if (r?.decl && this.scope.builder && false) return v;
    return v;
  }

  /** Identifier as an expression or assignment target. */
  identRef(e: ts.Identifier): string {
    const r = this.resolve(e);
    if (!r || !r.decl) return ident(e.text);
    const { sym, decl } = r;
    const local = this.renames.get(sym) ?? ident(e.text);
    if (this.boxed.has(sym)) return `${local}[0]`;
    const owner = this.topLevelOwner(decl);
    if (owner === null) return local;
    const isClass = ts.isClassDeclaration(decl);
    const name = isClass ? (decl.name?.text ?? e.text) : ts.isVariableDeclaration(decl) && !this.isModuleFn(decl) ? ident((decl.name as ts.Identifier).text, true) : ident(sym.name);
    const manual = CONFIG.manual[owner];
    if (owner === this.mod && !manual) {
      // Inside an inner class, module members need the module's class name.
      return this.scope.cls ? `${this.classFor(owner)}.${name}` : name;
    }
    return `${this.classFor(owner)}.${name}`;
  }

  private isModuleFn(d: ts.VariableDeclaration): boolean {
    const i = d.initializer && unwrap(d.initializer);
    return !!i && (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) && !this.isReassigned(d);
  }

  private isStaticClassRef(e: ts.Expression): boolean {
    e = unwrap(e);
    if (!ts.isIdentifier(e)) return false;
    const r = this.resolve(e);
    return !!r?.decl && ts.isClassDeclaration(r.decl);
  }

  private typeRef(e: ts.Expression): string {
    if (ts.isIdentifier(e)) {
      const r = this.resolve(e);
      if (r?.decl && ts.isClassDeclaration(r.decl)) {
        const owner = this.topLevelOwner(r.decl);
        if (owner && (owner !== this.mod || this.scope?.cls)) return `${this.classFor(owner)}.${r.decl.name!.text}`;
        return r.decl.name!.text;
      }
      return e.text;
    }
    return this.expr(e);
  }

  private propRead(e: ts.PropertyAccessExpression): string {
    const name = e.name.text;
    const obj = e.expression;
    // Globals.
    if (ts.isIdentifier(obj)) {
      const g = obj.text;
      if (g === 'Math' && !this.resolve(obj)?.decl?.getSourceFile().fileName.includes('/src/')) {
        const c = MATH_CONST[name];
        if (c) return c;
        if (name === 'random') return 'TS.random';
      }
      if (g === 'Number') {
        if (name === 'EPSILON') return '2.220446049250313e-16';
        if (name === 'MAX_SAFE_INTEGER') return '9007199254740991';
        if (name === 'POSITIVE_INFINITY') return 'INF';
        if (name === 'NEGATIVE_INFINITY') return '-INF';
        if (name === 'MAX_VALUE') return '1.7976931348623157e308';
      }
    }
    const objT = this.typeOf(obj);
    const o = this.expr(obj);
    const optional = !!e.questionDotToken && !this.noOpt.has(e);
    let read: string;
    if (name === 'length' && (this.isArrayType(objT) || this.isString(objT))) read = this.isString(objT) ? `${paren(o)}.length()` : `${paren(o)}.size()`;
    else if (name === 'size' && (this.isMapType(objT) || this.isSetType(objT))) read = `${paren(o)}.size()`;
    else if (obj.kind === ts.SyntaxKind.ThisKeyword || this.isClassInstance(objT) || this.isStaticClassRef(obj)) {
      // Getter → method call.
      const ps = this.checker.getSymbolAtLocation(e.name);
      if (ps && ps.flags & ts.SymbolFlags.GetAccessor) read = `${paren(o)}.get_${ident(name)}()`;
      else read = `${paren(o)}.${ident(name)}`;
    } else if (this.isModuleNamespace(obj)) {
      read = `${o}.${ident(name)}`;
    } else {
      const ps = this.checker.getPropertyOfType(this.checker.getNonNullableType(objT), name);
      const opt = !ps || !!(ps.flags & ts.SymbolFlags.Optional) || this.mayBeMissing(objT, name);
      read = opt ? `${paren(o)}.get(${JSON.stringify(name)})` : `${paren(o)}[${JSON.stringify(name)}]`;
    }
    if (optional) return `(null if ${o} == null else ${read})`;
    return read;
  }

  private mayBeMissing(t: ts.Type, name: string): boolean {
    const nn = this.checker.getNonNullableType(t);
    if (nn.isUnion()) return nn.types.some((u) => !this.checker.getPropertyOfType(u, name) || !!(this.checker.getPropertyOfType(u, name)!.flags & ts.SymbolFlags.Optional));
    // Index signatures: any key may be missing.
    if (this.checker.getIndexInfosOfType(nn).length && !this.checker.getPropertyOfType(nn, name)) return true;
    return false;
  }

  private isModuleNamespace(e: ts.Expression): boolean {
    if (!ts.isIdentifier(e)) return false;
    const s = this.checker.getSymbolAtLocation(e);
    return !!s && !!(s.flags & ts.SymbolFlags.Alias) && !!this.checker.getAliasedSymbol(s).flags && !!(this.checker.getAliasedSymbol(s).flags & ts.SymbolFlags.ValueModule);
  }

  /** Dictionary key for obj[k]: numeric keys on non-arrays are floats (JS has one number type). */
  private key(k: ts.Expression, obj: ts.Expression): string {
    const objT = this.typeOf(obj);
    const v = this.expr(k);
    if (this.isArrayType(objT) || this.isString(objT)) return v;
    if (this.isNumber(this.typeOf(k))) return `float(${v})`;
    return v;
  }

  private elemRead(e: ts.ElementAccessExpression): string {
    const objT = this.typeOf(e.expression);
    const o = this.expr(e.expression);
    if (this.scope.builder && ts.isArrayLiteralExpression(unwrap(e.expression))) {
      return `TX.pick(${o}, ${this.expr(e.argumentExpression)})`;
    }
    if (this.scope.builder && !this.isConcrete(e.argumentExpression)) {
      return `TX.pick(${o}, ${this.expr(e.argumentExpression)})`;
    }
    const k = this.key(e.argumentExpression, e.expression);
    let read: string;
    if (this.isArrayType(objT)) read = `TS.at(${o}, ${k})`;
    else if (this.isString(objT)) read = `${paren(o)}[${k}]`;
    else if (this.isClassInstance(objT)) read = `${paren(o)}.get(${k})`;
    else read = `${paren(o)}.get(${k})`;
    // Plain array reads by an int index don't need the bounds-safe helper.
    if (this.isArrayType(objT) && this.isTupleOrSafe(e)) read = `${paren(o)}[${k}]`;
    if (e.questionDotToken && !this.noOpt.has(e)) return `(null if ${o} == null else ${read})`;
    return read;
  }

  /** Builder mode: is this value certainly concrete (not x, y or ph)? */
  private isConcrete(e: ts.Expression): boolean {
    let ok = true;
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n)) {
        const s = this.checker.getSymbolAtLocation(n);
        const d = s?.valueDeclaration;
        if (d && ts.isParameter(d) && this.texFns.has(d.parent)) ok = false;
        if (d && ts.isVariableDeclaration(d) && enclosingFunction(d) && this.texFns.has(enclosingFunction(d)!)) ok = false;
      }
      ts.forEachChild(n, visit);
    };
    visit(e);
    return ok;
  }

  private isTupleOrSafe(e: ts.ElementAccessExpression): boolean {
    const objT = this.checker.getNonNullableType(this.typeOf(e.expression));
    if (this.checker.isTupleType(objT) && ts.isNumericLiteral(unwrap(e.argumentExpression))) return true;
    // Reads that may run past the end (tested, defaulted, optional-chained) keep JS's undefined.
    let n: ts.Node = e;
    let p = n.parent;
    while (p && (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p))) { n = p; p = p.parent; }
    if (!p) return true;
    if (ts.isBinaryExpression(p) && p.left === n) {
      const k = p.operatorToken.kind;
      if (k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.AmpersandAmpersandToken) return false;
      if ((k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken)) return false;
    }
    if (ts.isBinaryExpression(p) && p.right === n && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return false;
    if (ts.isPropertyAccessExpression(p) && p.questionDotToken) return false;
    if (ts.isElementAccessExpression(p) && p.questionDotToken) return false;
    if (ts.isIfStatement(p) || ts.isConditionalExpression(p) && p.condition === n) return false;
    if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return false;
    const t = this.typeOf(e);
    if (t.isUnion() && t.types.some((u) => u.flags & ts.TypeFlags.Undefined)) return false;
    return true;
  }

  private newExpr(e: ts.NewExpression): string {
    const c = unwrap(e.expression);
    const args = e.arguments ?? ts.factory.createNodeArray();
    const a = (i: number) => this.expr(args[i]);
    if (ts.isIdentifier(c)) {
      switch (c.text) {
        case 'Map': return args.length ? `TS.map_of(${a(0)})` : '{}';
        case 'Set': case 'WeakSet': return args.length ? `TS.set_of(${a(0)})` : '{}';
        case 'WeakMap': return '{}';
        case 'Array': return args.length ? `TS.array(${a(0)})` : '[]';
        case 'Error': return args.length ? a(0) : '"error"';
        case 'Uint32Array': case 'Uint16Array': case 'Uint8Array': case 'Int32Array': case 'Float32Array': case 'Float64Array':
        case 'Uint8ClampedArray': case 'Int8Array': case 'Int16Array': {
          // A byte view of a pixel buffer is the pixel buffer itself (Canvas2D reads packed RGBA ints).
          const src = args.length ? unwrap(args[0]) : null;
          if (src && ts.isPropertyAccessExpression(src) && src.name.text === 'buffer') return this.expr(src.expression);
          return `TS.typed_array(${args.length ? a(0) : 0})`;
        }
        case 'ImageData': return `Canvas2D.ImageData.new(${args.map((x) => this.expr(x)).join(', ')})`;
      }
    }
    const t = this.typeRef(c);
    return `${t}.new(${args.map((x) => this.expr(x)).join(', ')})`;
  }

  callExpr(e: ts.CallExpression, ignoreOptional = false): string {
    const callee = unwrap(e.expression);
    const args = e.arguments;
    // Optional call or member: guard.
    const optCall = !!e.questionDotToken && !this.noOpt.has(e);
    const optMember = ts.isPropertyAccessExpression(callee) && !!callee.questionDotToken && !this.noOpt.has(callee);
    if (!ignoreOptional && (optCall || optMember)) {
      if (optCall) {
        const f = this.expr(callee);
        return `(null if ${f} == null else ${this.callWith(e, f)})`;
      }
      const pa = callee as ts.PropertyAccessExpression;
      const o = this.expr(pa.expression);
      return `(null if ${o} == null else ${this.callExpr(e, true)})`;
    }
    // /re/.test(s): a RegEx compiled once (TS.re_test caches by pattern).
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'test' && ts.isRegularExpressionLiteral(unwrap(callee.expression)) && args.length === 1) {
      const lit = (unwrap(callee.expression) as ts.RegularExpressionLiteral).text;
      const body = lit.slice(1, lit.lastIndexOf('/'));
      const flags = lit.slice(lit.lastIndexOf('/') + 1);
      if (!/^i?$/.test(flags)) this.problem(e, `regex flags ${flags}`);
      return `TS.re_test(${JSON.stringify((flags ? '(?i)' : '') + body)}, ${this.expr(args[0])})`;
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const special = this.builtinCall(e, callee);
      if (special !== null) return special;
    }
    if (ts.isIdentifier(callee)) {
      const g = this.globalCall(e, callee.text);
      if (g !== null) return g;
    }
    // Plain function reference (module function) vs a function value.
    if (ts.isIdentifier(callee)) {
      const r = this.resolve(callee);
      const d = r?.decl;
      const isFn = d && (ts.isFunctionDeclaration(d) || (ts.isVariableDeclaration(d) && this.isModuleFn(d) && this.topLevelOwner(d) !== null));
      if (isFn) {
        let name = this.identRef(callee);
        if (this.scope.builder && this.topLevelOwner(d!) === 'render/pixel/tex' && callee.text === 'hash') {
          return `TX.hash(${this.argList(args)})`;
        }
        if (this.scope.builder && this.topLevelOwner(d!) !== null) {
          const fnNode = ts.isFunctionDeclaration(d!) ? d! : unwrap((d as ts.VariableDeclaration).initializer!);
          if (!this.texFns.has(fnNode) && !CONFIG.manual[this.topLevelOwner(d!)!] && !BUILDER_PASS.has(callee.text)) {
            this.twinNeeded.add(fnNode);
            name += '__tx';
          }
        }
        const fnNode = ts.isFunctionDeclaration(d!) ? d! : unwrap((d as ts.VariableDeclaration).initializer!) as ts.ArrowFunction;
        if (args.length > fnNode.parameters.length && !fnNode.parameters.some((p) => p.dotDotDotToken) && !args.some(ts.isSpreadElement)) {
          return `${name}(${args.slice(0, fnNode.parameters.length).map((a) => this.expr(a)).join(', ')})`;
        }
        return this.callArgs(name, args, e);
      }
      return this.callWith(e, this.identRef(callee));
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const objT = this.typeOf(callee.expression);
      const ps = this.checker.getSymbolAtLocation(callee.name);
      const isMethod = ps && (ps.flags & ts.SymbolFlags.Method);
      if (callee.expression.kind === ts.SyntaxKind.SuperKeyword) return `super.${ident(callee.name.text)}(${this.argList(args)})`;
      if (isMethod && (this.isClassInstance(objT) || callee.expression.kind === ts.SyntaxKind.ThisKeyword || this.isStaticClassRef(callee.expression))) {
        return this.callArgs(`${paren(this.expr(callee.expression))}.${ident(callee.name.text)}`, args, e);
      }
      if (this.isModuleNamespace(callee.expression)) return this.callArgs(`${this.expr(callee.expression)}.${ident(callee.name.text)}`, args, e);
      if (this.isClassInstance(objT) && !(ps && ps.flags & ts.SymbolFlags.Property)) {
        return this.callArgs(`${paren(this.expr(callee.expression))}.${ident(callee.name.text)}`, args, e);
      }
      // A function stored in a property (object literal methods, callbacks).
      return this.callWith(e, this.propRead(callee));
    }
    return this.callWith(e, paren(this.expr(callee)));
  }

  /** f.call(args) for function values. */
  private callWith(e: ts.CallExpression, f: string): string {
    if (e.arguments.some(ts.isSpreadElement)) return `${paren(f)}.callv(${this.spreadArgs(e.arguments)})`;
    return `${paren(f)}.call(${this.argList(e.arguments)})`;
  }

  private callArgs(name: string, args: ts.NodeArray<ts.Expression>, e: ts.CallExpression): string {
    if (args.some(ts.isSpreadElement)) return `${name}.callv(${this.spreadArgs(args)})`;
    // JS ignores extra arguments; GDScript rejects them.
    const d = this.checker.getResolvedSignature(e)?.declaration;
    if (d && !ts.isJSDocSignature(d) && args.length > d.parameters.length && !d.parameters.some((p) => p.dotDotDotToken)) {
      return `${name}(${args.slice(0, d.parameters.length).map((a) => this.expr(a)).join(', ')})`;
    }
    return `${name}(${this.argList(args)})`;
  }

  /** contextArity for an object literal method (`draw(r, H) { ... }` in a typed literal). */
  private methodArity(fn: ts.MethodDeclaration): number {
    if (!ts.isObjectLiteralExpression(fn.parent)) return 0;
    let t: ts.Type | undefined;
    try { t = this.checker.getContextualType(fn.parent); } catch { t = undefined; }
    if (!t) return 0;
    let max = 0;
    for (const part of t.isUnion() ? t.types : [t]) {
      const prop = part.getProperty(propName(fn.name));
      if (!prop) continue;
      const pt = this.checker.getNonNullableType(this.checker.getTypeOfSymbolAtLocation(prop, fn));
      for (const sig of pt.getCallSignatures()) max = Math.max(max, sig.parameters.length);
    }
    return max;
  }

  /** Parameter count a function value must accept where it is passed (JS callers may pass more than it declares). */
  private contextArity(n: ts.Expression): number {
    let t: ts.Type | undefined;
    try { t = this.checker.getContextualType(n); } catch { t = undefined; }
    if (!t) return 0;
    let max = 0;
    for (const part of t.isUnion() ? t.types : [t]) {
      for (const sig of part.getCallSignatures()) {
        const d = sig.declaration;
        if (d && !ts.isJSDocSignature(d) && d.parameters.some((p) => p.dotDotDotToken)) continue;
        max = Math.max(max, sig.parameters.length);
      }
    }
    return max;
  }

  private argList(args: ts.NodeArray<ts.Expression>): string {
    return args.map((a) => this.expr(a)).join(', ');
  }

  private spreadArgs(args: ts.NodeArray<ts.Expression>): string {
    const segs: string[] = [];
    let cur: string[] = [];
    for (const a of args) {
      if (ts.isSpreadElement(a)) {
        if (cur.length) segs.push(`[${cur.join(', ')}]`);
        cur = [];
        segs.push(`TS.arr(${this.expr(a.expression)})`);
      } else cur.push(this.expr(a));
    }
    if (cur.length) segs.push(`[${cur.join(', ')}]`);
    return segs.join(' + ');
  }

  private globalCall(e: ts.CallExpression, name: string): string | null {
    const r = this.resolve(e.expression as ts.Identifier);
    if (r?.decl && r.decl.getSourceFile().fileName.includes('/src/')) return null;
    const a = (i: number) => this.expr(e.arguments[i]);
    switch (name) {
      case 'Number': return `TS.num(${a(0)})`;
      case 'String': return `TS.s(${a(0)})`;
      case 'Boolean': return `TS.truthy(${a(0)})`;
      case 'parseInt': return `int(${a(0)})`;
      case 'parseFloat': return `float(${a(0)})`;
      case 'isNaN': return `is_nan(${a(0)})`;
      case 'isFinite': return `is_finite(${a(0)})`;
      case 'structuredClone': return `TS.clone(${a(0)})`;
    }
    return null;
  }

  /**
   * Right operand of &&, ||, ??: `lazy` when evaluating it eagerly could
   * differ from JS (it calls, reads properties, or needs hoisted statements).
   */
  private lazyRight(n: ts.Expression): { v: string; lazy: boolean } {
    const sc = this.scope;
    const before = sc.pre.length;
    const v = this.expr(n);
    if (sc.pre.length !== before) return { v, lazy: true };
    const u = unwrap(n);
    const trivial = ts.isLiteralExpression(u) || ts.isIdentifier(u) || u.kind === ts.SyntaxKind.TrueKeyword ||
      u.kind === ts.SyntaxKind.FalseKeyword || u.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isPrefixUnaryExpression(u) && ts.isLiteralExpression(u.operand));
    return { v, lazy: !trivial };
  }

  /** Calls on built-ins: Math, Object, Array/String/Map/Set methods. */
  private builtinCall(e: ts.CallExpression, callee: ts.PropertyAccessExpression): string | null {
    const obj = unwrap(callee.expression);
    const name = callee.name.text;
    const args = e.arguments;
    const a = (i: number) => this.expr(args[i]);
    const all = () => this.argList(args);
    const B = this.scope.builder;
    if (ts.isIdentifier(obj) && !this.resolve(obj)?.decl?.getSourceFile().fileName.includes('/src/')) {
      const g = obj.text;
      if (g === 'Math') {
        if (B && BUILDER_MATH[name]) return `TX.${BUILDER_MATH[name]}(${all()})`;
        switch (name) {
          case 'floor': return `floor(${a(0)})`;
          case 'ceil': return `ceil(${a(0)})`;
          case 'round': return `TS.round(${a(0)})`;
          case 'trunc': return `TS.trunc(${a(0)})`;
          case 'abs': return `absf(${a(0)})`;
          case 'sign': return `signf(${a(0)})`;
          case 'sqrt': return `sqrt(${a(0)})`;
          case 'cbrt': return `TS.cbrt(${a(0)})`;
          case 'sin': case 'cos': case 'tan': case 'asin': case 'acos': case 'atan': case 'exp': case 'log': case 'sinh': case 'cosh': case 'tanh':
            return `${name}(${a(0)})`;
          case 'log2': return `(log(${a(0)}) / log(2.0))`;
          case 'log10': return `(log(${a(0)}) / log(10.0))`;
          case 'atan2': return `atan2(${a(0)}, ${a(1)})`;
          case 'pow': return `pow(${a(0)}, ${a(1)})`;
          case 'hypot': if (args.length === 2 && args.some(hasCall)) return `TS.hypot2(${a(0)}, ${a(1)})`;
            return args.length === 2 ? `sqrt(${paren(a(0))} * ${paren(a(0))} + ${paren(a(1))} * ${paren(a(1))})`.replace(/^sqrt\((\w+) \* \1 \+ (\w+) \* \2\)$/, 'sqrt($1 * $1 + $2 * $2)') : `TS.hypot([${all()}])`;
          case 'min': case 'max':
            if (args.some(ts.isSpreadElement)) return `TS.${name}v(${this.spreadArgs(args)})`;
            if (args.length === 1) return a(0);
            if (args.length === 2) return `${name}f(${a(0)}, ${a(1)})`;
            return `${name}(${all()})`;
          case 'random': return 'randf()';
          case 'imul': return wrap32(`${wrap32(this.intOf(args[0]), this.isI32(args[0]))} * ${wrap32(this.intOf(args[1]), this.isI32(args[1]))}`, false);
          case 'fround': return a(0);
        }
        this.problem(e, 'Math.' + name);
        return null;
      }
      if (g === 'Object') {
        switch (name) {
          case 'entries': return `TS.entries(${a(0)})`;
          case 'keys': return `TS.keys(${a(0)})`;
          case 'values': return `TS.values(${a(0)})`;
          case 'assign': return `TS.assign(${all()})`;
          case 'freeze': return a(0);
          case 'fromEntries': return `TS.from_entries(${a(0)})`;
        }
      }
      if (g === 'Array') {
        if (name === 'isArray') return `(${a(0)} is Array)`;
        if (name === 'from') return args.length > 1 ? `TS.array_from(${a(0)}, ${a(1)})` : `TS.array_from(${a(0)})`;
        if (name === 'of') return `[${all()}]`;
      }
      if (g === 'JSON') {
        if (name === 'stringify') return `JSON.stringify(${a(0)})`;
        if (name === 'parse') return `JSON.parse_string(${a(0)})`;
      }
      if (g === 'Number') {
        if (name === 'isFinite') return `is_finite(${a(0)})`;
        if (name === 'isInteger') return `TS.is_int(${a(0)})`;
        if (name === 'isNaN') return `is_nan(${a(0)})`;
      }
      if (g === 'console') return `print(${all()})`;
      if (g === 'localStorage') {
        if (name === 'getItem') return `Store.get_item(${a(0)})`;
        if (name === 'setItem') return `Store.set_item(${a(0)}, ${a(1)})`;
        if (name === 'removeItem') return `Store.remove_item(${a(0)})`;
      }
      if (g === 'Object' && name === 'create' && args.length === 1) {
        // Object.create(X.prototype): an instance that skips X's constructor.
        const p = unwrap(args[0]);
        if (ts.isPropertyAccessExpression(p) && p.name.text === 'prototype') return `${this.expr(p.expression)}.new(TS.BLANK)`;
      }
      if (g === 'performance' && name === 'now') return '(Time.get_ticks_usec() / 1000.0)';
      if (g === 'document' && name === 'createElement') return 'Canvas2D.Surface.new()';
      if (g === 'Date' && name === 'now') return 'Time.get_unix_time_from_system() * 1000.0';
    }
    const t = this.typeOf(obj);
    const o = () => paren(this.expr(obj));
    if (this.isArrayType(t)) {
      switch (name) {
        case 'push': {
          if (args.length === 1 && !ts.isSpreadElement(args[0])) return `${o()}.append(${a(0)})`;
          return `${o()}.append_array(${args.some(ts.isSpreadElement) ? this.spreadArgs(args) : `[${all()}]`})`;
        }
        case 'pop': return `${o()}.pop_back()`;
        case 'shift': return `${o()}.pop_front()`;
        case 'unshift': return args.length === 1 ? `${o()}.push_front(${a(0)})` : `TS.unshift(${o()}, [${all()}])`;
        case 'includes': return `${o()}.has(${a(0)})`;
        case 'indexOf': return `${o()}.find(${a(0)})`;
        case 'lastIndexOf': return `${o()}.rfind(${a(0)})`;
        case 'slice': return args.length === 0 ? `${o()}.duplicate()` : args.length === 1 ? `TS.slice(${o()}, ${a(0)})` : `TS.slice(${o()}, ${a(0)}, ${a(1)})`;
        case 'concat': return `(${[o(), ...args.map((x) => `TS.arr(${this.expr(x)})`)].join(' + ')})`;
        case 'join': return `TS.join(${o()}, ${args.length ? a(0) : '","'})`;
        case 'map': return this.arrCb(o(), args, 'map', 'map', 1);
        case 'filter': return this.arrCb(o(), args, 'filter', 'filter', 1);
        case 'some': return this.arrCb(o(), args, 'any', 'some', 1);
        case 'every': return this.arrCb(o(), args, 'all', 'every', 1);
        case 'reduce': {
          const f = this.expr(args[0]);
          const u = unwrap(args[0]);
          const native = (ts.isArrowFunction(u) || ts.isFunctionExpression(u)) && u.parameters.length === 2;
          if (native) return args.length > 1 ? `${o()}.reduce(${f}, ${a(1)})` : `${o()}.reduce(${f})`;
          return args.length > 1 ? `TS.reduce(${o()}, ${f}, ${a(1)}, true)` : `TS.reduce(${o()}, ${f})`;
        }
        case 'find': return `TS.find(${o()}, ${this.expr(args[0])})`;
        case 'findIndex': return `TS.find_index(${o()}, ${this.expr(args[0])})`;
        case 'findLast': return `TS.find_last(${o()}, ${this.expr(args[0])})`;
        case 'forEach': return `TS.for_each(${o()}, ${this.expr(args[0])})`;
        case 'sort': return args.length ? `TS.sort(${o()}, ${this.expr(args[0])})` : `TS.sort(${o()})`;
        case 'reverse': return `TS.reverse(${o()})`;
        case 'fill': return args.length === 1 ? `TS.fill(${o()}, ${a(0)})` : `TS.fill(${o()}, ${all()})`;
        case 'splice': return `TS.splice(${o()}, ${all()})`;
        case 'flat': return `TS.flat(${o()})`;
        case 'flatMap': return `TS.flat(TS.map(${o()}, ${this.expr(args[0])}))`;
        case 'at': return `TS.at(${o()}, ${a(0)})`;
        case 'keys': return `range(${o()}.size())`;
        case 'entries': return `TS.array_entries(${o()})`;
        case 'set': return `TS.set_array(${o()}, ${all()})`;
        case 'subarray': return `TS.slice(${o()}, ${all()})`;
      }
    }
    if (this.isString(t)) {
      switch (name) {
        case 'startsWith': return `${o()}.begins_with(${a(0)})`;
        case 'endsWith': return `${o()}.ends_with(${a(0)})`;
        case 'includes': return `${o()}.contains(${a(0)})`;
        case 'indexOf': return `${o()}.find(${a(0)})`;
        case 'slice': return args.length === 1 ? `TS.str_slice(${o()}, ${a(0)})` : `TS.str_slice(${o()}, ${a(0)}, ${a(1)})`;
        case 'substring': return `TS.substring(${o()}, ${all()})`;
        case 'split': return `TS.split(${o()}, ${a(0)})`;
        case 'toUpperCase': return `${o()}.to_upper()`;
        case 'toLowerCase': return `${o()}.to_lower()`;
        case 'trim': return `${o()}.strip_edges()`;
        case 'padStart': return `${o()}.lpad(${a(0)}${args.length > 1 ? ', ' + a(1) : ''})`;
        case 'padEnd': return `${o()}.rpad(${a(0)}${args.length > 1 ? ', ' + a(1) : ''})`;
        case 'repeat': return `${o()}.repeat(${a(0)})`;
        case 'charCodeAt': return `${o()}.unicode_at(${args.length ? a(0) : '0'})`;
        case 'charAt': return `${o()}[${a(0)}]`;
        case 'replace': return `TS.replace(${o()}, ${a(0)}, ${a(1)})`;
        case 'replaceAll': return `${o()}.replace(${a(0)}, ${a(1)})`;
        case 'toString': return o();
      }
    }
    if ((this.isMapType(t) || this.isSetType(t)) && this.objectKeyed(t)) {
      // Dictionaries hash by value in GDScript: object keys go through an identity map.
      switch (name) {
        case 'get': return `TS.id_get(${o()}, ${a(0)})`;
        case 'set': return `TS.id_set(${o()}, ${a(0)}, ${a(1)})`;
        case 'add': return `TS.id_set(${o()}, ${a(0)}, true)`;
        case 'has': return `TS.id_has(${o()}, ${a(0)})`;
        case 'delete': return `TS.id_delete(${o()}, ${a(0)})`;
        case 'clear': return `${o()}.clear()`;
      }
      this.problem(e, 'object-keyed map method ' + name);
    }
    if (this.isMapType(t)) {
      switch (name) {
        case 'get': return `${o()}.get(${this.mapKey(args[0])})`;
        case 'set': return `TS.map_set(${o()}, ${this.mapKey(args[0])}, ${a(1)})`;
        case 'has': return `${o()}.has(${this.mapKey(args[0])})`;
        case 'delete': return `${o()}.erase(${this.mapKey(args[0])})`;
        case 'clear': return `${o()}.clear()`;
        case 'keys': return `${o()}.keys()`;
        case 'values': return `${o()}.values()`;
        case 'entries': return `TS.entries(${o()})`;
        case 'forEach': return `TS.map_for_each(${o()}, ${this.expr(args[0])})`;
      }
    }
    if (this.isSetType(t)) {
      switch (name) {
        case 'add': return `TS.set_add(${o()}, ${this.mapKey(args[0])})`;
        case 'has': return `${o()}.has(${this.mapKey(args[0])})`;
        case 'delete': return `${o()}.erase(${this.mapKey(args[0])})`;
        case 'clear': return `${o()}.clear()`;
        case 'values': case 'keys': return `${o()}.keys()`;
        case 'forEach': return `TS.for_each(${o()}.keys(), ${this.expr(args[0])})`;
      }
    }
    if (this.isNumber(t) && name === 'toFixed') return `TS.to_fixed(${this.expr(obj)}, ${args.length ? a(0) : '0'})`;
    if (name === 'toString' && args.length === 0) return `TS.s(${this.expr(obj)})`;
    if (this.isFunctionType(t) && (name === 'call' || name === 'apply' || name === 'bind')) {
      this.problem(e, 'Function.' + name);
    }
    return null;
  }

  /** Map/Set whose keys are plain objects (dictionaries on the GDScript side). */
  private objectKeyed(t: ts.Type): boolean {
    const nn = this.checker.getNonNullableType(t) as ts.TypeReference;
    const args = this.checker.getTypeArguments(nn);
    const k = args?.[0];
    if (!k) return false;
    if (this.isPrimitiveish(k)) return false;
    if (this.isClassInstance(k)) return false;
    return true;
  }

  private mapKey(k: ts.Expression): string {
    const v = this.expr(k);
    return this.isNumber(this.typeOf(k)) ? `float(${v})` : v;
  }

  /** Array callbacks: GDScript's own methods call with exactly one argument, so others go through TS. */
  private arrCb(o: string, args: ts.NodeArray<ts.Expression>, native: string, helper: string, arity: number): string {
    const u = unwrap(args[0]);
    const f = this.expr(args[0]);
    // Only map is safe natively: filter/any/all booleanize GDScript-style (empty arrays are falsy there).
    if (native === 'map' && (ts.isArrowFunction(u) || ts.isFunctionExpression(u)) && u.parameters.length === arity && !this.scope.builder) {
      return `${o}.map(${f})`;
    }
    return `TS.${helper}(${o}, ${f})`;
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const BUILDER_OPS: Record<string, string> = {
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '**': 'pow',
  '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge', '===': 'eq', '==': 'eq', '!==': 'ne', '!=': 'ne',
  '&': 'band', '|': 'bor', '^': 'bxor', '<<': 'shl', '>>': 'shr', '>>>': 'ushr',
};
const BUILDER_MATH: Record<string, string> = {
  floor: 'floor', ceil: 'ceil', round: 'round', trunc: 'trunc', abs: 'abs', sign: 'sign', sqrt: 'sqrt', sin: 'sin', cos: 'cos',
  atan2: 'atan2', pow: 'pow', min: 'min', max: 'max', imul: 'imul', hypot: 'hypot', exp: 'exp', tan: 'tan', atan: 'atan',
};
/** Helpers that the TX runtime already understands symbolically. */
const BUILDER_PASS = new Set<string>([]);

const MATH_CONST: Record<string, string> = {
  PI: 'PI', E: '2.718281828459045', SQRT2: '1.4142135623730951', SQRT1_2: '0.7071067811865476', LN2: '0.6931471805599453',
  LN10: '2.302585092994046', LOG2E: '1.4426950408889634', LOG10E: '0.4342944819032518',
};

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) {
    e = e.expression;
  }
  return e;
}

function isAssignOp(k: ts.SyntaxKind): boolean {
  return k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
}

function compoundOp(k: ts.SyntaxKind): string {
  const t = ts.tokenToString(k)!;
  return t.slice(0, -1);
}

function propName(n: ts.PropertyName): string {
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isPrivateIdentifier(n)) return n.text;
  return n.getText();
}

function paren(s: string): string {
  if (simpleExpr(s)) return s;
  if (/^"([^"\\]|\\.)*"$/.test(s)) return s;
  if (/^-?(0x[0-9a-f]+|[\d.e_]+)$/i.test(s)) return s.startsWith('-') ? `(${s})` : s;
  if (s.startsWith('(') && balanced(s.slice(1, -1)) && s.endsWith(')')) return s;
  return `(${s})`;
}

function balanced(s: string): boolean {
  let d = 0;
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { d--; if (d < 0) return false; }
  }
  return d === 0;
}

/** Identifiers, member chains and calls: safe to repeat and to use as operands. */
function simpleExpr(s: string): boolean {
  if (/^[A-Za-z_][\w]*(\.[A-Za-z_]\w*)*$/.test(s)) return true;
  // name.chain(...) or name[...] with balanced brackets and no top-level operators.
  if (/^[A-Za-z_][\w.]*[([]/.test(s) && (s.endsWith(')') || s.endsWith(']'))) {
    let d = 0;
    let q: string | null = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"') q = c;
      else if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
      else if (d === 0 && /[\s+\-*/%<>=!&|]/.test(c)) return false;
    }
    return d === 0;
  }
  return false;
}

function numLit(text: string): string {
  const t = text.replace(/_/g, '');
  if (/^0[xob]/i.test(t)) return t.toLowerCase().startsWith('0x') ? '0x' + t.slice(2).toLowerCase() : String(Number(t));
  if (t.startsWith('.')) return '0' + t;
  if (/e/i.test(t) && !t.includes('.')) {
    const [m, ex] = t.split(/e/i);
    return `${m}.0e${ex}`;
  }
  return t;
}

function isLiteralPrimitive(e: ts.Expression): boolean {
  e = unwrap(e);
  if (ts.isNumericLiteral(e) || ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
  if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(unwrap(e.operand))) return true;
  return false;
}

function enclosingFunction(n: ts.Node): ts.Node | null {
  let p = n.parent;
  while (p) {
    if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p) ||
      ts.isConstructorDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) return p;
    if (ts.isSourceFile(p)) return null;
    p = p.parent;
  }
  return null;
}

function blockStmts(s: ts.Statement): ts.Statement[] {
  return ts.isBlock(s) ? [...s.statements] : [s];
}

function alwaysReturns(stmts: ts.Statement[]): boolean {
  const last = stmts[stmts.length - 1];
  if (!last) return false;
  if (ts.isReturnStatement(last)) return true;
  if (ts.isIfStatement(last)) return !!last.elseStatement && alwaysReturns(blockStmts(last.thenStatement)) && alwaysReturns(blockStmts(last.elseStatement));
  if (ts.isBlock(last)) return alwaysReturns([...last.statements]);
  return false;
}

function leadingDoc(_sf: ts.SourceFile, _st: ts.Statement | undefined): string {
  return '';
}

/** Does evaluating `n` call anything (so it must not run twice)? */
function hasCall(n: ts.Node): boolean {
  let found = false;
  const visit = (x: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(x) || ts.isNewExpression(x) || ts.isTaggedTemplateExpression(x)) { found = true; return; }
    if (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) return;
    ts.forEachChild(x, visit);
  };
  visit(n);
  return found;
}

/** Does evaluating `n` assign anything (so it must not run early)? */
function hasSideEffect(n: ts.Node): boolean {
  let found = false;
  const visit = (x: ts.Node): void => {
    if (found) return;
    if (ts.isBinaryExpression(x) && isAssignOp(x.operatorToken.kind)) { found = true; return; }
    if ((ts.isPrefixUnaryExpression(x) || ts.isPostfixUnaryExpression(x)) &&
      (x.operator === ts.SyntaxKind.PlusPlusToken || x.operator === ts.SyntaxKind.MinusMinusToken)) { found = true; return; }
    if (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) return;
    ts.forEachChild(x, visit);
  };
  visit(n);
  return found;
}

/** JS ToInt32 of an int expression, inline: `x` already int32 stays as is. */
function wrap32(x: string, already: boolean): string {
  return already ? x : `((((${x}) + 0x80000000) & 0xFFFFFFFF) - 0x80000000)`;
}
