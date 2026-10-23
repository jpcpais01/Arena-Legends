class_name Rich
## A small text layout for custom-drawn UI: runs of text in different fonts,
## sizes and colours (and inline boxes), word-wrapped to a width, laid out once
## and drawn as a handful of strings. Covers what the web does with inline
## <b>/<span> in a paragraph, line clamping included.


## A run of text. `shadow`: "" or "drop" (one art pixel of ink below);
## `sweep`: coloured along the Mythic gradient instead of `col`.
static func run(t: String, f: Font, size: int, col: Color, shadow := "", sweep := false) -> Dictionary:
	return {"t": t, "f": f, "s": size, "c": col, "sh": shadow, "sweep": sweep}


## An inline box `w` x `h` drawn by `draw(ci, rect)`, sitting on the baseline.
static func box(w: float, h: float, draw: Callable) -> Dictionary:
	return {"w": w, "h": h, "draw": draw}


## Lays `runs` out in lines no wider than `width`, `lh` device pixels apart. With
## `max_lines`, text past the last line is cut and the line ends with an ellipsis.
static func layout(runs: Array, width: float, lh: float, max_lines := 0) -> Layout:
	var out := Layout.new()
	out.lh = lh
	var line := _Line.new()
	var lines: Array = [line]
	var cut := false
	for r in runs:
		if cut: break
		if r.has("draw"):
			if line.w + r["w"] > width and line.w > 0.0:
				if max_lines > 0 and lines.size() >= max_lines:
					cut = true
					break
				line = _Line.new()
				lines.append(line)
			line.add(r, "", r["w"], r["w"])
			continue
		var words := (r["t"] as String).split(" ")
		for i in words.size():
			var word: String = words[i]
			var tail := " " if i < words.size() - 1 else ""
			var f: Font = r["f"]
			var ww := f.get_string_size(word, HORIZONTAL_ALIGNMENT_LEFT, -1, r["s"]).x
			# Measured apart: a string's trailing space doesn't count towards its width.
			var sw := ww + (f.get_char_size(32, r["s"]).x if tail != "" else 0.0)
			if line.w + ww > width + 0.5 and line.w > 0.0:
				if max_lines > 0 and lines.size() >= max_lines:
					_ellipsis(line, width)
					cut = true
					break
				line.trim()
				line = _Line.new()
				lines.append(line)
			line.add(r, word + tail, sw, ww)
	line.trim()
	out.lines = lines
	out.h = lh * lines.size()
	for l in lines: out.w = maxf(out.w, l.w)
	return out


## Ends a clamped line with "…", dropping text until it fits.
static func _ellipsis(line: _Line, width: float) -> void:
	if line.items.is_empty(): return
	var it: Array = line.items[-1]
	var r: Dictionary = it[1]
	if r.has("draw"): return
	var f: Font = r["f"]
	var t: String = (it[2] as String).strip_edges(false, true)
	var x: float = it[0]
	while t.length() > 0 and x + f.get_string_size(t + "…", HORIZONTAL_ALIGNMENT_LEFT, -1, r["s"]).x > width:
		t = t.substr(0, t.length() - 1)
	it[2] = t.strip_edges(false, true) + "…"
	line.w = x + f.get_string_size(it[2], HORIZONTAL_ALIGNMENT_LEFT, -1, r["s"]).x
	line.trail = 0.0


class _Line:
	## [x, run, text]
	var items: Array = []
	var w := 0.0
	## Width of the trailing space (taken off when the line ends).
	var trail := 0.0

	func add(r: Dictionary, t: String, adv: float, ink: float) -> void:
		var x := w
		if not items.is_empty() and items[-1][1] == r and not r.has("draw"):
			items[-1][2] += t
		else:
			items.append([x, r, t])
		trail = adv - ink
		w = x + adv

	func trim() -> void:
		w -= trail
		trail = 0.0


class Layout:
	var lines: Array = []
	var lh := 0.0
	var h := 0.0
	var w := 0.0

	## Draws the text with its top-left at `pos`; `align` 0 left, 0.5 centred, 1 right
	## within `width` (the layout's widest line when 0). `alpha` fades it all.
	func draw(ci: CanvasItem, pos: Vector2, align := 0.0, width := 0.0, alpha := 1.0) -> void:
		var bw := width if width > 0.0 else w
		for i in lines.size():
			var l: _Line = lines[i]
			var asc := 0.0
			var desc := 0.0
			for it in l.items:
				var r: Dictionary = it[1]
				if r.has("draw"): continue
				var f: Font = r["f"]
				asc = maxf(asc, f.get_ascent(r["s"]))
				desc = maxf(desc, f.get_descent(r["s"]))
			var top := pos.y + lh * i
			var base := roundf(top + (lh + asc - desc) / 2.0)
			var x0 := roundf(pos.x + (bw - l.w) * align)
			for it in l.items:
				var r: Dictionary = it[1]
				var x: float = x0 + it[0]
				if r.has("draw"):
					var bh: float = r["h"]
					(r["draw"] as Callable).call(ci, Rect2(x, roundf(top + (lh - bh) / 2.0), r["w"], bh))
					continue
				var f: Font = r["f"]
				var s: int = r["s"]
				var t: String = it[2]
				if r["sh"] == "drop":
					ci.draw_string(f, Vector2(x, base + UI.px), t, HORIZONTAL_ALIGNMENT_LEFT, -1, s, Color(UI.INK, alpha))
				if r["sweep"]:
					# The Mythic gradient across the run (the web's background-clip: text).
					var tw := maxf(1.0, f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, s).x)
					# Each letter where the whole string puts it (kerning included).
					for k in t.length():
						var cx := f.get_string_size(t.substr(0, k), HORIZONTAL_ALIGNMENT_LEFT, -1, s).x if k > 0 else 0.0
						ci.draw_string(f, Vector2(x + cx, base), t[k], HORIZONTAL_ALIGNMENT_LEFT, -1, s, Color(UI.sweep_at(cx / tw / 3.0), alpha))
				else:
					var c: Color = r["c"]
					ci.draw_string(f, Vector2(x, base), t, HORIZONTAL_ALIGNMENT_LEFT, -1, s, Color(c, c.a * alpha))
