class_name Creator
extends Control
## Hero creation and editing (the web's ui/creator.ts): a dressing room. The
## hero stands big on a lit dais inside their own portrait card (their
## backdrop behind them, their name and tags under them), reacts to every
## pick with a line and a burst of sparks, and the camera leans in on the face
## while you style it. Chapters run along the top; on a new hero they unlock
## one by one and end on a "new legend" reveal that plays the chosen entrance.
##
## Custom-drawn to the web's phone landscape CSS like the Armory: each step
## lays its pieces out once (cards, info strip, bars...) as rects with a draw
## call and a tap action, and the panel's scroller draws what's on screen.

## Saved: the finished hero.
signal done(c)
## Closed without saving (editing only).
signal closed

const STEPS := [
	{"label": "Species", "icon": "paw", "title": "Who are you?"},
	{"label": "Body", "icon": "body", "title": "Shape your body"},
	{"label": "Style", "icon": "swords", "title": "How do you fight?"},
	{"label": "Look", "icon": "palette", "title": "Make it yours"},
	{"label": "Name", "icon": "edit", "title": "Name your legend"},
	{"label": "Scene", "icon": "star", "title": "Set your scene"},
	{"label": "Entrance", "icon": "boot", "title": "Make an entrance"},
	{"label": "Finale", "icon": "impact", "title": "Finish in style"},
]
## Only when editing a hero: spend the points levels give.
const STATS_STEP := {"label": "Stats", "icon": "trophy", "title": "Train your stats"}
const SPECIES_STEP := 0
const BODY := 1
const STYLE := 2
const LOOK := 3
const NAME := 4
const BACKDROP := 5
const ENTRANCE := 6
const FINALE := 7

const STYLE_ICON := {"balanced": "scale", "relentless": "flame", "tactician": "eye", "skirmisher": "fast", "guardian": "shield"}
const STYLE_BARS := ["Aggression", "Defense", "Trickery", "Stamina"]
## A colour for each species in the UI: card glows and the stage tag.
const SPECIES_TINT := {"human": 0xe8a858, "imp": 0xe85a4a, "myco": 0xc07ae0, "ogrin": 0x7ac050, "wisp": 0x6ad8ff, "golem": 0x5ad0b0}
## Form stats shown as bars, scaled between the lowest and highest form: stat, label, format (0 whole, 1 one decimal, 2 percent).
const FORM_STATS := [["maxHp", "Health", 0], ["power", "Power", 0], ["armor", "Armor", 0], ["resist", "Magic resist", 0], ["moveSpeed", "Speed", 1], ["attackSpeed", "Attack speed", 2], ["critChance", "Crit", 2]]
## The stat each training line shows and its label.
const TRAIN_VIEW := {"health": ["maxHp", "Health"], "power": ["power", "Power"], "armor": ["armor", "Armor"], "resist": ["resist", "Resist"], "speed": ["attackSpeed", "Attack speed"], "crit": ["critChance", "Crit"]}
const SKIN_LABEL := {"golem": "Stone", "wisp": "Spirit"}
## Look categories that lean the stage camera in on the head.
const FACE := ["skin", "eyes", "hair", "hairColor"]
const TIER_COL := {"rare": Color("#5aa8ff"), "mythic": Color("#c27aff"), "legendary": Color("#ffb040")}

var editing := false
var steps: Array = []
var c: Dictionary
var step := 0
var reached := 0
var show_gear := true
var look_cat := "skin"
var finale_cat := "finisher"
## The entrance / finale shown on the stage (may be one not owned yet) and whether Unlock was tapped once.
var _shown := ""
var _armed := false

var _t := 0.0
var _beat := 0
var _portraits := Portraits.new()
var _range := {}

# Nodes.
var _tabs: UI.Pad
var _close_btn: PxButton
var _scene: UI.Paint
var _preview: FighterPreview
var _over: UI.Paint
var _prev_btn: PxButton
var _next_pick: PxButton
var _pose_btn: PxButton
var _gear_btn: PxButton
var _back_btn: PxButton
var _save_btn: PxButton
var _next_btn: PxButton
var _panel: UI.Paint
var _ribbon: Ribbon
var _tool: PxButton
var _body: ScrollView
var _name_in: LineEdit
var _reveal: Reveal

# Layout (device pixels).
var _tab_rects: Array = []
var _top_h := 0.0
var _scene_in := Rect2()
var _box := Rect2()
var _plate := Rect2()
var _head_y := 0.0
var _head_h := 0.0
## The open step: pieces [rect, draw(ci, rect)], taps [rect, action], controls [control, pos].
var _pieces: Array = []
var _hits: Array = []
var _ctrls: Array = []
## Cards with the gold cursor (pulsing), drawn last.
var _cursors: Array = []
var _cycler := Callable()
var _slide := 1.0
var _slide_dir := 0

# Stage life: the speech bubble and the spark burst.
var _say := ""
var _say_t := -1.0
var _say_at := -100.0
var _say_lay: Rich.Layout
var _burst_t := -1.0
var _burst_col := UI.GOLD_HI
var _shake_t := -1.0


func _init(start: Dictionary, edit: bool, open_stats := false) -> void:
	editing = edit
	steps = STEPS + ([STATS_STEP] if editing else [])
	c = start.duplicate(true)
	if not (c.get("look") is Dictionary): c["look"] = CharacterAppearance.random_appearance()
	step = steps.size() - 1 if editing and open_stats else 0
	reached = steps.size() - 1 if editing else 0
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	for f in FORM_STATS:
		var lo := INF
		var hi := -INF
		for id in SimForms.FORM_IDS:
			var v := float(SimForms.FORMS[id]["base"][f[0]])
			lo = minf(lo, v)
			hi = maxf(hi, v)
		_range[f[0]] = [lo, hi]

	_tabs = UI.Pad.new(_paint_tabs)
	_tabs.tapped.connect(_on_tab_tap)
	add_child(_tabs)
	if editing:
		_close_btn = PxButton.new("", "close", "", "sm")
		_close_btn.pressed.connect(func():
			Sfx.sfx.play("back")
			closed.emit())
		add_child(_close_btn)

	# The stage: the hero's portrait card.
	_scene = UI.Paint.new(_paint_scene)
	_scene.clip_contents = true
	add_child(_scene)
	_preview = FighterPreview.new(_stage_build(), 100, 90, {"autoplay": true, "pedestal": true})
	_scene.add_child(_preview)
	_over = UI.Paint.new(_paint_over)
	_scene.add_child(_over)
	_prev_btn = _arrow(true)
	_prev_btn.pressed.connect(_cycle.bind(-1))
	_next_pick = _arrow(false)
	_next_pick.pressed.connect(_cycle.bind(1))
	_pose_btn = _tool_btn("replay")
	_pose_btn.pressed.connect(func():
		Sfx.sfx.play("whoosh")
		_preview.showcase()
		_burst())
	_gear_btn = _tool_btn("bag")
	_gear_btn.pressed.connect(func():
		show_gear = not show_gear
		Sfx.sfx.play("select")
		_sync_stage()
		_preview.showcase()
		say("Armed and ready." if show_gear else "Just me."))
	_back_btn = PxButton.new("", "back")
	_back_btn.pressed.connect(func():
		Sfx.sfx.play("back")
		go(step - 1))
	add_child(_back_btn)
	_save_btn = PxButton.new("", "check")
	_save_btn.pressed.connect(_finish)
	add_child(_save_btn)
	_next_btn = PxButton.new("", "", "primary")
	_next_btn.pressed.connect(_advance)
	add_child(_next_btn)

	# The panel.
	_panel = UI.Paint.new(_paint_panel)
	add_child(_panel)
	_ribbon = Ribbon.new("", 0.95)
	_panel.add_child(_ribbon)
	_body = ScrollView.new(_paint_body)
	_body.tapped.connect(_on_body_tap)
	_body.scrolled.connect(func(_o): _place_ctrls())
	_panel.add_child(_body)
	_name_in = LineEdit.new()
	_name_in.max_length = CharacterProfile.NAME_MAX
	_name_in.placeholder_text = "Your name"
	_name_in.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_in.context_menu_enabled = false
	_name_in.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_DEFAULT
	_name_in.add_theme_font_override("font", UI.spaced("p700", 20, 0.04))
	_name_in.add_theme_color_override("font_color", UI.GOLD_HI)
	_name_in.add_theme_color_override("font_placeholder_color", UI.DIM)
	_name_in.add_theme_color_override("caret_color", UI.GOLD_HI)
	_name_in.add_theme_color_override("selection_color", Color(UI.GOLD_LO, 0.6))
	_name_in.text = str(c.get("name", ""))
	_name_in.text_changed.connect(func(t: String):
		c["name"] = t
		_shake_t = -1.0
		_scene.queue_redraw())
	_name_in.text_submitted.connect(func(_t):
		_name_in.release_focus()
		_advance())
	_name_in.focus_exited.connect(func():
		var n := CharacterProfile.clean_name(_name_in.text)
		if n != "" and step == NAME: say("%s! Remember it." % n))
	_body.add_child(_name_in)
	_name_in.visible = false
	resized.connect(_layout)


func _ready() -> void:
	_layout()
	_render(0)
	get_tree().create_timer(0.45).timeout.connect(func():
		if is_inside_tree(): say("Back for a new look?" if editing else "Hey! Let's make me a legend."))


func _exit_tree() -> void:
	_portraits.release()


## Back: the reveal's button, else closes when editing (a new hero can only go back a step).
func back() -> void:
	if _reveal != null:
		_done()
		return
	if editing:
		Sfx.sfx.play("back")
		closed.emit()
	elif step > 0:
		Sfx.sfx.play("back")
		go(step - 1)


func _arrow(left: bool) -> PxButton:
	var b := PxButton.new("", "play", "primary")
	b.flip_glyph = left
	b.font_rem = 1.13
	b.min_w = 2.5
	b.min_h = 2.5
	_scene.add_child(b)
	return b


func _tool_btn(glyph: String) -> PxButton:
	var b := PxButton.new("", glyph, "", "sm")
	b.colors = [Color(36 / 255.0, 26 / 255.0, 64 / 255.0, 0.88), Color("#6a58aa"), Color("#261d48"), UI.TEXT]
	_scene.add_child(b)
	return b


static func _col(n) -> Color:
	return Color.hex((int(n) << 8) | 0xff)


func _style() -> String:
	return str(c.get("style")) if c.get("style") != null else "balanced"


## The character in plain clothes with just their weapon, so species and colours read clearly.
func _bare(b: Dictionary) -> Dictionary:
	var o := b.duplicate()
	o["gear"] = {"main": b["gear"]["main"]}
	o["skins"] = {}
	return o


func _stage_build() -> Dictionary:
	return c if show_gear else _bare(c)


# --- Stage helpers --------------------------------------------------------------------------------

## A speech bubble over the hero. `soft` lines skip if one was said a moment ago (rapid swatch taps).
func say(text: String, soft := false) -> void:
	if soft and _t - _say_at < 2.6: return
	_say_at = _t
	_say = text
	_say_t = 0.0
	_say_lay = null
	set_process(true)


## A ring of pixel sparks bursting off the hero.
func _burst(col = null) -> void:
	_burst_col = _col(col) if col != null else UI.GOLD_HI
	_burst_t = 0.0
	set_process(true)


func _sync_stage() -> void:
	_preview.set_build(_stage_build())
	_gear_btn.colors = [Color(36 / 255.0, 26 / 255.0, 64 / 255.0, 0.88), Color("#6a58aa"), Color("#261d48"), Color("#e8a858") if show_gear else UI.MUTED]
	_gear_btn.queue_redraw()
	_scene.queue_redraw()


func go(i: int) -> void:
	if i < 0 or i > reached or i == step: return
	var dir := 1 if i > step else -1
	step = i
	_render(dir)


func _advance() -> void:
	if _reveal != null:
		_done()
		return
	if step == steps.size() - 1:
		_finish()
		return
	if step == NAME and CharacterProfile.clean_name(_name_in.text) == "":
		_name_needed()
		return
	Sfx.sfx.play("select")
	reached = maxi(reached, step + 1)
	go(step + 1)


func _name_needed() -> void:
	if step != NAME:
		reached = maxi(reached, NAME)
		step = NAME
		_render(-1)
	_shake_t = 0.0
	set_process(true)
	_name_in.grab_focus()
	Sfx.sfx.play("back")
	say("Wait, what do they call me?")


func _finish() -> void:
	var n := CharacterProfile.clean_name(_name_in.text)
	if n == "":
		_name_needed()
		return
	c["name"] = n
	if editing:
		Sfx.sfx.play("confirm")
		done.emit(c)
		return
	_show_reveal()


func _done() -> void:
	Sfx.sfx.play("confirm")
	done.emit(c)


## A brand new hero: the reveal, with their entrance played on their own backdrop.
func _show_reveal() -> void:
	Sfx.sfx.play("revealLegendary")
	_name_in.release_focus()
	_reveal = Reveal.new(self)
	add_child(_reveal)


## Stage arrows: flip through the open step's options.
func _cycle(dir: int) -> void:
	if not _cycler.is_valid(): return
	Sfx.sfx.play("select")
	_cycler.call(dir)
	_refresh()


func _set_look(patch: Dictionary, move := false) -> void:
	var look: Dictionary = c["look"].duplicate()
	look.merge(patch, true)
	# Switching species keeps the body form when it can, else takes the closest one it has.
	c["look"] = look
	c["form"] = CharacterAppearance.fit_form(look["species"], c["form"])
	_sync_stage()
	if move: _preview.showcase()


func _pick_species(id: String) -> void:
	if c["look"]["species"] == id: return
	var skins: Array = CharacterAppearance.SPECIES[id]["skins"]
	_set_look({"species": id, "skin": mini(int(c["look"]["skin"]), skins.size() - 1)}, true)
	_burst(SPECIES_TINT[id])
	say(UiHeroLines.SPECIES_LINE[id])


