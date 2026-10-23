class_name TX
## Surface textures as data. A skin's texture (`Tex` in the web game) is a
## function of the pixel's part-space position (x, y) and the animation
## phase. The converter emits texture bodies in "builder mode": every
## operation goes through these functions, which fold to plain numbers when
## all inputs are known and otherwise build an expression tree. The tree is
## compiled to register bytecode that the forge's compute shader evaluates
## per pixel on the GPU.

# Opcodes, shared with forge_raster.glsl.
enum {
	OP_CONST = 1, OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD, OP_POW, OP_NEG,
	OP_LT, OP_LE, OP_GT, OP_GE, OP_EQ, OP_NE, OP_AND, OP_OR, OP_NOT, OP_SEL,
	OP_FLOOR, OP_CEIL, OP_ROUND, OP_TRUNC, OP_ABS, OP_SIGN, OP_SQRT, OP_SIN, OP_COS, OP_TAN, OP_ATAN, OP_ATAN2,
	OP_EXP, OP_MIN, OP_MAX, OP_HYPOT,
	OP_BAND, OP_BOR, OP_BXOR, OP_SHL, OP_SHR, OP_USHR, OP_IMUL, OP_BNOT, OP_HASH, OP_PICK,
}

## Registers 0..2 hold x, y and the phase.
const REG_X := 0
const REG_Y := 1
const REG_PH := 2
const MAX_REGS := 48


class Expr extends RefCounted:
	var op: int
	var args: Array
	## OP_PICK: the constants to pick from.
	var table: PackedFloat32Array
	## Leaf register (x, y, ph) or -1.
	var reg := -1

	func _init(o: int, a: Array = []) -> void:
		op = o
		args = a


static var X := _leaf(REG_X)
static var Y := _leaf(REG_Y)
static var PH := _leaf(REG_PH)


static func _leaf(r: int) -> Expr:
	var n := Expr.new(0)
	n.reg = r
	return n


static func _num(v) -> bool:
	return v is float or v is int or v is bool


static func _f(v) -> float:
	if v is bool: return 1.0 if v else 0.0
	return float(v)


static func _truthy(v) -> bool:
	if v is bool: return v
	var f := float(v)
	return f != 0.0 and not is_nan(f)


static func _js_mod(a: float, b: float) -> float:
	return fmod(a, b)


static func add(a, b):
	if _num(a) and _num(b): return _f(a) + _f(b)
	if _num(b) and _f(b) == 0.0: return a
	if _num(a) and _f(a) == 0.0: return b
	return Expr.new(OP_ADD, [a, b])


static func sub(a, b):
	if _num(a) and _num(b): return _f(a) - _f(b)
	if _num(b) and _f(b) == 0.0: return a
	return Expr.new(OP_SUB, [a, b])


static func mul(a, b):
	if _num(a) and _num(b): return _f(a) * _f(b)
	if _num(b) and _f(b) == 1.0: return a
	if _num(a) and _f(a) == 1.0: return b
	return Expr.new(OP_MUL, [a, b])


static func div(a, b):
	if _num(a) and _num(b): return _f(a) / _f(b)
	if _num(b) and _f(b) == 1.0: return a
	return Expr.new(OP_DIV, [a, b])


static func mod(a, b):
	if _num(a) and _num(b): return _js_mod(_f(a), _f(b))
	return Expr.new(OP_MOD, [a, b])


static func pow(a, b):
	if _num(a) and _num(b): return pow(_f(a), _f(b))
	return Expr.new(OP_POW, [a, b])


static func neg(a):
	if _num(a): return -_f(a)
	return Expr.new(OP_NEG, [a])


static func lt(a, b):
	if _num(a) and _num(b): return _f(a) < _f(b)
	return Expr.new(OP_LT, [a, b])


static func le(a, b):
	if _num(a) and _num(b): return _f(a) <= _f(b)
	return Expr.new(OP_LE, [a, b])


static func gt(a, b):
	if _num(a) and _num(b): return _f(a) > _f(b)
	return Expr.new(OP_GT, [a, b])


static func ge(a, b):
	if _num(a) and _num(b): return _f(a) >= _f(b)
	return Expr.new(OP_GE, [a, b])


static func eq(a, b):
	if _num(a) and _num(b): return _f(a) == _f(b)
	return Expr.new(OP_EQ, [a, b])


