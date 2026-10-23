class_name BattleFeed
## Runs a battle's simulation on its own thread, ahead of the picture.
##
## The AI imagines the next second of the fight before most decisions, which
## costs far more than drawing a frame. The worker steps the real battle and
## queues a snapshot of every tick (with that tick's events); the view's
## battle is a `Live` battle whose step() takes the next snapshot. Snapshots
## are made like the AI's look-ahead forks, so nothing the worker changes
## afterwards can reach one.

## Ticks the worker may run ahead of the screen (2 s at 60 Hz).
const AHEAD := 120
## Battle seconds simulated past the end (the KO falls, the finisher plays).
const AFTER := 12.0

var battle
var live: Live
var _queue: Array = []
var _mutex := Mutex.new()
var _space := Semaphore.new()
var _thread := Thread.new()
var _quit := false
## Ticks waited for (the worker fell behind): a stall shows as a held frame.
var stalls := 0


func _init(b) -> void:
	battle = b
	live = Live.new(TS.BLANK)
	live.feed = self
	_copy_into(live, _snapshot(b))
	live.events = []
	for i in AHEAD: _space.post()


func start() -> void:
	if not _thread.is_started(): _thread.start(_run, Thread.PRIORITY_NORMAL)


func stop() -> void:
	_quit = true
	_space.post()
	if _thread.is_started(): _thread.wait_to_finish()


func ahead() -> int:
	_mutex.lock()
	var n := _queue.size()
	_mutex.unlock()
	return n


func _run() -> void:
	var b = battle
	while not _quit:
		_space.wait()
		if _quit: break
		if b.over and b.end_time > AFTER:
			_space.post()
			OS.delay_msec(20)
			continue
		b.step()
		var snap = _snapshot(b)
		snap.events = b.drain_events()
		_mutex.lock()
		_queue.append(snap)
		_mutex.unlock()


## The next tick, or null when the worker hasn't made it yet.
func pop():
	_mutex.lock()
	var s = null if _queue.is_empty() else _queue.pop_front()
	_mutex.unlock()
	if s != null: _space.post()
	return s


## A copy of the battle as the view sees it: fighters and everything in play, one level deep.
static func _snapshot(b) -> SimBattle.Battle:
	var c := SimBattle.Battle.new(TS.BLANK)
	for k in TS.keys(b):
		c.set(k, SimBattle.clone_value(b.get(k)))
	c.fighters = [SimBattle.clone_fighter(b.fighters[0]), SimBattle.clone_fighter(b.fighters[1])]
	c.sandbox = true
	# The brains stay with the worker; the HUD only needs their plans.
	c.brains = []
	c.set_meta("plans", [AiBrain.PLAN_LABELS.get(b.brains[0].plan, ""), AiBrain.PLAN_LABELS.get(b.brains[1].plan, "")] if b.brains.size() == 2 else ["", ""])
	return c


static func _copy_into(dst, src) -> void:
	for k in TS.keys(src):
		if k == "feed" or k == "plans": continue
		dst.set(k, src.get(k))


## The battle the view draws: each step() moves it to the worker's next tick.
class Live extends SimBattle.Battle:
	var feed
	var plans := ["", ""]

	func step() -> void:
		var s = feed.pop()
		if s == null:
			feed.stalls += 1
			return
		var ev = self.events
		BattleFeed._copy_into(self, s)
		plans = s.get_meta("plans")
		ev.append_array(s.events)
		self.events = ev

	func drain_events() -> Variant:
		var out = self.events
		self.events = []
		return out