func _pick_form(id: String) -> void:
	if c["form"] == id: return
	c["form"] = id
	_sync_stage()
	_preview.showcase()
	_burst(SimForms.FORMS[id]["color"])
	say(UiHeroLines.FORM_LINE[id])


func _pick_style(id: String) -> void:
	if _style() == id: return
	c["style"] = id
	_scene.queue_redraw()
	_preview.showcase()
	_burst(SimStyles.FIGHT_STYLES[id]["color"])
	say(UiHeroLines.STYLE_LINE[id])


func _pick_backdrop(i: int) -> void:
	if int(c["look"].get("backdrop", 0)) == i: return
	c["look"]["backdrop"] = i
	_scene.queue_redraw()
	_burst()
	say(UiHeroLines.pick_line(UiHeroLines.BACKDROP_LINES), true)


# --- Render ---------------------------------------------------------------------------------------

func _render(dir := 0) -> void:
	_cycler = Callable()
	_preview.zoom(false)
	_shown = ""
	_armed = false
	var s: Dictionary = steps[step]
	_ribbon.set_text(s["title"])
	if _tool != null:
		_tool.queue_free()
		_tool = null
	if step == LOOK:
		_tool = PxButton.new("Surprise me", "dice", "", "sm")
		_tool.pressed.connect(_surprise)
	elif step == steps.size() - 1 and editing:
		_tool = PxButton.new("Reset", "undo", "", "sm")
		_tool.pressed.connect(func():
			if SimTraining.spent_points(c.get("train")) == 0: return
			Sfx.sfx.play("back")
			c.erase("train")
			_refresh())
	if _tool != null: _panel.add_child(_tool)
	if step == ENTRANCE:
		_shown = CharacterEntrances.entrance_of(c["look"], true)
		_preview.play_entrance(_shown)
	elif step == FINALE:
		_shown = _finale_cur()
		_finale_play(_shown)
	_body.offset = 0.0
	_slide_dir = dir
	_slide = 0.0 if dir != 0 else 1.0
	_name_in.visible = step == NAME
	_layout_head()
	_refresh()
	_sync_nav()
	set_process(true)


## Rebuilds the open step's pieces (after any pick).
func _refresh() -> void:
	for x in _ctrls:
		if x[0] != _name_in: x[0].queue_free()
	_pieces.clear()
	_hits.clear()
	_ctrls.clear()
	_cursors.clear()
	# The web's .hc-body padding: four art pixels round the content (room for the cursor's corners).
	var pad := UI.px * 4.0
	var w := _body.size.x - pad * 2
	if w < 2:
		return
	var y := pad
	match step:
		SPECIES_STEP: y = _species_step(w, y)
		BODY: y = _form_step(w, y)
		STYLE: y = _style_step(w, y)
		LOOK: y = _look_step(w, y)
		NAME: y = _name_step(w, y)
		BACKDROP: y = _backdrop_step(w, y)
		ENTRANCE: y = _entrance_step(w, y)
		FINALE: y = _finale_step(w, y)
		_: y = _stats_step(w, y)
	var sh := Vector2(pad, 0)
	for x in _pieces: x[0].position += sh
	for x in _hits: x[0].position += sh
	for x in _ctrls: x[1] += sh
	for i in _cursors.size(): _cursors[i].position += sh
	_body.set_content_h(y + UI.r(0.5))
	_place_ctrls()
	_body.queue_redraw()
	_scene.queue_redraw()
	_tabs.queue_redraw()


func _sync_nav() -> void:
	var last := step == steps.size() - 1
	_back_btn.visible = step > 0
	_save_btn.visible = editing and not last
	if last:
		_next_btn.set_glyph("check" if editing else "crown")
		_next_btn.glyph_after = false
		_next_btn.sub = ""
		_next_btn.set_text("Save" if editing else "Finish")
	else:
		_next_btn.set_glyph("next")
		_next_btn.glyph_after = true
		_next_btn.sub = steps[step + 1]["label"]
		_next_btn.set_text("Next")
	_next_btn.glint = last and not editing
	_next_btn.set_process(_next_btn.glint)
	_prev_btn.visible = _cycler.is_valid()
	_next_pick.visible = _cycler.is_valid()
	_tabs.queue_redraw()
	_layout_stage()


func _process(dt: float) -> void:
	_t += dt
	_portraits.poll()
	var beat := int(_t / 0.45) % 2
	if beat != _beat:
		_beat = beat
		if not _cursors.is_empty(): _body.queue_redraw()
		if step == editing_stats_step() and _left_points() > 0: _body.queue_redraw()
	# Stage arrows nudge outwards and back (steps).
	var nudge := float(UI.px * 2) * (int(_t / 0.7) % 2)
	if _prev_btn.visible:
		_prev_btn.position.x = _arrow_x(true) - nudge
		_next_pick.position.x = _arrow_x(false) + nudge
	if _slide < 1.0:
		_slide = minf(1.0, _slide + dt / 0.24)
		var e := 1.0 - pow(1.0 - _slide, 2.0)
		_body.position.x = _body_x() + UI.r(2.0) * _slide_dir * (1.0 - e)
		_body.modulate.a = e
	if _say_t >= 0.0:
		_say_t += dt
		if _say_t > 2.6 + 0.16: _say_t = -1.0
	if _burst_t >= 0.0:
		_burst_t += dt
		if _burst_t > 0.52: _burst_t = -1.0
	if _shake_t >= 0.0:
		_shake_t += dt
		_name_in.position.x = _name_x() + (UI.c(4) * (-1 if int(_shake_t / 0.075) % 2 == 0 else 1) if _shake_t < 0.3 else 0.0)
	_over.queue_redraw()
	# The rays sway: the card redraws a few times a second.
	if int(_t * 8.0) != int((_t - dt) * 8.0): _scene.queue_redraw()


func editing_stats_step() -> int:
	return STEPS.size() if editing else -1


# --- Layout -----------------------------------------------------------------------------------------

func _layout() -> void:
	if size.x < 2: return
	var W := size.x
	var H := size.y
	var sl := roundf(W * 0.03)
	var top := UI.c(6)
	var tab_h := UI.r(2.2)
	_top_h = top + tab_h + UI.r(0.3)
	# Chapter tabs: content width, the rest shared out (flex: 1 1 auto).
	var right := W - sl
	if _close_btn != null:
		_close_btn.size = _close_btn.custom_minimum_size
		right -= _close_btn.size.x + UI.px * 2
		_close_btn.position = Vector2(W - sl - _close_btn.size.x, roundf(top + (tab_h - _close_btn.size.y) / 2.0))
	_tabs.position = Vector2(sl, top)
	_tabs.size = Vector2(right - sl, tab_h + UI.px)
	var gap := UI.px * 2.0
	var ws := []
	var sum := 0.0
	for s in steps:
		var w := _tab_content_w(s)
		ws.append(w)
		sum += w
	var extra := maxf(0.0, _tabs.size.x - sum - gap * (steps.size() - 1)) / steps.size()
	var scale := minf(1.0, (_tabs.size.x - gap * (steps.size() - 1)) / sum)
	_tab_rects.clear()
	var x := 0.0
	for w in ws:
		var tw := floorf(w * scale + extra)
		_tab_rects.append(Rect2(x, 0, tw, tab_h))
		x += tw + gap

	var col0 := floorf(W * 0.92 / 2.2)
	var bottom := H - UI.c(10)
	var stage := Rect2(sl, _top_h, col0 - UI.r(0.35) - sl, bottom - _top_h)
	var nav_h := UI.r(2.75)
	_scene.position = stage.position
	_scene.size = Vector2(stage.size.x, stage.size.y - nav_h - UI.r(0.35))
	var ny := stage.end.y - nav_h
	for b in [_back_btn, _save_btn]:
		b.min_w = 3.0
		b.min_h = 2.75
		b.refit()
	_back_btn.size = _back_btn.custom_minimum_size
	_back_btn.position = Vector2(stage.position.x, ny)
	_save_btn.size = _save_btn.custom_minimum_size
	_next_btn.font_rem = 1.0
	_next_btn.min_h = 2.75
	_next_btn.refit()
	_layout_stage()

	var px0 := col0 + UI.r(0.2)
	_panel.position = Vector2(px0, _top_h)
	_panel.size = Vector2(W - sl - px0, bottom - _top_h)
	_layout_head()
	_refresh()


## Nav row and the stage card's inside (they change with the step's buttons).
func _layout_stage() -> void:
	if _scene.size.x < 2: return
	var stage_x := _scene.position.x
	var ny := _back_btn.position.y
	var x := stage_x
	if _back_btn.visible: x += _back_btn.size.x + UI.r(0.45)
	if _save_btn.visible:
		_save_btn.position = Vector2(x, ny)
		x += _save_btn.size.x + UI.r(0.45)
	_next_btn.position = Vector2(x, ny)
	_next_btn.size = Vector2(stage_x + _scene.size.x - x, _next_btn.custom_minimum_size.y)
	_next_btn.queue_redraw()

	var fw := UI.frame_w("gold")
	_scene_in = Rect2(Vector2(fw, fw), _scene.size - Vector2(fw, fw) * 2)
	var p := float(UI.px)
	var nfs := roundi(UI.r(1.3))
	var plate_h := p + p * 2 + nfs + p * 2 + p * 2 + _tag_h(roundi(UI.r(0.5625))) + p * 3
	_plate = Rect2(_scene_in.position.x, _scene_in.end.y - plate_h, _scene_in.size.x, plate_h)
	_box = Rect2(_scene_in.position, Vector2(_scene_in.size.x, _plate.position.y - _scene_in.position.y))
	_preview.position = _box.position
	_preview.size = _box.size
	_over.position = Vector2.ZERO
	_over.size = _scene.size
	for b in [_prev_btn, _next_pick]:
		b.size = b.custom_minimum_size
		b.position = Vector2(_arrow_x(b == _prev_btn), roundf(_scene_in.position.y + _scene_in.size.y * 0.44))
	var ty := _scene_in.position.y + p * 2
	for b in [_pose_btn, _gear_btn]:
		b.size = b.custom_minimum_size
		b.position = Vector2(_scene_in.end.x - p * 2 - b.size.x, ty)
		ty += b.size.y + p * 2
	_sync_gear_colors()


func _sync_gear_colors() -> void:
	_gear_btn.colors = [Color(36 / 255.0, 26 / 255.0, 64 / 255.0, 0.88), Color("#6a58aa"), Color("#261d48"), Color("#e8a858") if show_gear else UI.MUTED]


func _arrow_x(left: bool) -> float:
	var p := float(UI.px)
	return _scene_in.position.x + p * 3 if left else _scene_in.end.x - p * 3 - _next_pick.custom_minimum_size.x


func _layout_head() -> void:
	if _panel.size.x < 2: return
	var fw := UI.frame_w("gold")
	var p := float(UI.px)
	var x0 := fw + UI.r(0.35)
	var x1 := _panel.size.x - fw - UI.r(0.2)
	_head_y = fw + UI.r(0.35)
	var kick := UI.r(1.8)
	_ribbon.size = _ribbon.get_combined_minimum_size()
	_head_h = maxf(kick, _ribbon.size.y)
	if _tool != null:
		_tool.size = _tool.custom_minimum_size
		_head_h = maxf(_head_h, _tool.size.y)
		_tool.position = Vector2(x1 - p * 2 - _tool.size.x, roundf(_head_y + (_head_h - _tool.size.y) / 2.0))
	_ribbon.position = Vector2(x0 + kick + UI.r(0.5) + p * 7, roundf(_head_y + (_head_h - _ribbon.size.y) / 2.0))
	var by := _head_y + _head_h + UI.r(0.15)
	_body.position = Vector2(_body_x(), by)
	_body.size = Vector2(x1 - x0, _panel.size.y - fw - UI.r(0.3) - by)
	# The kicker shows the open step's glyph.
	_panel.queue_redraw()


func _body_x() -> float:
	return UI.frame_w("gold") + UI.r(0.35)


func _tab_content_w(s: Dictionary) -> float:
	var fs := roundi(UI.r(0.6875))
	return UI.r(0.3) * 2 + UI.glyph_size(UI.r(0.85)) + UI.r(0.3) + UI.text_w(UI.spaced("700", fs, 0.05), (s["label"] as String).to_upper(), fs)


## Keeps the step's controls (name field, buttons) where their content is, scrolled.
func _place_ctrls() -> void:
	for x in _ctrls:
		var ctl: Control = x[0]
		var at: Vector2 = x[1]
		ctl.position = Vector2(at.x, at.y - _body.offset)
	if _shake_t < 0.0 and step == NAME:
		_name_in.position.x = _name_x()


func _name_x() -> float:
	for x in _ctrls:
		if x[0] == _name_in: return x[1].x
	return 0.0


# --- Screen, tabs, panel ----------------------------------------------------------------------

func _draw() -> void:
	var ci := get_canvas_item()
	var W := size.x
	var H := size.y
	UI.vgrad(ci, Rect2(Vector2.ZERO, size), [[0.0, Color(14 / 255.0, 9 / 255.0, 26 / 255.0, 0.9)], [1.0, Color(8 / 255.0, 5 / 255.0, 15 / 255.0, 0.96)]])
	UI.glow(ci, Vector2(W * 0.22, H * 0.6), Vector2(W * 0.4, H * 0.7) * 0.72, Color(120 / 255.0, 80 / 255.0, 190 / 255.0, 0.32))


func _on_tab_tap(pos: Vector2) -> void:
	for i in _tab_rects.size():
		if (_tab_rects[i] as Rect2).has_point(pos) and i <= reached and i != step:
			Sfx.sfx.play("select")
			go(i)


