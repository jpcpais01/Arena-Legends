class_name TS
## JavaScript semantics the converted code relies on (godot/tools/ts2gd):
## number formatting, int32 bit math, stable sorting, spreads, and array
## helpers whose GDScript counterparts behave differently.

const _U32 := 0xffffffff

## Passed to constructors to skip them (JS Object.create(X.prototype)).
const BLANK := &"__ts_blank__"


## A JS regex literal: {"test": Callable(String) -> bool}. Flags: only "i".
static func regex(body: String, flags := "") -> Dictionary:
	var re := RegEx.create_from_string(("(?i)" if flags.contains("i") else "") + body)
	return {"test": func(s) -> bool: return re.search(str(s)) != null}


static func random() -> float:
	return randf()


## JS ToInt32: truncate toward zero, then wrap to a signed 32-bit integer.
static func i32(x) -> int:
	var v := int(x) & _U32
	return v - 0x100000000 if v >= 0x80000000 else v


static func u32(x) -> int:
	return int(x) & _U32


static func ushr(a, b) -> int:
	return (int(a) & _U32) >> (int(b) & 31)


static func shl(a, b) -> int:
	return i32(int(a) << (int(b) & 31))


static func imul(a, b) -> int:
	return i32(i32(a) * i32(b))


## Math.round: halves round up (toward +∞), unlike GDScript's round().
static func round(x: float) -> float:
	return floor(x + 0.5)


static func roundi(x: float) -> int:
	return int(floor(x + 0.5))


static func trunc(x: float) -> float:
	return -floor(-x) if x < 0.0 else floor(x)


static func cbrt(x: float) -> float:
	return -pow(-x, 1.0 / 3.0) if x < 0.0 else pow(x, 1.0 / 3.0)


static func hypot2(a: float, b: float) -> float:
	return sqrt(a * a + b * b)


static func hypot(xs: Array) -> float:
	var t := 0.0
	for x in xs:
		t += x * x
	return sqrt(t)


static func maxv(xs: Array) -> float:
	var m := -INF
	for x in xs:
		if x > m: m = x
	return m


static func minv(xs: Array) -> float:
	var m := INF
	for x in xs:
		if x < m: m = x
	return m


static func num(x) -> float:
	if x == null: return NAN
	if x is bool: return 1.0 if x else 0.0
	if x is String: return float(x) if x.is_valid_float() else NAN
	return float(x)


static func is_int(x) -> bool:
	return (x is int) or (x is float and is_finite(x) and floor(x) == x)


## JS String(x): integral numbers print without a decimal point.
static func s(x) -> String:
	if x == null: return "undefined"
	if x is String: return x
	if x is bool: return "true" if x else "false"
	if x is int: return str(x)
	if x is float:
		if is_nan(x): return "NaN"
		if is_inf(x): return "Infinity" if x > 0 else "-Infinity"
		if floor(x) == x and absf(x) < 1e21: return str(int(x))
		return str(x)
	return str(x)


static func to_fixed(x: float, n) -> String:
	return ("%." + str(int(n)) + "f") % x


static func truthy(x) -> bool:
	if x == null: return false
	if x is bool: return x
	if x is int: return x != 0
	if x is float: return x != 0.0 and not is_nan(x)
	if x is String or x is StringName: return x != ""
	return true


static func and_(a, b):
	return b if truthy(a) else a


static func or_(a, b):
	return a if truthy(a) else b


## a && b / a || b / a ?? b with the right side as a thunk (runs only when needed).
static func and_f(a, b: Callable):
	return b.call() if truthy(a) else a


static func or_f(a, b: Callable):
	return a if truthy(a) else b.call()


static func nn_f(a, b: Callable):
	return a if a != null else b.call()


static func nn(a, b):
	return a if a != null else b


static func type_of(x) -> String:
	if x == null: return "undefined"
	if x is bool: return "boolean"
	if x is int or x is float: return "number"
	if x is String or x is StringName: return "string"
	if x is Callable: return "function"
	return "object"


