/**
 * Naming rules for the generated GDScript: snake_case for functions,
 * variables and class members, PascalCase module classes, and a suffix for
 * anything that would collide with a GDScript keyword or built-in.
 */

const RESERVED = new Set(`
and as assert await break breakpoint class class_name const continue elif else enum extends for func if in is match
namespace not or pass preload return self signal static super trait var void when while yield PI TAU INF NAN true false null
abs absf absi acos acosh angle_difference asin asinh atan atan2 atanh bezier_derivative bezier_interpolate bytes_to_var
bytes_to_var_with_objects ceil ceilf ceili clamp clampf clampi cos cosh cubic_interpolate cubic_interpolate_angle
db_to_linear deg_to_rad ease error_string exp floor floorf floori fmod fposmod hash instance_from_id inverse_lerp
is_equal_approx is_finite is_inf is_instance_id_valid is_instance_valid is_nan is_same is_zero_approx lerp lerp_angle
lerpf linear_to_db log max maxf maxi min minf mini move_toward nearest_po2 pingpong posmod pow print print_rich
print_verbose printerr printraw prints printt push_error push_warning rad_to_deg rand_from_seed randf randf_range randfn
randi randi_range randomize remap rid_allocate_id rid_from_int64 rotate_toward round roundf roundi seed sign signf signi
sin sinh smoothstep snapped snappedf snappedi sqrt step_decimals str str_to_var tan tanh type_convert type_string typeof
var_to_bytes var_to_bytes_with_objects var_to_str weakref wrap wrapf wrapi char convert dict_to_inst get_stack
inst_to_dict is_instance_of len load print_debug print_stack range type_exists
get set call callv free connect disconnect emit_signal get_class is_class notification to_string get_script set_script
has_method get_meta set_meta queue_free new duplicate init _init script get_property_list get_method_list get_instance_id
is_connected has_signal call_deferred set_deferred get_indexed set_indexed reference unreference
Color Vector2 Vector2i Vector3 Rect2 Transform2D Image Node Time Engine Input OS Resource Array Dictionary String
StringName Callable Object RefCounted Signal Basis Plane Quaternion AABB Projection NodePath RID Font Texture2D
Thread Mutex Semaphore JSON ClassDB Performance IP Marshalls Geometry2D Geometry3D ResourceLoader ResourceSaver
TS TX Store
`.split(/\s+/).filter(Boolean));

/** camelCase → snake_case; CONSTANT_CASE and single capitals stay as they are. */
export function snake(name: string): string {
  if (/^[A-Z0-9_]+$/.test(name)) return name;
  if (/^[A-Z]/.test(name) && !/[a-z]/.test(name.slice(1))) return name;
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    const prev = name[i - 1];
    const next = name[i + 1];
    if (/[A-Z]/.test(c)) {
      // Break before a capital that starts a word: fooBar, fooHTTPServer → foo_http_server.
      if (i > 0 && prev !== '_' && (/[a-z0-9]/.test(prev) || (next && /[a-z]/.test(next) && /[A-Z]/.test(prev)))) out += '_';
      out += c.toLowerCase();
    } else out += c;
  }
  return out;
}

/** A safe GDScript identifier for a TS local, parameter, function or member. */
export function ident(name: string, keepCase = false): string {
  let n = keepCase ? name : snake(name);
  if (n.startsWith('$')) n = 'S' + n.slice(1);
  if (RESERVED.has(n)) n += '_';
  return n;
}

export function pascal(parts: string[]): string {
  return parts.map((p) => p.replace(/(^|[-_])([a-z0-9])/g, (_m, _s, c: string) => c.toUpperCase()).replace(/^[a-z]/, (c) => c.toUpperCase())).join('');
}
