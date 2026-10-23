class_name AccountLib
## Accounts (the web's account/account.ts) come in a later phase: until then the
## game plays as a local save, signed out.

static func account_status() -> Dictionary:
	return {"signedIn": false, "name": null}