## JS ===: numbers compare by value whatever their variant type; objects by identity.
static func eq(a, b) -> bool:
	if a == null or b == null: return a == null and b == null
	var na := a is int or a is float
	var nb := b is int or b is float
	if na or nb: return na and nb and a == b
	if a is bool or b is bool: return a is bool and b is bool and a == b
	if (a is String or a is StringName) and (b is String or b is StringName): return String(a) == String(b)
	if typeof(a) != typeof(b): return false
	if a is Array or a is Dictionary or a is Object: return is_same(a, b)
	return a == b


# -----------------------------------------------------------------------------
# Objects
# -----------------------------------------------------------------------------

## {...a, ...b}: a new dictionary, later parts winning.
static func merge(parts: Array) -> Dictionary:
	var out := {}
	for p in parts:
		if p is Dictionary:
			out.merge(p, true)
	return out


static func assign(target, a = null, b = null, c = null):
	for p in [a, b, c]:
		if p == null: continue
		if target is Dictionary and p is Dictionary:
			target.merge(p, true)
		else:
			for k in keys(p):
				target[k] = p[k]
	return target


static func omit(d: Dictionary, keys: Array) -> Dictionary:
	var out := d.duplicate()
	for k in keys:
		out.erase(k)
	return out


static func keys(o) -> Array:
	if o is Dictionary: return o.keys()
	if o is Array: return range(o.size()).map(func(i): return str(i))
	if o is Object: return fields(o)
	return []


static var _fields := {}

## Script variables of a class instance (Object.keys of a JS class instance), cached per script.
static func fields(o: Object) -> Array:
	var sc = o.get_script()
	var f = _fields.get(sc)
	if f == null:
		f = []
		for p in o.get_property_list():
			if p["usage"] & PROPERTY_USAGE_SCRIPT_VARIABLE: f.append(StringName(p["name"]))
		_fields[sc] = f
	return f


static func values(o) -> Array:
	if o is Dictionary: return o.values()
	if o is Array: return o.duplicate()
	return []


static func entries(o) -> Array:
	var out := []
	if o is Dictionary:
		for k in o:
			out.append([k, o[k]])
	elif o is Array:
		for i in o.size():
			out.append([str(i), o[i]])
	return out


static func from_entries(es) -> Dictionary:
	var out := {}
	for e in es:
		out[e[0]] = e[1]
	return out


static func clone(x):
	if x is Dictionary or x is Array: return x.duplicate(true)
	return x


static func map_of(es) -> Dictionary:
	var out := {}
	if es is Dictionary:
		return es.duplicate()
	for e in es:
		out[e[0]] = e[1]
	return out


static func map_set(d: Dictionary, k, v) -> Dictionary:
	d[k] = v
	return d


static func map_for_each(d: Dictionary, f: Callable) -> void:
	var n := f.get_argument_count()
	for k in d.keys():
		if n >= 2: f.call(d[k], k)
		else: f.call(d[k])


static func set_of(xs) -> Dictionary:
	var out := {}
	if xs is Dictionary:
		for k in xs: out[k] = true
	elif xs != null:
		for x in xs: out[x] = true
	return out


static func set_add(s: Dictionary, v) -> Dictionary:
	s[v] = true
	return s


# -----------------------------------------------------------------------------
# Arrays
# -----------------------------------------------------------------------------

## Spread source as an array ([...x]).
static func arr(x) -> Array:
	if x is Array: return x
	if x is Dictionary: return x.keys()
	if x == null: return []
	if x is String:
		var out := []
		for c in x: out.append(c)
		return out
	return Array(x)


static func array(n) -> Array:
	var a := []
	a.resize(int(n))
	return a


static func typed_array(n) -> Array:
	if n is Array: return n.duplicate()
	var a := []
	a.resize(int(n))
	a.fill(0)
	return a


static func array_from(src, f = null) -> Array:
	var items: Array
	if src is Dictionary and src.has("length"): items = TS.array(src["length"])
	elif src is Dictionary: items = src.keys()
	elif src is Array: items = src.duplicate()
	else: items = arr(src)
	if f == null: return items
	var n: int = f.get_argument_count()
	var out := []
	out.resize(items.size())
	for i in items.size():
		out[i] = f.call(items[i], i) if n >= 2 else f.call(items[i])
	return out