func _paint_tabs(ci: CanvasItem, _s: Vector2) -> void:
	var rid := ci.get_canvas_item()
	var p := float(UI.px)
	var fs := roundi(UI.r(0.6875))
	var f := UI.spaced("700", fs, 0.05)
	var gs := UI.glyph_size(UI.r(0.85))
	for i in _tab_rects.size():
		var s: Dictionary = steps[i]
		var r: Rect2 = _tab_rects[i]
		var on := i == step
		var locked := i > reached
		var done_ := not locked and not on and (editing or i < reached or i < step)
		if on: r.position.y += p
		var face := UI.GOLD if on else (Color("#160f26") if locked else Color("#1f1734"))
		var a := 0.5 if locked else 1.0
		# Ink edge with the top corners cut (clip-path), the face, a light top and a dark bottom.
		RenderingServer.canvas_item_add_rect(rid, Rect2(r.position.x + p * 2, r.position.y, r.size.x - p * 4, r.size.y), Color(UI.INK, a))
		RenderingServer.canvas_item_add_rect(rid, Rect2(r.position.x + p, r.position.y + p, r.size.x - p * 2, r.size.y - p), Color(UI.INK, a))
		RenderingServer.canvas_item_add_rect(rid, Rect2(r.position.x, r.position.y + p * 2, r.size.x, r.size.y - p * 2), Color(UI.INK, a))
		var inner := Rect2(r.position.x + p, r.position.y + p, r.size.x - p * 2, r.size.y - p * 2)
		RenderingServer.canvas_item_add_rect(rid, Rect2(inner.position.x + p, inner.position.y, inner.size.x - p * 2, inner.size.y), Color(face, a))
		RenderingServer.canvas_item_add_rect(rid, Rect2(inner.position.x, inner.position.y + p, inner.size.x, inner.size.y - p), Color(face, a))
		RenderingServer.canvas_item_add_rect(rid, Rect2(inner.position.x + p, inner.position.y, inner.size.x - p * 2, p), Color(UI.GOLD_HI if on else Color("#3d3063"), a))
		RenderingServer.canvas_item_add_rect(rid, Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), Color(UI.GOLD_LO if on else Color("#120c20"), a))
		var label := (s["label"] as String).to_upper()
		var tw := UI.text_w(f, label, fs)
		var cw := gs + UI.r(0.3) + tw
		var x := roundf(r.position.x + (r.size.x - cw) / 2.0)
		var mid := r.position.y + (r.size.y - p * 2) / 2.0
		var fg := UI.GOLD_INK if on else (UI.DIM if locked else (UI.TEXT if done_ else UI.MUTED))
		var gc := UI.GOLD_INK if on else (UI.MUTED if locked else (UI.GOLD if done_ else UI.MUTED))
		UI.draw_glyph(ci, "lock" if locked else s["icon"], Vector2(x, roundf(mid - gs / 2.0)), gs, Color(gc, a))
		var base := roundf(mid + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
		UI.draw_text(ci, f, Vector2(x + gs + UI.r(0.3), base), label, fs, Color(fg, a), "drop", Color(1, 0.94, 0.75, 0.6) if on else Color(UI.INK, a))


func _paint_panel(ci: CanvasItem, s: Vector2) -> void:
	var p := float(UI.px)
	UI.panel_fill(ci.get_canvas_item(), Rect2(Vector2(p * 2, p * 2), s - Vector2(p * 4, p * 4)))
	UI.draw_frame(ci.get_canvas_item(), Rect2(Vector2.ZERO, s), "gold")
	# The kicker: the step's glyph in a gold diamond.
	var k := UI.r(1.8)
	var at := Vector2(UI.frame_w("gold") + UI.r(0.35), roundf(_head_y + (_head_h - k) / 2.0))
	var cx := at + Vector2(k, k) / 2.0
	var dia := func(d: float) -> PackedVector2Array:
		return PackedVector2Array([cx + Vector2(0, -k / 2.0 + d), cx + Vector2(k / 2.0 - d, 0), cx + Vector2(0, k / 2.0 - d), cx + Vector2(-k / 2.0 + d, 0)])
	ci.draw_colored_polygon(dia.call(0.0), UI.INK)
	ci.draw_colored_polygon(dia.call(p), UI.GOLD_LO)
	ci.draw_colored_polygon(dia.call(p * 2), UI.GOLD)
	# Kept inside the diamond (the web's icon art has room round it in its box).
	var gs := UI.glyph_size(UI.r(0.7))
	UI.draw_glyph(ci, steps[step]["icon"], (cx - Vector2(gs, gs) / 2.0).round(), gs, UI.GOLD_INK)


# --- The stage card -----------------------------------------------------------------------------

func _paint_scene(ci: CanvasItem, s: Vector2) -> void:
	var rid := ci.get_canvas_item()
	var p := float(UI.px)
	var inn := _scene_in
	ci.draw_rect(inn, Color("#0b0816"))
	# The hero's own backdrop fills the card, dimmed so they stand out, with a soft spotlight and floor glow.
	UI.draw_backdrop(ci, c["look"].get("backdrop", 0), inn)
	UI.glow(rid, inn.position + Vector2(inn.size.x * 0.5, inn.size.y * 0.8), Vector2(inn.size.x * 0.48, inn.size.y * 0.34) * 1.1, Color(1, 214 / 255.0, 140 / 255.0, 0.22))
	var ink := Color(10 / 255.0, 6 / 255.0, 18 / 255.0)
	UI.vgrad(rid, inn, [[0.0, Color(ink, 0.25)], [0.4, Color(ink, 0.05)], [0.85, Color(ink, 0.55)], [1.0, Color(ink, 0.85)]])
	# Light rays from above, swaying.
	var rw := inn.size.x * 0.8
	var sway := sin(_t * TAU / 10.0) * 0.02 * rw
	var cx := inn.position.x + inn.size.x / 2.0 + sway
	var y0 := inn.position.y - inn.size.y * 0.1
	var y1 := inn.end.y - UI.r(3.0)
	var ym := lerpf(y0, y1, 0.75)
	var half := func(y: float) -> float: return lerpf(rw * 0.1, rw * 0.5, (y - y0) / (y1 - y0))
	var c0 := Color(1, 236 / 255.0, 170 / 255.0, 0.0)
	var c1 := Color(1, 228 / 255.0, 160 / 255.0, 0.13)
	var c2 := Color(1, 228 / 255.0, 160 / 255.0, 0.2)
	var hm: float = half.call(ym)
	ci.draw_polygon(PackedVector2Array([Vector2(cx - rw * 0.1, y0), Vector2(cx + rw * 0.1, y0), Vector2(cx + hm, ym), Vector2(cx - hm, ym)]), PackedColorArray([c0, c0, c1, c1]))
	ci.draw_polygon(PackedVector2Array([Vector2(cx - hm, ym), Vector2(cx + hm, ym), Vector2(cx + rw * 0.5, y1), Vector2(cx - rw * 0.5, y1)]), PackedColorArray([c1, c1, c2, c2]))
	# Nameplate across the bottom: the name in the display face, tags under it.
	var pl := _plate
	UI.vgrad(rid, pl, [[0.0, Color(ink, 0.3)], [0.45, Color(ink, 0.88)], [1.0, Color(ink, 0.88)]])
	ci.draw_rect(Rect2(pl.position, Vector2(pl.size.x, p)), Color(242 / 255.0, 181 / 255.0, 66 / 255.0, 0.35))
	var n := CharacterProfile.clean_name(c.get("name", ""))
	var nfs := roundi(UI.r(1.3))
	var nf := UI.spaced("p700", nfs, 0.04)
	var name_ := n if n != "" else "Your legend"
	var maxw := pl.size.x - UI.r(0.6) * 2
	while UI.text_w(nf, name_, nfs) > maxw and name_.length() > 1: name_ = name_.substr(0, name_.length() - 2) + "…"
	var nw := UI.text_w(nf, name_, nfs)
	var base := pl.position.y + p + p * 2 + roundf(nf.get_ascent(nfs))
	var np := Vector2(roundf(pl.get_center().x - nw / 2.0), base)
	if n != "": _name_text(ci, nf, np, name_, nfs, UI.GOLD_HI, UI.GOLD_LO)
	else: UI.draw_text(ci, nf, np, name_, nfs, UI.DIM)
	var tfs := roundi(UI.r(0.5625))
	var tags := _hero_tags()
	var tw := 0.0
	for t in tags: tw += _tag_w(t[1], t[2], tfs)
	tw += p * 2 * (tags.size() - 1)
	var x := roundf(pl.get_center().x - tw / 2.0)
	var ty := pl.position.y + p + p * 2 + nfs + p * 2 + p * 2
	for t in tags: x += _tag(ci, Vector2(x, ty), t[0], t[1], t[2], tfs) + p * 2
	UI.draw_frame(rid, Rect2(Vector2.ZERO, s), "gold")


## Species, body and style as coloured tags with their icons.
func _hero_tags() -> Array:
	var sp: Dictionary = CharacterAppearance.SPECIES[c["look"]["species"]]
	var f: Dictionary = SimForms.FORMS[c["form"]]
	var st: Dictionary = SimStyles.FIGHT_STYLES[_style()]
	return [[_col(SPECIES_TINT[sp["id"]]), "paw", sp["name"]], [_col(f["color"]), "body", f["name"]], [_col(st["color"]), STYLE_ICON[st["id"]], st["name"]]]


## The display name with the web's ink outline and a deep underline in `under`.
static func _name_text(ci: CanvasItem, f: Font, pos: Vector2, t: String, fs: int, col: Color, under: Color) -> void:
	var p := float(UI.px)
	ci.draw_string(f, pos + Vector2(0, p * 2), t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, under)
	for d in [Vector2(0, p), Vector2(p, 0), Vector2(-p, 0)]:
		ci.draw_string(f, pos + d, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.INK)
	ci.draw_string(f, pos, t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)


func _tag_h(fs: int) -> float:
	var p := float(UI.px)
	return p * 2 + p + roundf(fs * 1.1) + roundf(p * 1.5)


func _tag_w(glyph: String, label: String, fs: int) -> float:
	var w := UI.r(0.45) * 2 + UI.px * 2 + UI.text_w(UI.spaced("700", fs, 0.06), label.to_upper(), fs)
	if glyph != "": w += UI.glyph_size(fs * 0.9) + roundf(fs * 0.3)
	return ceilf(w)


## A small notched tag in `col` (the plate's species/body/style, the species' bodies); returns its width.
func _tag(ci: CanvasItem, at: Vector2, col: Color, glyph: String, label: String, fs: int) -> float:
	var p := float(UI.px)
	var w := _tag_w(glyph, label, fs)
	var r := Rect2(at, Vector2(w, _tag_h(fs)))
	UI.notch_rect(ci.get_canvas_item(), r, UI.INK, p)
	var inner := r.grow(-p)
	ci.draw_rect(inner, Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.92))
	ci.draw_rect(inner.grow(-p / 2.0), Color(col, 0.4), false, p)
	var f := UI.spaced("700", fs, 0.06)
	var x := inner.position.x + UI.r(0.45)
	var mid := inner.position.y + inner.size.y / 2.0
	if glyph != "":
		var gs := UI.glyph_size(fs * 0.9)
		UI.draw_glyph(ci, glyph, Vector2(x, roundf(mid - gs / 2.0)), gs, col)
		x += gs + roundf(fs * 0.3)
	ci.draw_string(f, Vector2(x, roundf(mid + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0)), label.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	return w


## Over the hero: the spark burst and the speech bubble.
func _paint_over(ci: CanvasItem, _s: Vector2) -> void:
	var p := float(UI.px)
	var inn := _scene_in
	if _burst_t >= 0.0:
		var ctr := inn.position + Vector2(inn.size.x * 0.5, inn.size.y * 0.52)
		var k := floorf(_burst_t / 0.52 * 6.0) / 6.0
		var sc := lerpf(0.35, 1.5, k)
		var a := 1.0 if k < 0.7 else clampf((1.0 - k) / 0.3, 0.0, 1.0)
		var sz := p * 3
		for i in 8:
			var d := Vector2.from_angle(i * TAU / 8.0 - PI / 2.0) * UI.r(2.6) * sc
			ci.draw_rect(Rect2((ctr + d - Vector2(sz, sz) * sc / 2.0).round(), Vector2(sz, sz) * sc), Color(_burst_col, a))
		var k2 := minf(1.0, floorf(_burst_t / 0.42 * 5.0) / 5.0)
		var sc2 := lerpf(0.3, 1.25, k2)
		for i in 8:
			var d := Vector2.from_angle(i * TAU / 8.0 - PI / 2.0 + deg_to_rad(22)) * UI.r(1.9) * sc2
			ci.draw_rect(Rect2((ctr + d - Vector2(sz, sz) * sc2 / 2.0).round(), Vector2(sz, sz) * sc2), Color(1, 1, 1, 1.0 - k2))
	if _say_t >= 0.0 and _say != "":
		var fs := roundi(UI.r(0.75))
		var f := UI.font("700")
		var maxw := minf(inn.size.x * 0.88, UI.r(17)) - UI.r(0.6) * 2 - p * 2
		if _say_lay == null: _say_lay = Rich.layout([Rich.run(_say, f, fs, UI.GOLD_INK)], maxw, roundf(fs * 1.2))
		var lay := _say_lay
		var bw := lay.w + UI.r(0.6) * 2 + p * 2
		var bh := lay.h + p * 2 + p * 3 + p * 2
		var t := _say_t
		var a := clampf(t / 0.12, 0.0, 1.0) if t < 2.6 else clampf(1.0 - (t - 2.6) / 0.16, 0.0, 1.0)
		var e := clampf(t / 0.2, 0.0, 1.0)
		# Pops in with a little overshoot.
		var sc := 0.8 + 0.2 * (1.0 + 2.2 * pow(e - 1.0, 3) + 1.2 * pow(e - 1.0, 2)) if t < 2.6 else 1.0
		var r := Rect2(inn.position.x + inn.size.x / 2.0 - bw / 2.0, inn.position.y + inn.size.y * 0.07 + (1.0 - e) * UI.r(0.4), bw, bh)
		var ctr := r.get_center()
		ci.draw_set_transform(ctr - ctr * sc, 0.0, Vector2(sc, sc))
		r = UI.rround(r)
		ci.draw_rect(Rect2(r.position + Vector2(0, p * 2), r.size), Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.5 * a))
		ci.draw_rect(r, Color(UI.INK, a))
		var inner := r.grow(-p)
		ci.draw_rect(inner, Color(Color("#fff3d6"), a))
		ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), Color(Color("#e2c58e"), a))
		# The tail.
		var tx := roundf(r.get_center().x - p * 3)
		ci.draw_colored_polygon(PackedVector2Array([Vector2(tx, r.end.y), Vector2(tx + p * 5, r.end.y), Vector2(tx + p, r.end.y + p * 5)]), Color(Color("#e2c58e"), a))
		lay.draw(ci, Vector2(r.position.x + p + UI.r(0.6), r.position.y + p * 3), 0.5, lay.w, a)
		ci.draw_set_transform(Vector2.ZERO)


