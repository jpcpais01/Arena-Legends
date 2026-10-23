static var _bad := RegEx.create_from_string("[\\x{0000}-\\x{001f}\\x{007f}<>]")
static var _space := RegEx.create_from_string("\\s+")

## Trims, collapses whitespace and drops control characters and markup.
static func clean_name(raw) -> String:
	var s: String = _bad.sub(str(raw), "", true)
	return _space.sub(s, " ", true).strip_edges().substr(0, NAME_MAX)