static func array_entries(a: Array) -> Array:
	var out := []
	for i in a.size():
		out.append([i, a[i]])
	return out


## arr[i] with JS out-of-range semantics (undefined instead of an error).
static func at(a, i):
	if a == null: return null
	var k := int(i)
	if a is String: return a[k] if k >= 0 and k < a.length() else null
	if k < 0 or k >= a.size(): return null
	return a[k]


static func slice(a: Array, start = 0, end = null) -> Array:
	var n := a.size()
	var s0 := int(start)
	var e0: int = n if end == null else int(end)
	if s0 < 0: s0 = maxi(0, n + s0)
	if e0 < 0: e0 = maxi(0, n + e0)
	s0 = mini(s0, n)
	e0 = mini(e0, n)
	if e0 <= s0: return []
	return a.slice(s0, e0)


static func str_slice(s: String, start = 0, end = null) -> String:
	var n := s.length()
	var s0 := int(start)
	var e0: int = n if end == null else int(end)
	if s0 < 0: s0 = maxi(0, n + s0)
	if e0 < 0: e0 = maxi(0, n + e0)
	s0 = mini(s0, n)
	e0 = mini(e0, n)
	if e0 <= s0: return ""
	return s.substr(s0, e0 - s0)


static func substring(s: String, a, b = null) -> String:
	var n := s.length()
	var x := clampi(int(a), 0, n)
	var y: int = n if b == null else clampi(int(b), 0, n)
	if y < x:
		var t := x
		x = y
		y = t
	return s.substr(x, y - x)


static func split(s: String, sep: String) -> Array:
	if sep == "":
		var out := []
		for c in s: out.append(c)
		return out
	return Array(s.split(sep))


static func replace(s: String, what: String, with: String) -> String:
	var i := s.find(what)
	if i < 0: return s
	return s.substr(0, i) + with + s.substr(i + what.length())


static func join(a: Array, sep: String = ",") -> String:
	var parts := PackedStringArray()
	for x in a:
		parts.append("" if x == null else s(x))
	return sep.join(parts)


static func splice(a: Array, start, count = null, i0 = null, i1 = null, i2 = null, i3 = null) -> Array:
	var n := a.size()
	var s0 := int(start)
	if s0 < 0: s0 = maxi(0, n + s0)
	s0 = mini(s0, n)
	var c: int = n - s0 if count == null else clampi(int(count), 0, n - s0)
	var removed := a.slice(s0, s0 + c)
	for k in c:
		a.remove_at(s0)
	var ins := []
	for x in [i0, i1, i2, i3]:
		if x != null: ins.append(x)
	for k in ins.size():
		a.insert(s0 + k, ins[k])
	return removed


static func unshift(a: Array, items: Array) -> int:
	for k in items.size():
		a.insert(k, items[k])
	return a.size()


static func fill(a: Array, v, start = 0, end = null) -> Array:
	var n := a.size()
	var e0: int = n if end == null else int(end)
	for i in range(int(start), mini(e0, n)):
		a[i] = v
	return a


static func reverse(a: Array) -> Array:
	a.reverse()
	return a


static func flat(a: Array) -> Array:
	var out := []
	for x in a:
		if x is Array: out.append_array(x)
		else: out.append(x)
	return out


static func _call_cb(f: Callable, n: int, v, i, a):
	if n <= 1: return f.call(v)
	if n == 2: return f.call(v, i)
	return f.call(v, i, a)


static func map(a: Array, f: Callable) -> Array:
	var n := f.get_argument_count()
	var out := []
	out.resize(a.size())
	for i in a.size():
		out[i] = _call_cb(f, n, a[i], i, a)
	return out


static func filter(a: Array, f: Callable) -> Array:
	var n := f.get_argument_count()
	var out := []
	for i in a.size():
		if truthy(_call_cb(f, n, a[i], i, a)): out.append(a[i])
	return out


static func some(a: Array, f: Callable) -> bool:
	var n := f.get_argument_count()
	for i in a.size():
		if truthy(_call_cb(f, n, a[i], i, a)): return true
	return false


