## Height of the curve `pts` at x (linear between points, last point past the end).
static func along(pts: Array, x: float) -> float:
	for i in range(1, pts.size()):
		if x <= pts[i][0]:
			var a = pts[i - 1]
			var b = pts[i]
			var dx: float = b[0] - a[0]
			return a[1] + ((x - a[0]) / (dx if dx != 0 else 1.0)) * (b[1] - a[1])
	return pts[pts.size() - 1][1]


## `along` for textures: the segment search unrolls into a select chain.
static func along__tx(pts: Array, x):
	var v = pts[pts.size() - 1][1]
	for i in range(pts.size() - 1, 0, -1):
		var a = pts[i - 1]
		var b = pts[i]
		var dx: float = b[0] - a[0]
		var k: float = (b[1] - a[1]) / (dx if dx != 0 else 1.0)
		v = TX.sel(TX.le(x, b[0]), TX.add(a[1], TX.mul(TX.sub(x, a[0]), k)), v)
	return v
