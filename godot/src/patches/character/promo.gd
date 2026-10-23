##  cyrb53: a small, fast 53-bit string hash (as base 36, like the web's toString(36)).
static func hash_(code: String) -> String:
	var s := "arena-legends:promo:" + code
	var h1 := 0xdeadbeef
	var h2 := 0x41c6ce57
	for i in s.length():
		var ch := s.unicode_at(i)
		h1 = _imul(h1 ^ ch, 2654435761)
		h2 = _imul(h2 ^ ch, 1597334677)
	h1 = _imul(h1 ^ (h1 >> 16), 2246822507) ^ _imul(h2 ^ (h2 >> 13), 3266489909)
	h1 &= 0xFFFFFFFF
	h2 = _imul(h2 ^ (h2 >> 16), 2246822507) ^ _imul(h1 ^ (h1 >> 13), 3266489909)
	h2 &= 0xFFFFFFFF
	var n := 4294967296 * (2097151 & h2) + h1
	if n == 0: return "0"
	var digits := "0123456789abcdefghijklmnopqrstuvwxyz"
	var out := ""
	while n > 0:
		out = digits[n % 36] + out
		n /= 36
	return out

## Math.imul on unsigned 32-bit values, kept unsigned.
static func _imul(a: int, b: int) -> int:
	a &= 0xFFFFFFFF
	b &= 0xFFFFFFFF
	return ((((a * (b >> 16)) & 0xFFFF) << 16) + a * (b & 0xFFFF)) & 0xFFFFFFFF