# --- The panel body -----------------------------------------------------------------------------

func _on_body_tap(pos: Vector2) -> void:
	for i in range(_hits.size() - 1, -1, -1):
		var h: Array = _hits[i]
		if (h[0] as Rect2).has_point(pos):
			(h[1] as Callable).call()
			return


func _paint_body(ci: CanvasItem, s: Vector2, off: float) -> void:
	var lo := off - UI.r(1)
	var hi := off + s.y + UI.r(1)
	for pc in _pieces:
		var r: Rect2 = pc[0]
		if r.end.y < lo or r.position.y > hi: continue
		r.position.y -= off
		(pc[1] as Callable).call(ci, r)
	for r0 in _cursors:
		var r: Rect2 = r0
		r.position.y -= off
		var g := r.grow(UI.px * 4)
		if _beat == 1: g = g.grow_individual(g.size.x * 0.025, g.size.y * 0.025, g.size.x * 0.025, g.size.y * 0.025)
		UI.draw_frame(ci.get_canvas_item(), UI.rround(g), "cursor")


func _piece(r: Rect2, f: Callable) -> void:
	_pieces.append([r, f])


func _hit(r: Rect2, f: Callable) -> void:
	_hits.append([r, f])


func _ctrl(ctl: Control, at: Vector2) -> void:
	if ctl.get_parent() == null: _body.add_child(ctl)
	_ctrls.append([ctl, at])


## Grid geometry: `n` cells in `cols` columns across `w`; returns the cell width.
func _cell_w(w: float, cols: int) -> float:
	return floorf((w - UI.c(6) * (cols - 1)) / cols)


## A pick card: art on top (a glow in the option's colour), the name on a strip under it.
## `art(ci, rect)` draws the art; `sub` is a small line under the name (tier, price).
func _card(r: Rect2, art_h: float, tint: Color, on: bool, label: String, art: Callable, opts := {}) -> void:
	var lift: float = UI.px if on else 0.0
	var dr := Rect2(r.position - Vector2(0, lift), r.size)
	var peek: bool = opts.get("peek", false)
	_piece(r, func(ci: CanvasItem, rr: Rect2):
		var p := float(UI.px)
		rr.position.y -= lift
		ci.draw_rect(rr, UI.INK)
		var inner := rr.grow(-p)
		ci.draw_rect(inner, Color("#4a3410") if on else Color("#241b3b"))
		var ar := Rect2(inner.position, Vector2(inner.size.x, art_h))
		# The selected ring shows round the label only (the art covers the rest).
		if on:
			_ring(ci, inner, UI.GOLD, p)
			ci.draw_rect(Rect2(inner.position.x + p, inner.end.y - p * 2, inner.size.x - p * 2, p * 2), UI.GOLD_LO)
		var bot := Color("#1a1220") if on else Color("#150f26")
		UI.vgrad(ci.get_canvas_item(), ar, [[0.0, Color("#120b14") if on else Color("#0b0816")], [1.0, bot.lerp(tint, 0.3 if on else 0.14)]])
		# CSS: radial-gradient(ellipse 70% 40% at 50% 100%, tint 38%, transparent 72%) (75% 50% / 65% / 74% when on).
		var gr := Vector2(0.75 * 0.74, 0.5 * 0.74) if on else Vector2(0.7 * 0.72, 0.4 * 0.72)
		UI.glow(ci.get_canvas_item(), Vector2(ar.get_center().x, ar.end.y), ar.size * gr, Color(tint, 0.65 if on else 0.38), 1.0, true)
		art.call(ci, ar)
		ci.draw_rect(Rect2(ar.position.x, ar.end.y, ar.size.x, p), UI.INK)
		if not on:
			ci.draw_rect(Rect2(inner.position.x, ar.end.y + p, inner.size.x, p), Color("#4a3b72"))
			ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), Color("#120c20"))
		if peek and not on:
			_dashed(ci, inner.grow(-p * 2), tint, p)
		var ty := ar.end.y + p
		if label != "":
			var fs := roundi(UI.r(0.75))
			var f := UI.font("700")
			var t := label
			var maxw := inner.size.x - UI.r(0.15) * 2
			while UI.text_w(f, t, fs) > maxw and t.length() > 2: t = t.substr(0, t.length() - 2) + "…"
			var base := ty + UI.r(0.22) + roundf(f.get_ascent(fs))
			UI.draw_text(ci, f, Vector2(roundf(inner.get_center().x - UI.text_w(f, t, fs) / 2.0), base), t, fs, UI.GOLD_HI if on else UI.TEXT)
			ty += UI.r(0.22) + fs + UI.r(0.26)
		var sub = opts.get("sub")
		if sub != null:
			var sfs := roundi(UI.r(0.625))
			var sf := UI.font("600")
			var col: Color = opts.get("sub_col", UI.MUTED)
			var lock: bool = opts.get("lock", false)
			var gs := UI.glyph_size(sfs * 0.9) if lock else 0.0
			var sw := gs + (UI.c(2) if lock else 0.0) + UI.text_w(sf, sub, sfs)
			var x := roundf(inner.get_center().x - sw / 2.0)
			var base := ty + UI.r(0.2) + roundf(sf.get_ascent(sfs))
			if lock: UI.draw_glyph(ci, "lock", Vector2(x, base - gs + UI.px), gs, col)
			ci.draw_string(sf, Vector2(x + sw - UI.text_w(sf, sub, sfs), base), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, col))
	if on: _cursors.append(dr)


func _card_label_h() -> float:
	return UI.r(0.22) + roundi(UI.r(0.75)) + UI.r(0.26)


func _card_sub_h() -> float:
	return UI.r(0.2) + roundi(UI.r(0.625)) + UI.r(0.35)


static func _ring(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:
	ci.draw_rect(Rect2(r.position, Vector2(r.size.x, w)), col)
	ci.draw_rect(Rect2(r.position.x, r.end.y - w, r.size.x, w), col)
	ci.draw_rect(Rect2(r.position.x, r.position.y + w, w, r.size.y - w * 2), col)
	ci.draw_rect(Rect2(r.end.x - w, r.position.y + w, w, r.size.y - w * 2), col)


static func _dashed(ci: CanvasItem, r: Rect2, col: Color, p: float) -> void:
	var d := p * 3
	var x := r.position.x
	while x < r.end.x:
		var w := minf(d, r.end.x - x)
		ci.draw_rect(Rect2(x, r.position.y, w, p), col)
		ci.draw_rect(Rect2(x, r.end.y - p, w, p), col)
		x += d * 2
	var y := r.position.y
	while y < r.end.y:
		var h := minf(d, r.end.y - y)
		ci.draw_rect(Rect2(r.position.x, y, p, h), col)
		ci.draw_rect(Rect2(r.end.x - p, y, p, h), col)
		y += d * 2


## A still portrait (44x64 card or 30x26 bust) drawn into `ar`.
func _portrait_art(build: Dictionary, art: Vector2, ground: float) -> Callable:
	return func(ci: CanvasItem, ar: Rect2):
		var s = _portraits.get_(build, _body.queue_redraw)
		var k := float(UI.fit_scale(art, ar.size))
		Portraits.draw(ci, s, ar, art, ground, k)


func _glyph_art(glyph: String, col: Color, alpha := 1.0) -> Callable:
	return func(ci: CanvasItem, ar: Rect2):
		var gs := UI.glyph_size(minf(ar.size.x * 0.5, ar.size.y * 0.62))
		var at := (ar.get_center() - Vector2(gs, gs) / 2.0).round()
		var p := float(UI.px)
		UI.draw_glyph(ci, glyph, at + Vector2(0, p), gs, Color(UI.INK, alpha))
		UI.draw_glyph(ci, glyph, at - Vector2(0, p), gs, Color(UI.INK, alpha))
		UI.draw_glyph(ci, glyph, at, gs, Color(col, alpha))


## The info strip under a grid: a big name in the option's colour, a sub line, then more pieces.
## `more(y, w) -> h` lays out what follows inside it; returns the strip's bottom.
func _info(y: float, w: float, title: String, col: Color, sub: String, parts: Array) -> float:
	var p := float(UI.px)
	var pad := Vector2(UI.r(0.5), UI.r(0.3))
	var top := y + UI.c(7)
	var tfs := roundi(UI.r(1.05))
	var tf := UI.spaced("p700", tfs, 0.0)
	var iw := w - pad.x * 2 - p * 2
	var x0 := pad.x + p + p
	var cy := top + p + pad.y
	var tline := tfs + p * 2
	var title_w := UI.text_w(tf, title, tfs)
	var sfs := roundi(UI.r(0.8125))
	var sf := UI.font("500")
	var hy := cy
	cy += tline + UI.c(3)
	var inner_pieces := []
	for part in parts:
		var h: float = part.call(x0, cy, iw, inner_pieces)
		cy += h + UI.c(3)
	cy -= UI.c(3)
	var bottom := cy + pad.y + UI.r(0.1) + p
	var rect := Rect2(0, top, w, bottom - top)
	_piece(rect, func(ci: CanvasItem, r: Rect2):
		var d := r.position.y - rect.position.y
		var inner := r.grow(-p)
		ci.draw_rect(r, UI.INK)
		UI.hgrad(ci.get_canvas_item(), inner, [[0.0, Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.6).lerp(col, 0.16)], [0.6, Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.45)], [1.0, Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.45)]])
		_ring(ci, inner, UI.LINE, p)
		ci.draw_rect(Rect2(inner.position, Vector2(p * 2, inner.size.y)), col)
		var base := hy + d + roundf(tf.get_ascent(tfs))
		_name_text(ci, tf, Vector2(r.position.x + x0, base), title, tfs, col, UI.INK)
		if sub != "":
			ci.draw_string(sf, Vector2(r.position.x + x0 + title_w + UI.c(10), base), sub, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)
		for ip in inner_pieces:
			var rr: Rect2 = ip[0]
			(ip[1] as Callable).call(ci, Rect2(rr.position + Vector2(r.position.x, d), rr.size)))
	return bottom


## An info part: wrapped text (`cry` the bold italic battle cry).
func _para(text: String, cry := false) -> Callable:
	return func(x: float, y: float, w: float, out: Array) -> float:
		var fs := roundi(UI.r(0.8125 if cry else 0.75))
		var f := _italic() if cry else UI.font("500")
		var lay := Rich.layout([Rich.run(text, f, fs, UI.TEXT)], w, roundf(fs * (1.25 if cry else 1.3)))
		out.append([Rect2(x, y, w, lay.h), func(ci: CanvasItem, r: Rect2): lay.draw(ci, r.position)])
		return lay.h


static var _ital: FontVariation


static func _italic() -> Font:
	if _ital == null:
		_ital = FontVariation.new()
		_ital.base_font = UI.font("700")
		_ital.variation_transform = Transform2D(Vector2(1, 0.2), Vector2(0, 1), Vector2.ZERO)
	return _ital


