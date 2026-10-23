
##  `travel`: how far (px) the camera can travel from centre. Painted once, then kept (see ArenaCache).
static func build_arena(theme, W: float, H: float, gy: float, travel: float, seed_ = null) -> Variant:
	if seed_ == null: seed_ = 7
	return ArenaCache.get_art(theme, W, H, gy, travel, seed_)

## Paints an arena from scratch (slow: seconds).
static func paint_arena(theme, W: float, H: float, gy: float, travel: float, seed_: float) -> Variant:
	if theme["kind"] == "cosmos":
		return RenderCosmosArt.build_cosmos(theme, W, H, gy, travel, seed_)
	if theme["kind"] == "shrine":
		return RenderShrineArt.build_shrine(theme, W, H, gy, travel, seed_)
	if theme["kind"] == "mesa":
		return RenderMesaArt.build_mesa(theme, W, H, gy, travel, seed_)
	return RenderIsleArt.build_isle(theme, W, H, gy, travel, seed_)
