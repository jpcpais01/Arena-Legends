## The lighting pass starts the screen's "over" layer, so the hour's tint and
## the sky land under everything drawn after it (see Canvas2D.Gpu).
func light(g, cam: float, t: float) -> void:
	if g is Canvas2D.Gpu: g.enter_light()
	light__web(g, cam, t)

## Light shafts are a GPU pass of the screen composite: this only says where the light is.
func cast_shafts(g) -> Variant:
	if g is Canvas2D.Gpu:
		g.shaft_pos = Vector2(self.sun["x"], self.sun["y"])
		g.shaft_color = Canvas2D.color(PixelColor.css(self.sun["color"]))
	return Canvas2D.SHAFTS
