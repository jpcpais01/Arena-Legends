extends Control

func _ready() -> void:
	var label := Label.new()
	label.text = "Arena Legends " + str(ProjectSettings.get_setting("application/config/version"))
	label.set_anchors_preset(Control.PRESET_CENTER)
	add_child(label)
