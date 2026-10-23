## Only used outside the simulation, to pick a seed for a new match.
static func random_seed() -> float:
	return float(Crypto.new().generate_random_bytes(4).decode_u32(0))
