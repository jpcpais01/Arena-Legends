extends Control
## First screen: the game (title over the background duel, then the menus).

func _ready() -> void:
	add_child(Game.new())