## An info part: label, ten segment cells, value; two pairs to a row.
func _bars(rows: Array, seg: Color) -> Callable:
	return func(x: float, y: float, w: float, out: Array) -> float:
		var fs := roundi(UI.r(0.6875))
		var f := UI.font("500")
		var bf := UI.font("700")
		var gap := UI.c(8)
		var lw := [0.0, 0.0]
		var vw := [UI.text_w(bf, "000", fs), UI.text_w(bf, "000", fs)]
		for i in rows.size():
			lw[i % 2] = maxf(lw[i % 2], UI.text_w(f, rows[i][0], fs))
			vw[i % 2] = maxf(vw[i % 2], UI.text_w(bf, rows[i][2], fs))
		var sw: float = (w - lw[0] - lw[1] - vw[0] - vw[1] - gap * 5) / 2.0
		var lh := roundf(fs * 1.3)
		var n := ceili(rows.size() / 2.0)
		var h := n * lh + (n - 1) * UI.c(3)
		out.append([Rect2(x, y, w, h), func(ci: CanvasItem, r: Rect2):
			var p := float(UI.px)
			for i in rows.size():
				var row: Array = rows[i]
				var col := i % 2
				var cx: float = r.position.x + (0.0 if col == 0 else lw[0] + sw + vw[0] + gap * 3)
				var cy := r.position.y + floori(i / 2) * (lh + UI.c(3))
				var base := roundf(cy + (lh + f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
				ci.draw_string(f, Vector2(cx, base), row[0], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UI.MUTED)
				var sx: float = cx + lw[col] + gap
				var sh := roundf(UI.r(0.6))
				var sr := Rect2(sx, roundf(cy + (lh - sh) / 2.0), floorf(sw), sh)
				ci.draw_rect(sr, UI.INK)
				var cw := (sr.size.x - p * 2 - p * 9) / 10.0
				for k in 10:
					var cr := Rect2(roundf(sr.position.x + p + k * (cw + p)), sr.position.y + p, roundf(cw), sh - p * 2)
					if k < int(row[1]):
						ci.draw_rect(cr, seg)
						ci.draw_rect(Rect2(cr.position, Vector2(cr.size.x, p)), Color(1, 1, 1, 0.35).blend(seg) if false else seg.lerp(Color.WHITE, 0.35))
						ci.draw_rect(Rect2(cr.position.x, cr.end.y - p, cr.size.x, p), seg.lerp(Color.BLACK, 0.3))
					else:
						ci.draw_rect(cr, Color("#241b3a"))
				var v: String = row[2]
				UI.draw_text(ci, bf, Vector2(sx + sw + gap + vw[col] - UI.text_w(bf, v, fs), base), v, fs, UI.TEXT, "")])
		return h


## An info part: small chips in a row (the species' bodies), with a gold label in front.
func _chips(label: String, chips: Array) -> Callable:
	return func(x: float, y: float, w: float, out: Array) -> float:
		var fs := roundi(UI.r(0.6875))
		var lfs := roundi(UI.r(0.625))
		var lf := UI.spaced("700", lfs, 0.12)
		var p := float(UI.px)
		var th := _tag_h(fs)
		var placed := []
		var cx := UI.text_w(lf, label.to_upper(), lfs) + UI.c(2) + p * 2
		var cy := 0.0
		for ch in chips:
			var tw := _tag_w("", ch[1], fs)
			if cx + tw > w and cx > 0.0:
				cx = 0.0
				cy += th + p * 2
			placed.append([Vector2(cx, cy), ch])
			cx += tw + p * 2
		var h := cy + th
		out.append([Rect2(x, y, w, h), func(ci: CanvasItem, r: Rect2):
			ci.draw_string(lf, Vector2(r.position.x, roundf(r.position.y + (th + lf.get_ascent(lfs) - lf.get_descent(lfs)) / 2.0)), label.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, lfs, UI.GOLD)
			for pl in placed: _tag(ci, r.position + pl[0], pl[1][0], "", pl[1][1], fs)])
		return h


# --- Steps -------------------------------------------------------------------------------------

func _species_step(w: float, y: float) -> float:
	var ids: Array = CharacterAppearance.SPECIES_IDS
	var cw := _cell_w(w, 6)
	var ah := roundf(cw * 50.0 / 44.0)
	var ch := UI.px * 2 + ah + UI.px + _card_label_h()
	for i in ids.size():
		var id: String = ids[i]
		var look: Dictionary = c["look"].duplicate()
		look["species"] = id
		if id != c["look"]["species"]: look["skin"] = 0
		var b := _bare(c)
		b["form"] = "balanced"
		b["look"] = look
		var r := Rect2(i * (cw + UI.c(6)), y, cw, ch)
		_card(r, ah, _col(SPECIES_TINT[id]), c["look"]["species"] == id, CharacterAppearance.SPECIES[id]["name"], _portrait_art(b, Vector2(44, 64), 3))
		_hit(r, func():
			if c["look"]["species"] == id: return
			Sfx.sfx.play("select")
			_pick_species(id)
			_refresh())
	_cycler = func(dir: int):
		var i := ids.find(c["look"]["species"])
		_pick_species(ids[(i + dir + ids.size()) % ids.size()])
	var sp: Dictionary = CharacterAppearance.SPECIES[c["look"]["species"]]
	var chips := []
	for f in sp["forms"]: chips.append([_col(SimForms.FORMS[f]["color"]), SimForms.FORMS[f]["name"]])
	return _info(y + ch, w, sp["name"], _col(SPECIES_TINT[sp["id"]]), "", [_para(sp["blurb"]), _chips("Bodies", chips)])


static func _fmt_form(v: float, kind: int) -> String:
	match kind:
		1: return String.num(v, 1) if not is_equal_approx(v, roundf(v)) else "%d.0" % roundi(v)
		2: return "%d%%" % roundi(v * 100.0)
	return str(roundi(v))


func _form_step(w: float, y: float) -> float:
	var forms: Array = CharacterAppearance.SPECIES[c["look"]["species"]]["forms"]
	var cw := _cell_w(w, forms.size())
	var ah := roundf(cw * 50.0 / 44.0)
	var ch := UI.px * 2 + ah + UI.px + _card_label_h()
	for i in forms.size():
		var id: String = forms[i]
		var f: Dictionary = SimForms.FORMS[id]
		var b := _bare(c)
		b["form"] = id
		var r := Rect2(i * (cw + UI.c(6)), y, cw, ch)
		_card(r, ah, _col(f["color"]), c["form"] == id, f["name"], _portrait_art(b, Vector2(44, 64), 3))
		_hit(r, func():
			if c["form"] == id: return
			Sfx.sfx.play("select")
			_pick_form(id)
			_refresh())
	_cycler = func(dir: int):
		var i := forms.find(c["form"])
		_pick_form(forms[(i + dir + forms.size()) % forms.size()])
	var f: Dictionary = SimForms.FORMS[c["form"]]
	var rows := []
	for fs in FORM_STATS:
		var v := float(f["base"][fs[0]])
		var rg: Array = _range[fs[0]]
		var n := 3 + roundi((v - rg[0]) / (rg[1] - rg[0]) * 7.0) if rg[1] > rg[0] else 6
		rows.append([fs[1], n, _fmt_form(v, fs[2])])
	return _info(y + ch, w, f["name"], _col(f["color"]), f["title"], [_para(f["blurb"]), _bars(rows, _col(f["color"]))])


func _style_step(w: float, y: float) -> float:
	var ids: Array = SimStyles.FIGHT_STYLE_IDS
	var cw := _cell_w(w, 5)
	var ah := roundf(cw * 0.62)
	var ch := UI.px * 2 + ah + UI.px + _card_label_h()
	for i in ids.size():
		var id: String = ids[i]
		var s: Dictionary = SimStyles.FIGHT_STYLES[id]
		var r := Rect2(i * (cw + UI.c(6)), y, cw, ch)
		_card(r, ah, _col(s["color"]), _style() == id, s["name"], _glyph_art(STYLE_ICON[id], _col(s["color"])))
		_hit(r, func():
			if _style() == id: return
			Sfx.sfx.play("select")
			_pick_style(id)
			_refresh())
	_cycler = func(dir: int):
		var i := ids.find(_style())
		_pick_style(ids[(i + dir + ids.size()) % ids.size()])
	var s: Dictionary = SimStyles.FIGHT_STYLES[_style()]
	var rows := []
	for k in STYLE_BARS.size(): rows.append([STYLE_BARS[k], int(s["bars"][k]), str(int(s["bars"][k]))])
	return _info(y + ch, w, s["name"], _col(s["color"]), s["title"], [_para("“%s”" % UiHeroLines.STYLE_LINE[s["id"]], true), _para(s["blurb"]), _bars(rows, _col(s["color"]))])


## Look: a list of what to style on the left, the options on the right.
func _look_defs() -> Array:
	var sp: Dictionary = CharacterAppearance.SPECIES[c["look"]["species"]]
	var styles = CharacterAppearance.HAIR_STYLES if sp.get("hair") else sp.get("styles")
	var defs := [{"id": "skin", "label": SKIN_LABEL.get(sp["id"], "Skin"), "colors": sp["skins"], "key": "skin"},
		{"id": "eyes", "label": "Eyes", "colors": CharacterAppearance.EYE_COLORS, "key": "eyes"}]
	if styles != null:
		defs.append({"id": "hair", "label": "Hair" if sp.get("hair") else str(sp.get("styleLabel", "Style")), "names": styles, "key": "hair"})
	defs.append({"id": "hairColor", "label": "Hair colour" if sp.get("hair") else "%s colour" % str(sp.get("styleLabel", "Crown")), "colors": CharacterAppearance.HAIR_COLORS, "key": "hairColor"})
	defs.append({"id": "outfit", "label": "Outfit", "colors": CharacterAppearance.OUTFIT_COLORS, "key": "outfit"})
	defs.append({"id": "accent", "label": "Trims", "colors": CharacterAppearance.ACCENT_COLORS, "key": "accent"})
	return defs


func _look_get(d: Dictionary) -> int:
	var v := int(c["look"].get(d["key"], 0))
	return v % (d["names"] as Array).size() if d.has("names") else v


func _look_choose(d: Dictionary, i: int) -> void:
	if i == _look_get(d): return
	Sfx.sfx.play("select")
	_set_look({d["key"]: i})
	_burst(d["colors"][i] if d.has("colors") else null)
	say(UiHeroLines.pick_line(UiHeroLines.LOOK_LINES), true)
	_refresh()


func _surprise() -> void:
	var r: Dictionary = CharacterAppearance.random_appearance()
	var sp: Dictionary = CharacterAppearance.SPECIES[c["look"]["species"]]
	for k in ["species", "backdrop", "entrance", "finisher", "pose"]:
		if c["look"].has(k): r[k] = c["look"][k]
		else: r.erase(k)
	r["species"] = c["look"]["species"]
	r["skin"] = randi() % (sp["skins"] as Array).size()
	Sfx.sfx.play("select")
	_set_look(r, true)
	_burst()
	say("Whoa. New me!")
	_refresh()


func _look_step(w: float, y: float) -> float:
	var defs := _look_defs()
	var cur = null
	for d in defs:
		if d["id"] == look_cat: cur = d
	if cur == null:
		look_cat = "skin"
		cur = defs[0]
	_preview.zoom(FACE.has(look_cat))
	var d0: Dictionary = cur
	_cycler = func(dir: int):
		var n: int = (d0["colors"] as Array).size() if d0.has("colors") else (d0["names"] as Array).size()
		_look_choose(d0, (_look_get(d0) + dir + n) % n)
	var p := float(UI.px)
	var lw := maxf(UI.r(8), (w - UI.c(10)) * 0.75 / 2.35)
	var ch := UI.r(2.15)
	var cy := y
	for d in defs:
		var r := Rect2(0, cy, lw, ch)
		var on: bool = d["id"] == look_cat
		var dd: Dictionary = d
		_piece(r, func(ci: CanvasItem, rr: Rect2):
			var rid := ci.get_canvas_item()
			UI.notch_rect(rid, rr, UI.INK, p)
			var inner := rr.grow(-p)
			ci.draw_rect(inner, Color("#3d2b10") if on else Color("#221a38"))
			if on:
				_ring(ci, inner, UI.GOLD, p)
				ci.draw_rect(Rect2(inner.position.x + p, inner.end.y - p * 2, inner.size.x - p * 2, p * 2), UI.GOLD_LO)
				ci.draw_rect(Rect2(inner.position.x + p, inner.position.y + p, p * 3, inner.size.y - p * 3), UI.GOLD)
			else:
				ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p)), Color("#3d3063"))
				ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), Color("#120c20"))
			var label := (dd["label"] as String).to_upper()
			var fs := roundi(UI.r(0.75))
			var f := UI.spaced("700", fs, 0.05)
			# Long names ("Crystals colour") step down a size rather than run under the value.
			var room := inner.size.x - UI.r(0.65) - UI.r(0.5) - UI.c(8) - (roundf(UI.r(1.25)) if dd.has("colors") else UI.r(2.5))
			while UI.text_w(f, label, fs) > room and fs > roundi(UI.r(0.55)):
				fs -= 1
				f = UI.spaced("700", fs, 0.05)
			var mid := inner.position.y + (inner.size.y - p) / 2.0
			var base := roundf(mid + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
			UI.draw_text(ci, f, Vector2(inner.position.x + UI.r(0.65), base), label, fs, UI.GOLD_HI if on else UI.MUTED)
			if dd.has("colors"):
				var sw := roundf(UI.r(1.25))
				var sr := Rect2(inner.end.x - UI.r(0.5) - sw, roundf(mid - sw / 2.0), sw, sw)
				_swatch(ci, sr, _col(dd["colors"][_look_get(dd)]))
			else:
				var efs := roundi(UI.r(0.6875))
				var ef := UI.spaced("700", efs, 0.05)
				var t := (dd["names"][_look_get(dd)] as String).to_upper()
				UI.draw_text(ci, ef, Vector2(inner.end.x - UI.r(0.5) - UI.text_w(ef, t, efs), roundf(mid + (ef.get_ascent(efs) - ef.get_descent(efs)) / 2.0)), t, efs, UI.GOLD_HI))
		_hit(r, func():
			if dd["id"] == look_cat: return
			Sfx.sfx.play("select")
			look_cat = dd["id"]
			_refresh())
		cy += ch + p * 2
	var px0 := lw + UI.c(10)
	var pw := minf(w - px0, UI.r(26))
	var py := y + p
	var bottom := cy
	if d0.has("names"):
		# Hair: bust portraits.
		var names: Array = d0["names"]
		var cols := 3
		var cw := _cell_w(pw, cols)
		var ah := roundf(cw * 26.0 / 30.0)
		var hh := UI.px * 2 + ah + UI.px + _card_label_h()
		for i in names.size():
			var b := _bare(c)
			var lk: Dictionary = c["look"].duplicate()
			lk["hair"] = i
			b["look"] = lk
			var r := Rect2(px0 + (i % cols) * (cw + UI.c(6)), py + floori(i / cols) * (hh + UI.c(6)), cw, hh)
			_card(r, ah, _col(CharacterAppearance.HAIR_COLORS[int(c["look"]["hairColor"])]), i == _look_get(d0), names[i], _portrait_art(b, Vector2(30, 26), -36))
			_hit(r, _look_choose.bind(d0, i))
			bottom = maxf(bottom, r.end.y)
	else:
		var colors: Array = d0["colors"]
		var gap := UI.c(8)
		var cols := maxi(1, floori((pw + gap) / (UI.r(2.9) + gap)))
		var sw := floorf((pw - gap * (cols - 1)) / cols)
		for i in colors.size():
			var r := Rect2(px0 + (i % cols) * (sw + gap), py + p * 2 + floori(i / cols) * (sw + gap + p * 4), sw, sw)
			var on := i == _look_get(d0)
			var col := _col(colors[i])
			_piece(r, func(ci: CanvasItem, rr: Rect2):
				if on:
					rr.position.y -= p
					ci.draw_rect(rr.grow(p * 3), UI.INK)
					_ring(ci, rr.grow(p * 2), UI.GOLD_HI, p)
					ci.draw_rect(Rect2(roundf(rr.get_center().x - p * 1.5), rr.end.y + p * 4, p * 3, p * 2), UI.GOLD_HI)
				_swatch(ci, rr, col))
			_hit(r, _look_choose.bind(d0, i))
			bottom = maxf(bottom, r.end.y + p * 6)
	return bottom