static func ne(a, b):
	if _num(a) and _num(b): return _f(a) != _f(b)
	return Expr.new(OP_NE, [a, b])


## JS a && b: b when a is truthy, else a.
static func and_(a, b):
	if _num(a): return b if _truthy(a) else a
	return Expr.new(OP_AND, [a, b])


static func or_(a, b):
	if _num(a): return a if _truthy(a) else b
	return Expr.new(OP_OR, [a, b])


static func not_(a):
	if _num(a): return not _truthy(a)
	return Expr.new(OP_NOT, [a])


static func sel(c, a, b):
	if _num(c): return a if _truthy(c) else b
	if _num(a) and _num(b) and _f(a) == _f(b): return a
	return Expr.new(OP_SEL, [c, a, b])


static func _un(op: int, a, f: Callable):
	if _num(a): return f.call(_f(a))
	return Expr.new(op, [a])


static func floor(a): return _un(OP_FLOOR, a, func(v: float): return floor(v))
static func ceil(a): return _un(OP_CEIL, a, func(v: float): return ceil(v))
static func round(a): return _un(OP_ROUND, a, func(v: float): return floor(v + 0.5))
static func trunc(a): return _un(OP_TRUNC, a, func(v: float): return TS.trunc(v))
static func abs(a): return _un(OP_ABS, a, func(v: float): return absf(v))
static func sign(a): return _un(OP_SIGN, a, func(v: float): return signf(v))
static func sqrt(a): return _un(OP_SQRT, a, func(v: float): return sqrt(v))
static func sin(a): return _un(OP_SIN, a, func(v: float): return sin(v))
static func cos(a): return _un(OP_COS, a, func(v: float): return cos(v))
static func tan(a): return _un(OP_TAN, a, func(v: float): return tan(v))
static func atan(a): return _un(OP_ATAN, a, func(v: float): return atan(v))
static func exp(a): return _un(OP_EXP, a, func(v: float): return exp(v))
static func bnot(a): return _un(OP_BNOT, a, func(v: float): return float(TS.i32(~TS.i32(v))))


static func atan2(a, b):
	if _num(a) and _num(b): return atan2(_f(a), _f(b))
	return Expr.new(OP_ATAN2, [a, b])


static func min(a, b = null, c = null):
	var r = _min2(a, b) if b != null else a
	return _min2(r, c) if c != null else r


static func max(a, b = null, c = null):
	var r = _max2(a, b) if b != null else a
	return _max2(r, c) if c != null else r


static func _min2(a, b):
	if _num(a) and _num(b): return minf(_f(a), _f(b))
	return Expr.new(OP_MIN, [a, b])


static func _max2(a, b):
	if _num(a) and _num(b): return maxf(_f(a), _f(b))
	return Expr.new(OP_MAX, [a, b])


static func hypot(a, b):
	if _num(a) and _num(b): return sqrt(_f(a) * _f(a) + _f(b) * _f(b))
	return Expr.new(OP_HYPOT, [a, b])


static func _bin_int(op: int, a, b, f: Callable):
	if _num(a) and _num(b): return f.call(_f(a), _f(b))
	return Expr.new(op, [a, b])


static func band(a, b): return _bin_int(OP_BAND, a, b, func(x, y): return float(TS.i32(TS.i32(x) & TS.i32(y))))
static func bor(a, b): return _bin_int(OP_BOR, a, b, func(x, y): return float(TS.i32(TS.i32(x) | TS.i32(y))))
static func bxor(a, b): return _bin_int(OP_BXOR, a, b, func(x, y): return float(TS.i32(TS.i32(x) ^ TS.i32(y))))
static func shl(a, b): return _bin_int(OP_SHL, a, b, func(x, y): return float(TS.shl(x, y)))
static func shr(a, b): return _bin_int(OP_SHR, a, b, func(x, y): return float(TS.i32(x) >> (int(y) & 31)))
static func ushr(a, b): return _bin_int(OP_USHR, a, b, func(x, y): return float(TS.ushr(x, y)))
static func imul(a, b): return _bin_int(OP_IMUL, a, b, func(x, y): return float(TS.imul(x, y)))


## pixel/tex.ts hash(): stable 0..1 noise per integer cell.
static func hash(a, b):
	if _num(a) and _num(b): return hash_cpu(_f(a), _f(b))
	return Expr.new(OP_HASH, [a, b])


