extends Control
## First screen: straight into a battle for now (menus come in a later phase).

func _ready() -> void:
	var scene := BattleScene.new()
	add_child(scene)