## A colour gem: bevelled, ink-edged.
static func _swatch(ci: CanvasItem, r: Rect2, col: Color) -> void:
	var p := float(UI.px)
	ci.draw_rect(r, UI.INK)
	var inner := r.grow(-p)
	ci.draw_rect(inner, col)
	ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p)), col.lerp(Color.WHITE, 0.35))
	ci.draw_rect(Rect2(inner.position, Vector2(p, inner.size.y)), col.lerp(Color.WHITE, 0.35))
	ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), col.lerp(Color.BLACK, 0.35))
	ci.draw_rect(Rect2(inner.end.x - p, inner.position.y + p, p, inner.size.y - p), col.lerp(Color.BLACK, 0.35))


func _name_step(w: float, y: float) -> float:
	var p := float(UI.px)
	var sp: Dictionary = CharacterAppearance.SPECIES[c["look"]["species"]]
	var f: Dictionary = SimForms.FORMS[c["form"]]
	var s: Dictionary = SimStyles.FIGHT_STYLES[_style()]
	var facts := [["Species", sp["name"], _col(SPECIES_TINT[sp["id"]])], ["Body", f["name"], _col(f["color"])], ["Style", s["name"], _col(s["color"])], ["Fights with", SimGear.gear_of(c["gear"]["main"])["name"], UI.GOLD_HI]]
	# Measure first: the whole block sits in the middle of the panel.
	var in_h := UI.r(2.9)
	var banner_h := in_h + p * 6 + p * 2
	var hfs := roundi(UI.r(0.75))
	var chant := PxButton.new("Hear the crowd", "friends", "", "sm")
	var ffs := roundi(UI.r(0.5625))
	var vfs := roundi(UI.r(1.0))
	var fact_h := p * 2 + UI.r(0.3) + ffs + UI.c(4) + vfs + UI.r(0.4)
	var total := banner_h + UI.r(0.4) + hfs + UI.r(0.4) + chant.custom_minimum_size.y + UI.r(0.4) + UI.r(0.2) + fact_h
	chant._fit()
	total = banner_h + UI.r(0.4) + hfs + UI.r(0.4) + chant.custom_minimum_size.y + UI.r(0.4) + UI.r(0.2) + fact_h
	var top := maxf(y + UI.r(0.2), roundf((_body.size.y - total) / 2.0))
	# The banner: a ribbon with the name field and the dice in it.
	var bw := minf(w - p * 20, UI.r(30))
	var br := Rect2(roundf((w - bw) / 2.0), top, bw, banner_h)
	_piece(br, func(ci: CanvasItem, r: Rect2):
		# Tails behind, then the band.
		for side in [-1, 1]:
			var tx: float = r.position.x - p * 8 if side < 0 else r.end.x - p * 2
			var tr := Rect2(tx, r.position.y + p * 4, p * 10, r.size.y)
			var notch: float = tr.position.x + (tr.size.x * 0.45 if side < 0 else tr.size.x * 0.55)
			var pts := PackedVector2Array([tr.position, Vector2(tr.end.x, tr.position.y), tr.end, Vector2(tr.position.x, tr.end.y)])
			ci.draw_colored_polygon(pts, UI.INK)
			var ins := tr.grow(-p)
			var poly := PackedVector2Array([ins.position, Vector2(ins.end.x, ins.position.y), ins.end, Vector2(ins.position.x, ins.end.y)])
			ci.draw_colored_polygon(poly, Color("#5e1224"))
			var cut := PackedVector2Array([Vector2(tr.position.x if side < 0 else tr.end.x, tr.end.y - p * 3 - tr.size.y * 0.25), Vector2(notch, tr.position.y + tr.size.y * 0.5), Vector2(tr.position.x if side < 0 else tr.end.x, tr.end.y + p)])
			ci.draw_colored_polygon(cut, Color(0, 0, 0, 0))
		ci.draw_rect(Rect2(r.position + Vector2(0, p * 2), r.size), Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.55))
		ci.draw_rect(r, UI.INK)
		var inner := r.grow(-p)
		ci.draw_rect(inner, UI.RIBBON)
		ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p)), UI.RIBBON_HI)
		ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), UI.RIBBON_LO)
		# The field's sunken box.
		var fr := Rect2(r.position.x + p * 4, r.position.y + p * 4, r.size.x - p * 8 - in_h - UI.c(6), in_h)
		ci.draw_rect(fr, UI.INK)
		var fi := fr.grow(-p)
		ci.draw_rect(fi, Color("#0b0814"))
		ci.draw_rect(Rect2(fi.position, Vector2(fi.size.x, p * 2)), Color.BLACK)
		var focus := _name_in.has_focus()
		var shaking := _shake_t >= 0.0 and _shake_t < 0.6
		if focus or shaking: _ring(ci, fi, UI.RED if shaking else UI.GOLD, p)
		else: ci.draw_rect(Rect2(fi.position.x, fi.end.y - p, fi.size.x, p), Color("#4a3b72")))
	var fx := br.position.x + p * 4 + p
	var fw := br.size.x - p * 8 - in_h - UI.c(6) - p * 2
	_name_in.add_theme_font_override("font", UI.spaced("p700", roundi(UI.r(1.45)), 0.04))
	_name_in.add_theme_font_size_override("font_size", roundi(UI.r(1.45)))
	var flat := StyleBoxEmpty.new()
	for st in ["normal", "focus", "read_only"]: _name_in.add_theme_stylebox_override(st, flat)
	_name_in.size = Vector2(fw, in_h - p * 2)
	_ctrl(_name_in, Vector2(fx, br.position.y + p * 5))
	var dice := PxButton.new("", "dice")
	dice.min_w = 2.9
	dice.min_h = 2.9
	dice._fit()
	dice.size = dice.custom_minimum_size
	dice.pressed.connect(func():
		_name_in.text = CharacterProfile.random_name()
		c["name"] = _name_in.text
		_shake_t = -1.0
		Sfx.sfx.play("select")
		_scene.queue_redraw()
		say("%s? ...I like it." % _name_in.text))
	_ctrl(dice, Vector2(br.end.x - p * 4 - dice.size.x, br.position.y + p * 4))
	var hy := br.end.y + UI.r(0.4)
	var hint := "Up to %d letters, or roll the dice." % CharacterProfile.NAME_MAX
	var hf := UI.font("500")
	_piece(Rect2(0, hy, w, hfs), func(ci: CanvasItem, r: Rect2):
		ci.draw_string(hf, Vector2(roundf((w - UI.text_w(hf, hint, hfs)) / 2.0), r.position.y + roundf(hf.get_ascent(hfs))), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, hfs, UI.MUTED))
	var cy := hy + hfs + UI.r(0.4)
	chant.size = chant.custom_minimum_size
	chant.pressed.connect(func():
		var n := CharacterProfile.clean_name(_name_in.text)
		if n == "":
			_name_needed()
			return
		Sfx.sfx.play("entCheer")
		_burst()
		say("%s! %s!" % [n.to_upper(), n.to_upper()]))
	_ctrl(chant, Vector2(roundf((w - chant.size.x) / 2.0), cy))
	cy += chant.size.y + UI.r(0.4) + UI.r(0.2)
	# A summary of the hero so far.
	var lf := UI.spaced("700", ffs, 0.12)
	var vf := UI.font("700")
	var ws := []
	var tot := 0.0
	for ft in facts:
		var fw2 := maxf(UI.r(5.5), maxf(UI.text_w(lf, (ft[0] as String).to_upper(), ffs), UI.text_w(vf, ft[1], vfs)) + UI.r(0.55) * 2 + p * 2)
		ws.append(fw2)
		tot += fw2
	tot += UI.c(8) * (facts.size() - 1)
	var x := roundf((w - tot) / 2.0)
	for i in facts.size():
		var ft: Array = facts[i]
		var r := Rect2(x, cy, ws[i], fact_h)
		_piece(r, func(ci: CanvasItem, rr: Rect2):
			ci.draw_rect(rr, UI.INK)
			var inner := rr.grow(-p)
			ci.draw_rect(inner, Color(0, 0, 0, 0.3).blend(Color(0.1, 0.07, 0.17)))
			_ring(ci, inner, UI.LINE, p)
			var l := (ft[0] as String).to_upper()
			ci.draw_string(lf, Vector2(roundf(rr.get_center().x - UI.text_w(lf, l, ffs) / 2.0), rr.position.y + p + UI.r(0.3) + roundf(lf.get_ascent(ffs))), l, HORIZONTAL_ALIGNMENT_LEFT, -1, ffs, UI.MUTED)
			UI.draw_text(ci, vf, Vector2(roundf(rr.get_center().x - UI.text_w(vf, ft[1], vfs) / 2.0), rr.position.y + p + UI.r(0.3) + ffs + UI.c(4) + roundf(vf.get_ascent(vfs))), ft[1], vfs, ft[2]))
		x += ws[i] + UI.c(8)
	return cy + fact_h


func _backdrop_step(w: float, y: float) -> float:
	var names: Array = CharacterAppearance.BACKDROPS
	var cw := _cell_w(w, 6)
	var ah := roundf(cw * 48.0 / 60.0)
	var ch := UI.px * 2 + ah + UI.px + _card_label_h()
	var cur := int(c["look"].get("backdrop", 0))
	var bottom := y
	for i in names.size():
		var r := Rect2((i % 6) * (cw + UI.c(6)), y + floori(i / 6) * (ch + UI.c(6)), cw, ch)
		var k := i
		_card(r, ah, UI.GOLD_HI, cur == i, names[i], func(ci: CanvasItem, ar: Rect2): UI.draw_backdrop(ci, k, ar))
		_hit(r, func():
			if int(c["look"].get("backdrop", 0)) == k: return
			Sfx.sfx.play("select")
			_pick_backdrop(k)
			_refresh())
		bottom = r.end.y
	_cycler = func(dir: int): _pick_backdrop((int(c["look"].get("backdrop", 0)) + dir + names.size()) % names.size())
	return bottom


## Entrances and finales: a grid of glyph cards (tap to watch it on the stage;
## owned ones are picked) and an info strip with Watch again and Unlock.
func _show_grid(w: float, y: float, ids: Array, def: Callable, owns: Callable, glyph: Callable, cur: String, pick: Callable) -> float:
	var cw := _cell_w(w, 6)
	var ah := roundf(cw / 2.0)
	var ch := UI.px * 2 + ah + UI.px + _card_sub_h()
	var bottom := y
	for i in ids.size():
		var id: String = ids[i]
		var e: Dictionary = def.call(id)
		var mine: bool = owns.call(id)
		var r := Rect2((i % 6) * (cw + UI.c(6)), y + floori(i / 6) * (ch + UI.c(6)), cw, ch)
		var tier: String = e["tier"]
		var sub := str(UiEntranceUi.ENTRANCE_TIER[tier]) if mine else str(int(e["price"]))
		_card(r, ah, _col(e["color"]), cur == id, "", _glyph_art(glyph.call(id), _col(e["color"]), 1.0 if mine else 0.45),
			{"sub": sub, "lock": not mine, "sub_col": TIER_COL.get(tier, UI.MUTED) if mine else UI.MUTED, "peek": id == _shown})
		_hit(r, func():
			Sfx.sfx.play("select")
			pick.call(id))
		bottom = r.end.y
	return bottom


func _show_info(y: float, w: float, e: Dictionary, mine: bool, play: Callable, buy: Callable) -> float:
	var tier := str(UiEntranceUi.ENTRANCE_TIER[e["tier"]])
	var foot := func(x: float, yy: float, iw: float, _out: Array) -> float:
		var again := PxButton.new("Watch again", "replay", "", "sm")
		again._fit()
		again.size = again.custom_minimum_size
		again.pressed.connect(func():
			Sfx.sfx.play("select")
			play.call())
		_ctrl(again, Vector2(x, yy + UI.r(0.4)))
		if not mine:
			var price := int(e["price"])
			var rich := int(CharacterCollection.gems()) >= price
			var b := PxButton.new("Buy?" if _armed else "Unlock", "", "", "sm")
			b.gem = price
			b.font_rem = 0.8125
			b.min_h = 2.1
			b.tag_col = UI.TEXT if rich else UI.RED
			if not rich: b.colors = [Color("#3a3150"), Color("#554a70"), Color("#1e182e"), UI.MUTED]
			elif _armed: b.colors = [Color("#2f8a4e"), Color("#5fd07e"), Color("#144626"), UI.TEXT]
			b._fit()
			b.size = b.custom_minimum_size
			b.pressed.connect(func():
				if not rich:
					Sfx.sfx.play("back")
					return
				if not _armed:
					_armed = true
					Sfx.sfx.play("select")
					_refresh()
					return
				buy.call())
			_ctrl(b, Vector2(x + iw - b.size.x, yy + UI.r(0.4)))
		return UI.r(0.4) + again.size.y
	return _info(y, w, e["name"], _col(e["color"]), tier if mine else "%s · locked" % tier, [_para(e["blurb"]), foot])


