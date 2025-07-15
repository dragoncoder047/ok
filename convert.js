////////////////////////////////////
//
//   A companion to oK which bridges
//   the gap between k-values and
//   native JavaScript types.
//
//   John Earnest
//
////////////////////////////////////

import { k, emptydict, sym, format, tCHAR, tDICT, tFUNC, tLIST, tNIL, tNUMBER, tREF, tSYMBOL, tVERB } from "./oK.js";

export function tok(v) {
	if (v == null) { return k(tNIL, null); }
	if (typeof v == 'number') { return k(tNUMBER, v); }
	if (typeof v == 'string') {
		var r = [];
		for (var z = 0; z < v.length; z++) { r[z] = k(tCHAR, v.charCodeAt(z)); }
		return k(tLIST, r);
	}
	if (v instanceof Array) {
		var r = [];
		for (var z = 0; z < v.length; z++) { r[z] = tok(v[z]); }
		return k(tLIST, r);
	}
	if (typeof v == 'object') {
		var r = emptydict();
		var kv = Object.keys(v);
		for (var z = 0; z < kv.length; z++) {
			r.k.v.push(sym(kv[z]));
			r.v.v.push(tok(v[kv[z]]));
		}
		return r;
	}
	throw new Error(`cannot convert '${v}' to a K datatype.`);
}

export function tojs(v) {
	if (v.t == tNUMBER || v.t == tNIL)	{ return (v.v || v.v == 0) ? v.v : null; }
	if (v.t == tSYMBOL) 				{ return v.v; }
	if (v.t == tCHAR) 				    { return String.fromCharCode(v.v); }
	if (v.t == tLIST) {
		var r = [];
		var same = true;
		for (var z = 0; z < v.v.length; z++) { r[z] = tojs(v.v[z]); same &= v.v[z].t == v.v[0].t; }
		if (same && v.v.length != 0 && v.v[0].t == tCHAR) { return r.join(""); }
		return r;
	}
	if (v.t == tDICT) {
		var r = {};
		for (var z = 0; z < v.k.v.length; z++) { r[tojs(v.k.v[z])] = tojs(v.v.v[z]); }
		return r;
	}
    var bad;
    try { bad = JSON.stringify(v); } catch(e) { bad = format(v); }
	throw new Error(`cannot convert '${bad}' to a JavaScript datatype.`);
}

export function trampoline(env, name, args) {
	// construct a function-wrapper trampoline for a pseudonative.
	// this permits dyadic/triadic extension functions to be properly curryable.
	var arguse = [];
    for (var z = 0; z < args.length; z++) { arguse.push(k(tREF, args[z])); }
	env.put(sym(name), true, { t: tFUNC, args, v: [{ t: tVERB, v: name, curry: arguse }]});
}