static func every(a: Array, f: Callable) -> bool:
	var n := f.get_argument_count()
	for i in a.size():
		if not truthy(_call_cb(f, n, a[i], i, a)): return false
	return true


static func find(a: Array, f: Callable):
	var n := f.get_argument_count()
	for i in a.size():
		if truthy(_call_cb(f, n, a[i], i, a)): return a[i]
	return null


static func find_last(a: Array, f: Callable):
	var n := f.get_argument_count()
	for i in range(a.size() - 1, -1, -1):
		if truthy(_call_cb(f, n, a[i], i, a)): return a[i]
	return null


static func find_index(a: Array, f: Callable) -> int:
	var n := f.get_argument_count()
	for i in a.size():
		if truthy(_call_cb(f, n, a[i], i, a)): return i
	return -1


static func for_each(a: Array, f: Callable) -> void:
	var n := f.get_argument_count()
	for i in a.size():
		_call_cb(f, n, a[i], i, a)


static func reduce(a: Array, f: Callable, init = null, has_init := false):
	var n := f.get_argument_count()
	var i0 := 0
	var acc = init
	if not has_init:
		acc = a[0]
		i0 = 1
	for i in range(i0, a.size()):
		acc = f.call(acc, a[i]) if n <= 2 else f.call(acc, a[i], i)
	return acc


## Array.prototype.sort: stable, like JS (GDScript's sort_custom is not).
## Without a comparator JS sorts by string value.
static func sort(a: Array, cmp = null) -> Array:
	var n := a.size()
	if n < 2: return a
	var less: Callable
	if cmp == null:
		less = func(x, y): return s(x) < s(y)
	else:
		less = func(x, y): return cmp.call(x, y) < 0
	# Bottom-up merge sort.
	var src := a.duplicate()
	var dst := []
	dst.resize(n)
	var width := 1
	while width < n:
		var lo := 0
		while lo < n:
			var mid := mini(lo + width, n)
			var hi := mini(lo + 2 * width, n)
			var i := lo
			var j := mid
			var k := lo
			while i < mid and j < hi:
				if less.call(src[j], src[i]):
					dst[k] = src[j]
					j += 1
				else:
					dst[k] = src[i]
					i += 1
				k += 1
			while i < mid:
				dst[k] = src[i]
				i += 1
				k += 1
			while j < hi:
				dst[k] = src[j]
				j += 1
				k += 1
			lo += 2 * width
		var t := src
		src = dst
		dst = t
		width *= 2
	for i in n:
		a[i] = src[i]
	return a


# -----------------------------------------------------------------------------
# Identity maps (JS Map/WeakMap/Set keyed by plain objects)
# -----------------------------------------------------------------------------

static var _next_oid := 1

## A dictionary's identity: a hidden key stamped on first use. Spread copies
## carry the stamp along, so lookups also check the stored object is the same.
static func _oid(d) -> int:
	if d is Object: return d.get_instance_id()
	var id = d.get("__oid") if d is Dictionary else null
	if id == null:
		id = _next_oid
		_next_oid += 1
		if d is Dictionary: d["__oid"] = id
	return id


static func id_get(m: Dictionary, k):
	if k == null: return null
	var e = m.get(_oid(k))
	return e[1] if e != null and is_same(e[0], k) else null


static func id_has(m: Dictionary, k) -> bool:
	if k == null: return false
	var e = m.get(_oid(k))
	return e != null and is_same(e[0], k)


static func id_set(m: Dictionary, k, v) -> Dictionary:
	var id := _oid(k)
	var e = m.get(id)
	if e != null and not is_same(e[0], k) and k is Dictionary:
		# A copy carrying someone else's stamp: give it its own.
		id = _next_oid
		_next_oid += 1
		k["__oid"] = id
	m[id] = [k, v]
	return m


static func id_delete(m: Dictionary, k) -> bool:
	if not id_has(m, k): return false
	m.erase(_oid(k))
	return true


static var _res := {}


## /pattern/.test(s), with the pattern compiled once.
static func re_test(pattern: String, s) -> bool:
	var re: RegEx = _res.get(pattern)
	if re == null:
		re = RegEx.create_from_string(pattern)
		_res[pattern] = re
	return re.search(str(s)) != null