func _entrance_step(w: float, y: float) -> float:
	var ids: Array = CharacterEntrances.ENTRANCE_IDS
	var pick := func(id: String):
		_shown = id
		_armed = false
		if CharacterEntrances.owns_entrance(id): c["look"]["entrance"] = id
		_preview.play_entrance(id)
		_refresh()
	var cur := CharacterEntrances.entrance_of(c["look"], true)
	if _shown == "": _shown = cur
	var bottom := _show_grid(w, y, ids, func(id): return CharacterEntrances.ENTRANCES[id], CharacterEntrances.owns_entrance, func(id): return UiEntranceUi.ENTRANCE_ICON[id], cur, pick)
	var e: Dictionary = CharacterEntrances.ENTRANCES[_shown]
	var shown := _shown
	return _show_info(bottom, w, e, CharacterEntrances.owns_entrance(shown), func(): _preview.play_entrance(shown), func():
		if not CharacterEntrances.buy_entrance(shown): return
		Sfx.sfx.play("revealMythic")
		pick.call(shown))


func _finale_cur() -> String:
	return CharacterFinales.finisher_of(c["look"], true) if finale_cat == "finisher" else CharacterFinales.pose_of(c["look"], true)


func _finale_def(id: String) -> Dictionary:
	return CharacterFinales.FINISHERS[id] if finale_cat == "finisher" else CharacterFinales.POSES[id]


func _finale_owns(id: String) -> bool:
	return CharacterFinales.owns_finisher(id) if finale_cat == "finisher" else CharacterFinales.owns_pose(id)


func _finale_play(id: String) -> void:
	if finale_cat == "finisher": _preview.play_finisher(id, CharacterFinales.pose_of(c["look"], true))
	else: _preview.play_pose(id)


func _finale_step(w: float, y: float) -> float:
	var p := float(UI.px)
	# Finisher or victory pose, side by side above the grid.
	var cw := floorf((w - p * 2) / 2.0)
	var ch := UI.r(2.15)
	for i in 2:
		var kind: String = ["finisher", "pose"][i]
		var on := kind == finale_cat
		var label: String = ["Finisher", "Victory pose"][i]
		var val: String = (CharacterFinales.FINISHERS[CharacterFinales.finisher_of(c["look"], true)] if i == 0 else CharacterFinales.POSES[CharacterFinales.pose_of(c["look"], true)])["name"]
		var r := Rect2(i * (cw + p * 2), y, cw, ch)
		_piece(r, func(ci: CanvasItem, rr: Rect2):
			UI.notch_rect(ci.get_canvas_item(), rr, UI.INK, p)
			var inner := rr.grow(-p)
			ci.draw_rect(inner, Color("#3d2b10") if on else Color("#221a38"))
			if on:
				_ring(ci, inner, UI.GOLD, p)
				ci.draw_rect(Rect2(inner.position.x + p, inner.end.y - p * 2, inner.size.x - p * 2, p * 2), UI.GOLD_LO)
				ci.draw_rect(Rect2(inner.position.x + p, inner.position.y + p, p * 3, inner.size.y - p * 3), UI.GOLD)
			else:
				ci.draw_rect(Rect2(inner.position, Vector2(inner.size.x, p)), Color("#3d3063"))
				ci.draw_rect(Rect2(inner.position.x, inner.end.y - p * 2, inner.size.x, p * 2), Color("#120c20"))
			var fs := roundi(UI.r(0.75))
			var f := UI.spaced("700", fs, 0.05)
			var mid := inner.position.y + (inner.size.y - p) / 2.0
			var base := roundf(mid + (f.get_ascent(fs) - f.get_descent(fs)) / 2.0)
			UI.draw_text(ci, f, Vector2(inner.position.x + UI.r(0.65), base), label.to_upper(), fs, UI.GOLD_HI if on else UI.MUTED)
			var efs := roundi(UI.r(0.6875))
			var ef := UI.spaced("700", efs, 0.05)
			var t := val.to_upper()
			UI.draw_text(ci, ef, Vector2(inner.end.x - UI.r(0.5) - UI.text_w(ef, t, efs), roundf(mid + (ef.get_ascent(efs) - ef.get_descent(efs)) / 2.0)), t, efs, UI.GOLD_HI))
		_hit(r, func():
			if kind == finale_cat: return
			Sfx.sfx.play("select")
			finale_cat = kind
			_shown = _finale_cur()
			_armed = false
			_finale_play(_shown)
			_refresh())
	var pick := func(id: String):
		_shown = id
		_armed = false
		if _finale_owns(id):
			c["look"]["finisher" if finale_cat == "finisher" else "pose"] = id
		_finale_play(id)
		_refresh()
	_cycler = func(dir: int):
		var ids: Array = CharacterFinales.FINISHER_IDS if finale_cat == "finisher" else CharacterFinales.POSE_IDS
		pick.call(ids[(ids.find(_shown) + dir + ids.size()) % ids.size()])
	var ids: Array = CharacterFinales.FINISHER_IDS if finale_cat == "finisher" else CharacterFinales.POSE_IDS
	if _shown == "": _shown = _finale_cur()
	var icons: Dictionary = UiFinaleUi.FINISHER_ICON if finale_cat == "finisher" else UiFinaleUi.POSE_ICON
	var bottom := _show_grid(w, y + ch + UI.c(8), ids, _finale_def, _finale_owns, func(id): return icons[id], _finale_cur(), pick)
	var shown := _shown
	return _show_info(bottom, w, _finale_def(shown), _finale_owns(shown), _finale_play.bind(shown), func():
		var ok: bool = CharacterFinales.buy_finisher(shown) if finale_cat == "finisher" else CharacterFinales.buy_pose(shown)
		if not ok: return
		Sfx.sfx.play("revealMythic")
		pick.call(shown))


func _left_points() -> int:
	return int(CharacterProgress.points_at(CharacterProgress.hero_level()) - SimTraining.spent_points(c.get("train")))


static func _trim(v: float) -> String:
	var s := String.num(roundf(v * 10.0) / 10.0, 1)
	return s.trim_suffix(".0")


## What a stat's trained points added, e.g. "60" or "2.4%".
static func _fmt_gain(stat: String, v: float) -> String:
	if stat == "attackSpeed" or stat == "critChance": return _trim(v * 100.0) + "%"
	return str(roundi(v)) if stat == "maxHp" else _trim(v)


static func _fmt_train(id: String, v: float) -> String:
	match id:
		"health": return str(roundi(v))
		"speed", "crit": return _trim(v * 100.0) + "%"
	return _trim(v)


## "+20 per point", scaled down once a stat tapers.
static func _per_point(id: String, worth: float) -> String:
	var a: Dictionary = SimTraining.TRAIN[id]["add"]
	var tag := " (%d%%)" % roundi(worth * 100.0) if worth < 1.0 else ""
	match id:
		"health": return "+%d per point%s" % [roundi(a["maxHp"] * worth), tag]
		"speed": return "+%s%% per point%s" % [_trim(a["attackSpeed"] * 100.0 * worth), tag]
		"crit": return "+%s%% per point%s" % [_trim(a["critChance"] * 100.0 * worth), tag]
	return "+%s per point%s" % [_trim(float(a[TRAIN_VIEW[id][0]]) * worth), tag]


## Level, XP and the stat points: + and - per stat; Reset gives every point back.
func _stats_step(w: float, y: float) -> float:
	var p := float(UI.px)
	var lv: Dictionary = CharacterProgress.level_of(CharacterProgress.progress()["xp"])
	var earned := int(CharacterProgress.points_at(CharacterProgress.hero_level()))
	var left := _left_points()
	var base: Dictionary = SimForms.FORMS[c["form"]]["base"].duplicate()
	SimTraining.apply_training(base, c.get("train"))
	var plain: Dictionary = SimForms.FORMS[c["form"]]["base"]
	# The head: level badge, XP bar, points left.
	var hh := UI.r(3.2) + UI.r(0.5) * 2 + p * 2
	var hr := Rect2(0, y, w, hh)
	var into := float(lv["into"])
	var need := float(lv["need"])
	_piece(hr, func(ci: CanvasItem, r: Rect2):
		ci.draw_rect(r, UI.INK)
		var inner := r.grow(-p)
		ci.draw_rect(inner, Color("#140f22"))
		_ring(ci, inner, UI.LINE, p)
		var bs := UI.r(3.2)
		var b := Rect2(inner.position.x + UI.r(0.6), roundf(inner.get_center().y - bs / 2.0), bs, bs)
		var hex := func(rr: Rect2) -> PackedVector2Array:
			return PackedVector2Array([Vector2(rr.get_center().x, rr.position.y), Vector2(rr.end.x, rr.position.y + rr.size.y * 0.25), Vector2(rr.end.x, rr.position.y + rr.size.y * 0.75), Vector2(rr.get_center().x, rr.end.y), Vector2(rr.position.x, rr.position.y + rr.size.y * 0.75), Vector2(rr.position.x, rr.position.y + rr.size.y * 0.25)])
		ci.draw_colored_polygon(hex.call(b), UI.INK)
		var bi := b.grow(-p)
		var poly: PackedVector2Array = hex.call(bi)
		ci.draw_polygon(poly, PackedColorArray([UI.GOLD_HI, UI.GOLD, UI.GOLD_LO, UI.GOLD_LO, UI.GOLD, UI.GOLD_HI]))
		var sf := UI.font("700")
		var sfs := roundi(UI.r(0.5625))
		ci.draw_string(sf, Vector2(roundf(b.get_center().x - UI.text_w(sf, "LV", sfs) / 2.0), b.position.y + UI.r(0.55) + roundf(sf.get_ascent(sfs))), "LV", HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.GOLD_INK)
		var nf := UI.font("p700")
		var nfs := roundi(UI.r(1.35))
		var ls := str(int(lv["level"]))
		ci.draw_string(nf, Vector2(roundf(b.get_center().x - UI.text_w(nf, ls, nfs) / 2.0), b.end.y - UI.r(0.5)), ls, HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, UI.GOLD_INK)
		# Points left.
		var lw := UI.r(4.8)
		var lr := Rect2(inner.end.x - UI.r(0.6) - lw, inner.position.y + UI.r(0.35), lw, inner.size.y - UI.r(0.7))
		var has := left > 0
		ci.draw_rect(lr, UI.INK)
		var li := lr.grow(-p)
		ci.draw_rect(li, Color("#3a2a10") if has else Color("#120d20"))
		if has and _beat == 0: _ring(ci, li, UI.GOLD_LO, p)
		var lc := UI.GOLD_HI if has else UI.DIM
		var pfs := roundi(UI.r(1.5))
		var ps := str(maxi(0, left))
		var tf := UI.spaced("700", roundi(UI.r(0.625)), 0.1)
		var tfs := roundi(UI.r(0.625))
		var word := "POINT" if left == 1 else "POINTS"
		var th := pfs + UI.c(4) + tfs
		var ty := roundf(li.get_center().y - th / 2.0)
		ci.draw_string(nf, Vector2(roundf(li.get_center().x - UI.text_w(nf, ps, pfs) / 2.0), ty + roundf(nf.get_ascent(pfs))), ps, HORIZONTAL_ALIGNMENT_LEFT, -1, pfs, lc)
		ci.draw_string(tf, Vector2(roundf(li.get_center().x - UI.text_w(tf, word, tfs) / 2.0), ty + pfs + UI.c(4) + roundf(tf.get_ascent(tfs))), word, HORIZONTAL_ALIGNMENT_LEFT, -1, tfs, lc)
		# The XP bar and its line.
		var xx := b.end.x + UI.c(12)
		var xw := lr.position.x - UI.c(12) - xx
		var xfs := roundi(UI.r(0.75))
		var xf := UI.font("500")
		var bar_h := roundf(UI.r(0.7))
		var xy := roundf(inner.get_center().y - (bar_h + UI.c(5) + xfs) / 2.0)
		var bar := Rect2(xx, xy, xw, bar_h)
		ci.draw_rect(bar, UI.INK)
		var fill := bar.grow(-p)
		fill.size.x = roundf(fill.size.x * clampf(into / maxf(1.0, need), 0.0, 1.0))
		if fill.size.x > 0:
			UI.vgrad(ci.get_canvas_item(), fill, [[0.0, Color("#4fb8f5")], [1.0, Color("#4fb8f5")]])
			ci.draw_rect(Rect2(fill.position, Vector2(fill.size.x, p)), Color("#b8f0ff"))
			ci.draw_rect(Rect2(fill.position.x, fill.end.y - p, fill.size.x, p), Color("#2a6ab0"))
		var line := "%d / %d XP to level %d · +%d points per level" % [int(into), int(need), int(lv["level"]) + 1, int(CharacterProgress.POINTS_PER_LEVEL)]
		ci.draw_string(xf, Vector2(xx, bar.end.y + UI.c(5) + roundf(xf.get_ascent(xfs))), line, HORIZONTAL_ALIGNMENT_LEFT, xw, xfs, UI.MUTED))
	var cy := y + hh + UI.c(10)
	# The stat rows, two to a line.
	var gap := UI.c(6)
	var rw := floorf((w - gap) / 2.0)
	var bs := UI.r(2.1)
	var rh := bs + UI.r(0.4) * 2 + p * 2
	var ids: Array = SimTraining.TRAIN_IDS
	for i in ids.size():
		var id: String = ids[i]
		var n := int(c.get("train", {}).get(id, 0)) if c.get("train") is Dictionary else 0
		var stat: String = TRAIN_VIEW[id][0]
		var gain := float(base[stat]) - float(plain[stat])
		var r := Rect2((i % 2) * (rw + gap), cy + floori(i / 2) * (rh + gap), rw, rh)
		var plus := PxButton.new("+", "", "primary" if left > 0 else "", "sm")
		var minus := PxButton.new("−", "", "", "sm")
		for b in [plus, minus]:
			b.font_rem = 1.2
			b.min_w = 2.1
			b.min_h = 2.1
			b._fit()
			b.size = b.custom_minimum_size
		plus.disabled = left <= 0
		minus.disabled = n <= 0
		plus.pressed.connect(_train.bind(id, 1))
		minus.pressed.connect(_train.bind(id, -1))
		var by := r.position.y + roundf((rh - bs) / 2.0)
		var nw := UI.r(2.4)
		_ctrl(plus, Vector2(r.end.x - p - UI.r(0.5) - bs, by))
		_ctrl(minus, Vector2(r.end.x - p - UI.r(0.5) - bs * 2 - nw, by))
		var val := _fmt_train(id, float(base[stat]))
		var per := _per_point(id, SimTraining.next_point_worth(n))
		var name_: String = SimTraining.TRAIN[id]["name"]
		_piece(r, func(ci: CanvasItem, rr: Rect2):
			ci.draw_rect(rr, UI.INK)
			var inner := rr.grow(-p)
			ci.draw_rect(inner, Color("#1a1329"))
			_ring(ci, inner, UI.GOLD_LO if n > 0 else UI.LINE, p)
			var nf := UI.font("700")
			var nfs := roundi(UI.r(0.9375))
			var sfs := roundi(UI.r(0.6875))
			var sf := UI.font("500")
			var vf := UI.font("p700")
			var vfs := roundi(UI.r(1.0))
			var x0 := inner.position.x + UI.r(0.5)
			var btn_x := rr.end.x - p - UI.r(0.5) - bs * 2 - nw
			var vw := UI.text_w(vf, val, vfs)
			var vx := btn_x - UI.c(8) - vw
			var ty := roundf(inner.get_center().y - (nfs + UI.c(3) + sfs) / 2.0)
			UI.draw_text(ci, nf, Vector2(x0, ty + roundf(nf.get_ascent(nfs))), name_, nfs, UI.GOLD_HI)
			var pt := per
			var maxw := vx - UI.c(6) - x0
			while UI.text_w(sf, pt, sfs) > maxw and pt.length() > 4: pt = pt.substr(0, pt.length() - 2) + "…"
			ci.draw_string(sf, Vector2(x0, ty + nfs + UI.c(3) + roundf(sf.get_ascent(sfs))), pt, HORIZONTAL_ALIGNMENT_LEFT, -1, sfs, UI.MUTED)
			var vb := roundf(inner.get_center().y + (vf.get_ascent(vfs) - vf.get_descent(vfs)) / 2.0)
			if gain > 0.0:
				var gf := UI.font("700")
				var gfs := roundi(UI.r(0.75))
				var gt := "+" + _fmt_gain(stat, gain)
				var gw := UI.text_w(gf, gt, gfs)
				vx -= gw + UI.c(6)
				ci.draw_string(gf, Vector2(vx + vw + UI.c(6), vb), gt, HORIZONTAL_ALIGNMENT_LEFT, -1, gfs, UI.GREEN)
			UI.draw_text(ci, vf, Vector2(vx, vb), val, vfs, UI.TEXT)
			var cnt := str(n)
			var cf := UI.font("p700")
			var cfs := roundi(UI.r(1.1))
			ci.draw_string(cf, Vector2(roundf(btn_x + bs + nw / 2.0 - UI.text_w(cf, cnt, cfs) / 2.0), roundf(inner.get_center().y + (cf.get_ascent(cfs) - cf.get_descent(cfs)) / 2.0)), cnt, HORIZONTAL_ALIGNMENT_LEFT, -1, cfs, UI.TEXT))
	cy += ceili(ids.size() / 2.0) * (rh + gap) - gap
	if earned == 0:
		var hint := "Win fights to earn XP. The Arena Cup pays the most."
		var hfs := roundi(UI.r(0.8125))
		var hf := UI.font("500")
		var hy := cy + UI.c(10)
		_piece(Rect2(0, hy, w, hfs * 1.3), func(ci: CanvasItem, r: Rect2):
			ci.draw_string(hf, Vector2(r.position.x, r.position.y + roundf(hf.get_ascent(hfs))), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, hfs, UI.MUTED))
		cy = hy + hfs * 1.3
	return cy