static func hash_cpu(x: float, y: float) -> float:
	var h := TS.imul(TS.i32(x), 374761393) + TS.imul(TS.i32(y), 668265263)
	h = TS.imul(TS.i32(h) ^ TS.ushr(h, 13), 1274126177)
	return float(TS.ushr(TS.i32(h) ^ TS.ushr(h, 16), 0)) / 4294967296.0


## [a, b, c][i] with a symbolic index.
static func pick(arr: Array, i):
	if _num(i):
		var k := int(_f(i))
		return arr[k] if k >= 0 and k < arr.size() else NAN
	var all_num := true
	for v in arr:
		if not _num(v): all_num = false
	if all_num:
		var n := Expr.new(OP_PICK, [i])
		n.table = PackedFloat32Array(arr.map(func(v): return _f(v)))
		return n
	# Mixed entries: a chain of selects.
	var out = arr[arr.size() - 1]
	for k in range(arr.size() - 2, -1, -1):
		out = sel(eq(i, k), arr[k], out)
	return out


# -----------------------------------------------------------------------------
# Compilation
# -----------------------------------------------------------------------------

## Compiles a texture to bytecode words (see forge_raster.glsl). Constant
## textures compile to a single CONST. Returns [] when the texture is null.
static func compile(tex) -> PackedInt32Array:
	if tex == null: return PackedInt32Array()
	var root = tex.call(X, Y, PH) if tex is Callable else tex
	var code := PackedInt32Array()
	if _num(root):
		code.append_array([OP_CONST | (3 << 8), _bits(_f(root)), OP_CONST | (255 << 8), 3])
		return code
	# Post-order with sharing; last use per node for register reuse.
	var order: Array[Expr] = []
	var seen := {}
	_topo(root, order, seen)
	var last_use := {}
	for idx in order.size():
		for a in order[idx].args:
			if a is Expr: last_use[a.get_instance_id()] = idx
	var reg := {}
	var free: Array[int] = []
	var next := 3
	for idx in order.size():
		var n: Expr = order[idx]
		if n.reg >= 0: continue
		var srcs: Array[int] = []
		var scratch: Array[int] = []
		for a in n.args:
			if a is Expr:
				srcs.append(a.reg if a.reg >= 0 else reg[a.get_instance_id()])
			else:
				# Inline constant: load into a scratch register.
				var r := _alloc(free, next)
				if r == next: next += 1
				code.append_array([OP_CONST | (r << 8), _bits(_f(a))])
				srcs.append(r)
				scratch.append(r)
		# Operands read here for the last time (and the scratch constants) free up;
		# the destination may reuse them since the shader reads operands first.
		for a in n.args:
			if a is Expr and a.reg < 0 and last_use.get(a.get_instance_id(), -1) == idx:
				var r: int = reg[a.get_instance_id()]
				if not free.has(r): free.append(r)
		free.append_array(scratch)
		var dst := _alloc(free, next)
		if dst == next: next += 1
		reg[n.get_instance_id()] = dst
		while srcs.size() < 3: srcs.append(0)
		code.append(n.op | (dst << 8) | (srcs[0] << 16) | (srcs[1] << 24))
		code.append(srcs[2])
		if n.op == OP_PICK:
			code[code.size() - 1] = n.table.size()
			for v in n.table: code.append(_bits(v))
	if next > MAX_REGS:
		push_error("texture needs %d registers (max %d)" % [next, MAX_REGS])
	# The result register is the root's.
	var out_reg: int = root.reg if root.reg >= 0 else reg[root.get_instance_id()]
	code.append(OP_CONST | (255 << 8)) # end marker: result in a
	code.append(out_reg)
	return code


static func _alloc(free: Array[int], next: int) -> int:
	if free.size():
		free.sort()
		return free.pop_front()
	return next


static func _topo(n, order: Array[Expr], seen: Dictionary) -> void:
	if not (n is Expr) or seen.has(n.get_instance_id()): return
	seen[n.get_instance_id()] = true
	for a in n.args: _topo(a, order, seen)
	order.append(n)


static var _buf := PackedByteArray([0, 0, 0, 0])

static func _bits(v: float) -> int:
	_buf.encode_float(0, v)
	return _buf.decode_s32(0)
