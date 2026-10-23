class_name Store
## Persistent key → string store (the web game's localStorage). Lives in
## user://store.json; writes are batched to the end of the frame.

const PATH := "user://store.json"

static var _data = null
static var _dirty := false


static func _load() -> void:
	if _data != null: return
	_data = {}
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null: return
	var v = JSON.parse_string(f.get_as_text())
	if v is Dictionary: _data = v


static func get_item(key: String):
	_load()
	return _data.get(key)


static func set_item(key: String, value) -> void:
	_load()
	_data[key] = str(value)
	_queue_save()


static func remove_item(key: String) -> void:
	_load()
	if _data.erase(key): _queue_save()


static func keys() -> Array:
	_load()
	return _data.keys()


static func _queue_save() -> void:
	if _dirty: return
	_dirty = true
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		save()
		return
	tree.process_frame.connect(save, CONNECT_ONE_SHOT)


static func save() -> void:
	_dirty = false
	if _data == null: return
	var tmp := PATH + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null: return
	f.store_string(JSON.stringify(_data))
	f.close()
	DirAccess.rename_absolute(tmp, PATH)