func _train(id: String, d: int) -> void:
	var t: Dictionary = c.get("train").duplicate() if c.get("train") is Dictionary else {}
	var now := int(t.get(id, 0))
	if d > 0 and _left_points() <= 0:
		Sfx.sfx.play("back")
		return
	if d < 0 and now <= 0: return
	Sfx.sfx.play("equip" if d > 0 else "select")
	t[id] = now + d
	if t[id] == 0: t.erase(id)
	if t.is_empty(): c.erase("train")
	else: c["train"] = t
	if d > 0:
		_burst(0x62d47a)
		say(UiHeroLines.pick_line(UiHeroLines.STAT_LINES), true)
	_refresh()


# --- The reveal of a brand new hero -----------------------------------------------------------

class Reveal extends Control:
	var cr: Creator
	var t := 0.0
	var preview: FighterPreview
	var go: PxButton
	var ribbon: Ribbon
	var card := Rect2()
	var text_x := 0.0
	var played := false

	func _init(creator: Creator) -> void:
		cr = creator
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_STOP
		preview = FighterPreview.new(cr.c, 80, 90, {"autoplay": true, "pedestal": true})
		add_child(preview)
		ribbon = Ribbon.new("A new legend rises", 1.0)
		add_child(ribbon)
		go = PxButton.new("Enter the arena", "swords", "primary", "big")
		go.font_rem = 1.1
		go.min_w = 15.0
		go.min_h = 3.0
		go.glint = true
		go.pressed.connect(cr._done)
		add_child(go)
		resized.connect(_layout)

	func _ready() -> void:
		_layout()

	func _layout() -> void:
		if size.x < 2: return
		var W := size.x
		var H := size.y
		var sl := roundf(W * 0.03)
		var gap := UI.r(1.0)
		var inner_w := W - sl * 2 - gap
		var c0 := inner_w * 0.9 / 2.0
		var cw := minf(c0, UI.r(19))
		var ch := roundf(H * 0.86)
		card = Rect2(sl + c0 - cw, roundf((H - ch) / 2.0), cw, ch)
		var fw := UI.frame_w("gold")
		preview.position = card.position + Vector2(fw, fw)
		preview.size = Vector2(card.size.x - fw * 2, (card.size.y - fw * 2) * 0.96)
		text_x = sl + c0 + gap
		ribbon.size = ribbon.get_combined_minimum_size()
		go.refit()
		go.size = go.custom_minimum_size

	func _process(dt: float) -> void:
		t += dt
		if not played and t > 0.65:
			played = true
			preview.play_entrance(CharacterEntrances.entrance_of(cr.c["look"], true))
		if t > 0.9 and t - dt <= 0.9: Sfx.sfx.play("entCheer")
		_place_text()
		queue_redraw()

	## Text column: ribbon, name, tags, battle cry, button, sliding in one after another.
	func _text_h() -> Array:
		var nfs := roundi(UI.r(2.4))
		var cfs := roundi(UI.r(0.875))
		var tfs := roundi(UI.r(0.8125))
		var gap := UI.r(0.7)
		var hs := [ribbon.size.y, nfs + UI.px * 3 + UI.px * 4, cr._tag_h(tfs), roundf(cfs * 1.3), go.size.y + UI.r(0.4)]
		var tot := 0.0
		for h in hs: tot += h
		tot += gap * (hs.size() - 1)
		return [hs, tot, gap]

	static func _slide(t: float, delay: float, dur: float) -> float:
		return clampf((t - delay) / dur, 0.0, 1.0)

	func _place_text() -> void:
		var th := _text_h()
		var hs: Array = th[0]
		var y := roundf((size.y - float(th[1])) / 2.0)
		var gap: float = th[2]
		var e := 1.0 - pow(1.0 - _slide(t, 0.3, 0.4), 2)
		ribbon.position = Vector2(text_x + UI.px * 7 - UI.r(1.5) * (1.0 - e), y)
		ribbon.modulate.a = e
		var by := y
		for i in 4: by += hs[i] + gap
		var eg := 1.0 - pow(1.0 - _slide(t, 1.25, 0.36), 2)
		go.position = Vector2(text_x - UI.r(1.5) * (1.0 - eg), by + UI.r(0.4))
		go.modulate.a = eg

	func _draw() -> void:
		var ci := get_canvas_item()
		var W := size.x
		var H := size.y
		draw_rect(Rect2(Vector2.ZERO, size), Color("#08050f"))
		UI.glow(ci, Vector2(W * 0.35, H * 0.55), Vector2(W * 0.6, H * 0.7) * 0.75, Color(120 / 255.0, 80 / 255.0, 200 / 255.0, 0.5))
		# Rays turning slowly behind everything.
		var ctr := Vector2(W * 0.3, H * 0.5)
		var R := maxf(W, H) * 1.6
		var rot := t / 30.0 * TAU
		for i in 18:
			var a0 := rot + deg_to_rad(i * 20.0)
			var a1 := a0 + deg_to_rad(7.0)
			draw_colored_polygon(PackedVector2Array([ctr, ctr + Vector2.from_angle(a0) * R, ctr + Vector2.from_angle(a1) * R]), Color(1, 214 / 255.0, 120 / 255.0, 0.08))
		# The card pops in.
		var k := _slide(t, 0.0, 0.52)
		var e := 1.0 + 2.4 * pow(k - 1.0, 3) + 1.4 * pow(k - 1.0, 2)
		var sc := lerpf(0.85, 1.0, e)
		var dy := UI.r(2.0) * (1.0 - e)
		var cc := card.get_center()
		var xf := Transform2D(Vector2(sc, 0), Vector2(0, sc), cc - cc * sc + Vector2(0, dy))
		preview.scale = Vector2(sc, sc)
		preview.position = xf * (card.position + Vector2(UI.frame_w("gold"), UI.frame_w("gold")))
		preview.modulate.a = k
		draw_set_transform_matrix(xf)
		var a := clampf(k * 2.0, 0.0, 1.0)
		var inn := card.grow(-UI.frame_w("gold"))
		UI.draw_backdrop(self, cr.c["look"].get("backdrop", 0), inn, Color(1, 1, 1, a))
		UI.vgrad(ci, inn, [[0.0, Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.15 * a)], [0.4, Color(0, 0, 0, 0)], [1.0, Color(10 / 255.0, 6 / 255.0, 18 / 255.0, 0.55 * a)]])
		UI.draw_frame(ci, card, "gold")
		draw_set_transform_matrix(Transform2D.IDENTITY)
		# Name (slams in), tags, battle cry.
		var th := _text_h()
		var hs: Array = th[0]
		var gap: float = th[2]
		var y: float = roundf((H - float(th[1])) / 2.0) + hs[0] + gap
		var nfs := roundi(UI.r(2.4))
		var nf := UI.spaced("p700", nfs, 0.03)
		var name_: String = cr.c["name"]
		var ks := _slide(t, 0.65, 0.42)
		if ks > 0.0:
			var es := 1.0 + 2.6 * pow(ks - 1.0, 3) + 1.6 * pow(ks - 1.0, 2)
			var s := lerpf(2.2, 1.0, es)
			var nw := UI.text_w(nf, name_, nfs)
			var base: float = y + roundf(nf.get_ascent(nfs))
			var pivot := Vector2(text_x + UI.px * 2 + nw / 2.0, y + nfs / 2.0)
			draw_set_transform(pivot - pivot * s, 0.0, Vector2(s, s))
			var p := float(UI.px)
			draw_string(nf, Vector2(text_x + p * 2, base + p * 4), name_, HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, Color(UI.GOLD_LO, ks))
			for d in [Vector2(p, 0), Vector2(-p, 0), Vector2(0, p), Vector2(0, -p), Vector2(p, p), Vector2(-p, p), Vector2(p, -p), Vector2(-p, -p)]:
				draw_string(nf, Vector2(text_x + p * 2, base) + d, name_, HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, Color(UI.INK, ks))
			draw_string(nf, Vector2(text_x + p * 2, base), name_, HORIZONTAL_ALIGNMENT_LEFT, -1, nfs, Color(UI.GOLD_HI, ks))
			draw_set_transform(Vector2.ZERO)
		y += hs[1] + gap
		var kt := 1.0 - pow(1.0 - _slide(t, 0.9, 0.36), 2)
		if kt > 0.0:
			var tfs := roundi(UI.r(0.8125))
			var x := text_x - UI.r(1.5) * (1.0 - kt)
			modulate_children(kt)
			for tg in cr._hero_tags():
				x += cr._tag(self, Vector2(x, y), Color(tg[0], kt), tg[1], tg[2], tfs) + UI.px * 2
		y += hs[2] + gap
		var kc := 1.0 - pow(1.0 - _slide(t, 1.05, 0.36), 2)
		if kc > 0.0:
			var cfs := roundi(UI.r(0.875))
			var cry := "“%s”" % UiHeroLines.STYLE_LINE[cr._style()]
			UI.draw_text(self, Creator._italic(), Vector2(text_x - UI.r(1.5) * (1.0 - kc), y + roundf(cfs * 1.05)), cry, cfs, Color(UI.TEXT, kc), "drop", Color(UI.INK, kc))

	func modulate_children(_k: float) -> void:
		pass
