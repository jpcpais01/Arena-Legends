##  Days since 1970 in local time: the shop's rotation index.
static func shop_day(_now = null) -> float:
	var bias := float(Time.get_time_zone_from_system().get("bias", 0)) * 60.0
	return floor((Time.get_unix_time_from_system() + bias) / 86400.0)

##  Milliseconds until the next rotation (local midnight).
static func ms_to_rotation(_now = null) -> float:
	var bias := float(Time.get_time_zone_from_system().get("bias", 0)) * 60.0
	var local := Time.get_unix_time_from_system() + bias
	return (floor(local / 86400.0) + 1.0) * 86400000.0 - local * 1000.0
