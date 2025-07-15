////////////////////////////////////
//
//   A small(ish) implementation
//   of the K programming language.
//
//   John Earnest
//
////////////////////////////////////

"use strict";

const TYPENAMES = [
	"number"    , //  0 : value
	"char"      , //  1 : value
	"symbol"    , //  2 : value
	"list"      , //  3 : array -> k
	"dictionary", //  4 : values, k(keys)
	"function"  , //  5 : body, args, curry, env
	"view"      , //  6 : value, r, cache, depends->val
	"nameref"   , //  7 : name, l(index?), r(assignment), global?
	"verb"      , //  8 : name, l(?), r, curry?
	"adverb"    , //  9 : name, l(?), verb, r
	"return"    , // 10 : return (deprecated)
	"nil"       , // 11 :
	"cond"      , // 12 : body (list of expressions)
	"quote"     , // 13 : value (for quoting verbs/etc as a value)
];

export const tNUMBER = 0, tCHAR = 1, tSYMBOL = 2, tLIST = 3, tDICT = 4, tFUNC = 5, tVIEW = 6, tREF = 7, tVERB = 8, tADVERB = 9, tRETURN = 10, tNIL = 11, tCOND = 12, tQUOTE = 13;

const EMPTYSYM = sym("");
const K_ZERO = k(tNUMBER, 0);
const K_ONE = k(tNUMBER, 1);
const ESCAPE_PAIRS = [["\\", "\\\\"], ["\"", "\\\""], ["\n", "\\n"], ["\t", "\\t"]];
const TYPE_IDS = [-9, -10, -11, 0, 99, 102, NaN, NaN, 107, 105, NaN, NaN, NaN];
const K_SPACE = k(tCHAR, " ".charCodeAt(0));
const K_NAN = k(tNUMBER, NaN);
const NILVAL = k(tNIL);

export function k(t, v)  { return { t, v }; }
export function dict(x, y){ return { t: tDICT, k: sameLen(x, y), v: y }; }
export function emptydict(){ return dict(k(tLIST, []), k(tLIST, [])); }
export function sym(x)   { return k(tSYMBOL, x); }
function asVerb(x, y, z) { return { t: tVERB, v: x, l: y, r: z }; }
function wraplist(x)     { return x.length == 1 ? x[0] : k(tLIST, x); }
function falsy(x)        { return match(k(tLIST, []), x).v || match(K_ZERO, x).v; }
function toBool(x)       { return x ? K_ONE : K_ZERO; }
function isKString(x)    { return x.t == tLIST && x.v.every(c => c.t == tCHAR); }
function kMod(x, y)      { return x - y * Math.floor(x / y); }
function len(x)          { return ensureList(x).v.length; }
function kRange(x, f)    { var r = []; for (var z = 0; z < x; z++) r.push(f(z)); return k(tLIST, r); }
function hex2(x)         { return (x.v + 0x100).toString(16).substring(-2); }
function listGet(x, y)   { if (y < 0 || y >= len(x)) { throw new Error("index out of bounds."); } return x.v[y]; }
function dictGet(x, y)   { var i = findMatch(x.k, y); return (i.v == len(x.k)) ? K_NAN : subscr(x.v, i); }
function listSet(x, y, z){ if (len(x) <= ensurePosInt(y)) { throw new Error("index out of bounds."); } x.v[y.v] = z; }
function dictSet(x, y, z){ var i = findMatch(x.k, y).v; if (i == len(x.k)) { x.k.v.push(y); } x.v.v[i] = z; }
function lowerChar(x)    { return k(tCHAR, String.fromCharCode(x.v).toLowerCase().charCodeAt(0)); }
function kMap(x, f)      { return k(tLIST, ensureList(x).v.map(f)); }
function kZip(x, y, f)   { return kMap(sameLen(x, y), (z, i) => f(z, y.v[i])); }
function sameLen(x, y)   { if (len(x) != len(y)) { throw new Error("lists are not the same length."); } return x; }
function numeric(x)      { return (x.t == tNUMBER || x.t == tCHAR) ? x : ensureType(x, tNUMBER); }
function ensureList(x)   { return ensureType(x, tLIST); }
function ensureDict(x)   { return ensureType(x, tDICT); }
function ensureAtom(x)   { if (x.t > tSYMBOL) { throw new Error("domain error."); } return x; }
function isKNAN(x)       { return x.t == tNUMBER && isNaN(x.v); }

function jsStringToKString(x) { return wraplist(kRange(x.length, z => k(tCHAR, x.charCodeAt(z))).v); }
function clone(x)        { return (x.t == tLIST) ? k(x.t, x.v.slice()) : (x.t == tDICT) ? dict(clone(x.k), clone(x.v)) : x; }
function deepclone(x)    { return (x.t == tLIST) ? k(x.t, x.v.map(deepclone)) : (x.t == tDICT) ? dict(deepclone(x.k), deepclone(x.v)) : x; }
function ensureType(n, t){ if (n.t != t) throw new Error(`${TYPENAMES[t]} expected, found ${TYPENAMES[n.t]}.`); return n; }
function ensurePosInt(x) { if (numeric(x).v < 0 || x.v % 1 != 0) { throw new Error(`positive int expected, got ${x.v}.`); } return x.v; }
function kStringToJSString(x, esc) {
	if (x.t != tLIST) { x = enlist(x); }
	var notASCII = x.v.some(v => (v.v < 32 || v.v > 127) & v.v != 9 & v.v != 10);
	if (notASCII) { return "0x" + x.v.map(hex2).join(""); }
	var r = x.v.map(k => String.fromCharCode(k.v)).join("");
	return esc ? '"'+ESCAPE_PAIRS.reduce((r,p) => r.split(p[0]).join(p[1]), r)+'"' : r;
}

////////////////////////////////////
//
//   Primitive Verbs
//
////////////////////////////////////

function plus  (x, y) { return k(tNUMBER, numeric(x).v + numeric(y).v); }
function minus (x, y) { return k(tNUMBER, numeric(x).v - numeric(y).v); }
function times (x, y) { return k(tNUMBER, numeric(x).v * numeric(y).v); }
function divide(x, y) { return k(tNUMBER, numeric(x).v / numeric(y).v); }
function mod   (x, y) { return k(tNUMBER, numeric(x).v > 0 ? kMod(numeric(y).v, x.v) : Math.floor(numeric(y).v / -x.v)); }
function max   (x, y) { return isKNAN(x) ? y : isKNAN(y) ? x : k(tNUMBER, Math.max(numeric(x).v, numeric(y).v)); }
function min   (x, y) { return k(tNUMBER, Math.min(numeric(x).v, numeric(y).v)); }
function less  (x, y) { return toBool(x.t == tLIST && y.t == tLIST ? comparelists(x, y, true) : ensureAtom(x).v < ensureAtom(y).v); }
function more  (x, y) { return toBool(x.t == tLIST && y.t == tLIST ? comparelists(x, y, false) : ensureAtom(x).v > ensureAtom(y).v); }
function equal (x, y) { return toBool((x.v == y.v) || (isKNAN(x) && isKNAN(y))); }
function join  (x, y) { return ensureList(y).v.reduce((z, y) => concat(z, concat(x, y))); }
function ident    (x) { return x; }
function rident(x, y) { return y; }
function negate   (x) { return k(tNUMBER, -numeric(x).v); }
function first    (x) { return (x.t == tDICT) ? first(x.v) : (x.t != tLIST) ? x : len(x) ? x.v[0] : k(tLIST, []); }
function sqrt     (x) { return k(tNUMBER, Math.sqrt(numeric(x).v)); }
function keys     (x) { return clone(ensureDict(x).k); }
function reverse  (x) { return x.t == tDICT ? dict(reverse(x.k), reverse(x.v)) : x.t == tLIST ? k(tLIST, x.v.toReversed()) : x; }
function asc      (x) { return grade(-1, x); }
function desc     (x) { return grade(1, x); }
function not      (x) { return equal(numeric(x), K_ZERO); }
function enlist   (x) { return k(tLIST, [x]); }
function isNull   (x) { return max(match(x, EMPTYSYM), match(x, NILVAL)); }
function count    (x) { return k(tNUMBER, x.t == tDICT ? len(x.v) : x.t == tLIST ? len(x) : 1); }
function floor    (x) { return x.t == tCHAR ? lowerChar(x) : k(tNUMBER, Math.floor(numeric(x).v)); }
function type     (x) { return k(tNUMBER, TYPE_IDS[x.t]); }
function kFmt     (x) { var r = jsStringToKString(format(x, 0, true)); return x.t == tLIST ? x : r.t == tLIST ? r : enlist(r); }
function randomV  (x) { return kRange(numeric(x).v, () => k(tNUMBER, Math.random())); }

function iota(x) {
	if (x.t == tDICT) { return keys(x); }
	var i = kRange(Math.abs(numeric(x).v), k.bind(null, 0)); return x.v >= 0 ? i : ar(plus)(x, i);
}

function concat(x, y) {
	if (x.t == tDICT && y.t == tDICT) { x = clone(x); kMap(y.k, v => { dictSet(x, v, dictGet(y, v)); }); return x; };
	return k(tLIST, (x.t == tLIST ? x.v : [x]).concat(y.t == tLIST ? y.v : [y]));
}

function kEval(x, env) {
	if (x.t == tFUNC) { return x.env.d; }
	return x.t == tDICT ? clone(x.v) : x.t == tSYMBOL ? env.lookup(x, true) : run(parse(kStringToJSString(x)), env);
}

function dollar(x, y) {
	if (x.t == tSYMBOL && x.v == '' && y.t == tLIST)       { return isKString(y) ? k(tSYMBOL, kStringToJSString(y)) : kMap(y, z => dollar(x, z)); }
	if (x.t == tLIST   && y.t == tLIST)                    { return kZip(x, y, dollar); }
	if (x.t == tLIST   && y.t != tLIST)                    { return kMap(x, z => dollar(z, y)); }
	if ((x.t == tSYMBOL || !isKString(y)) && y.t == tLIST) { return kMap(y, z => dollar(x, z)); }
	if (x.t == tSYMBOL) { return { b: k(tNUMBER, y.v & 1), i: k(tNUMBER, y.v | 0), f: k(tNUMBER, y.v), c: k(tCHAR, y.v)}[x.v]; }
	if (y.t == tCHAR) { return y; }
    var r = clone(y), d = Math.abs(x.v);
	while (len(r) < d) { x.v > 0 ? r.v.push(K_SPACE) : r.v.unshift(K_SPACE); }
	while (len(r) > d) { x.v > 0 ? r.v.pop()         : r.v.shift();     }
	return r;
}

function fill(x, y) { return nullish(y).v ? x : y; }

function except(x, y) {
	y = y.t == tLIST ? y : enlist(y);
	return k(tLIST, x.v.filter(z => isKNAN(findEqual(y, z))));
}

function filter(x, y, k) { return y.t == tDICT ? dict(k, subscr(y,k)) : subscr(y,k) }
function dictdrop(x, y) { var k = except(ensureDict(y).k, x); return dict(k, subscr(y, k)); }
function drop(x, y, env) {
	if (x.t == tFUNC || x.t == tVERB || x.t == tADVERB) { return filter(x, y, where(am(not)(eachMonadic(x, y, env), env))) }
	if (y.t == tDICT) { return dict(drop(x, y.k, env), drop(x, y.v, env)); }
	return (y.t != tLIST || len(y) < 1) ? y : k(tLIST, numeric(x).v < 0 ? y.v.slice(0, x.v) : y.v.slice(x.v));
}

function take(x, y, env) {
	if (x.t == tFUNC || x.t == tVERB || x.t == tADVERB) { return filter(x, y, where(eachMonadic(x, y, env), env)) }
	if (y.t == tDICT) { return dict(take(x, y.k, env), take(x, y.v, env)); }
	if (y.t != tLIST || len(y) == 0) { y = enlist(y); }
	var s = numeric(x).v < 0 ? kMod(x.v, len(y)) : 0;
	return kRange(Math.abs(x.v), x => y.v[kMod(x + s, len(y))]);
}

function reshape(x, y) {
	if (y.t == tDICT) { return dict(x, subscr(y, x)); }
	if (y.t != tLIST) { y = enlist(y); }
	var a = first(x), b = x.v[len(x)-1], c = 0;
	function inner(x, y, i) {
		return kRange(x.v[i].v, () => {
			return i == len(x) - 1 ? y.v[kMod(c++, len(y))] : inner(x, y, i + 1);
		});
	}
	return isKNAN(a) ? (!len(y) ? y : cut(kRange(len(y) / b.v, z => k(tNUMBER, z * b.v)), y)) :
	       isKNAN(b) ? cut(kRange(a.v, z => k(tNUMBER, Math.floor(z * len(y) / a.v))), y) :
	       inner(ensureList(x), len(y) ? y : enlist(y), 0);
}

function match(x, y) {
	if (x.t != y.t) { return K_ZERO; }
	if (x.t == tDICT) { return min(match(x.k, y.k), match(x.v, y.v)); }
	if (x.t != tLIST) { return equal(x, y); }
	if (len(x) != len(y)) { return K_ZERO; }
	return toBool(x.v.every((x, i) => match(x, y.v[i]).v));
}

function findMatch(x, y) { y = x.v.findIndex(z => match(z,y).v); return k(tNUMBER, y >= 0 ? y : len(x)); }
function findEqual(x, y) { y = x.v.findIndex(z => equal(z,y).v); return y >= 0 ? k(tNUMBER, y) : K_NAN }
function nullish(x) { return toBool(match(x, EMPTYSYM).v || match(x, NILVAL).v || isKNAN(x)); }

function cut(x, y, env) {
	return kZip(x, concat(drop(K_ONE, x, env), count(y)), (a, b) => { // {x{x@y+!z-y}[y]'1_x,#y} ?
		var r = [];
        for (var z = ensurePosInt(a); z < ensurePosInt(b); z++)
            r.push(listGet(y,z));
        return k(tLIST, r);
	});
}

function rnd(x, y, env) {
	if (x.t == tDICT) { return subscr(x.k, ar(findEqual)(x.v, y), env); }
	if (y.t == tCHAR) { return dollar(k(tSYMBOL, "c"), rnd(x, ar(plus)(y, iota(k(tNUMBER, 26))))); }
	if (y.t == tLIST) { return subscr(y, rnd(x, count(y))); }
    ensurePosInt(y);
	if (numeric(x).v < 0) {
        if (-x.v > y.v) throw new Error("length error.");
        return take(x, asc(randomV(y)), env);
    }
	return kMap(iota(x), () => k(tNUMBER, Math.floor(Math.random() * y.v)));
}

function flip(x, env) {
	if (x.t != tLIST) return enlist(enlist(x));
	x = eachRight(k(tVERB, "#"), over(k(tVERB, "|"), eachMonadic(k(tVERB, "#"), x, env), env), x, env);
	return kRange(len(first(x)), z => kRange(len(x), t => x.v[t].v[z]));
}

function grade(dir, x) {
	return x.t == tDICT ? subscr(x.k, grade(dir, x.v)) : k(tLIST, iota(count(x)).v.sort((a, b) => {
		var f = i => { var v = x.v[i.v]; return isKString(v) ? sym(kStringToJSString(v)) : v; }
		var av = f(a), bv = f(b); return less(av, bv).v ? dir : more(av, bv).v ? -dir : a.v - b.v;
	}));
}

function where(x, env) {
	if (x.t == tDICT) { return subscr(x.k, where(x.v, env)); } // {,/(0|x)#'!#x}...
	var s = kMap(x.t == tLIST ? x : enlist(x), (v, i) => take(k(tNUMBER, ensurePosInt(v)), k(tNUMBER, i), env));
	return over(asVerb(","), s, env);
}

function group(x) {
	var r = { t: tDICT, k: unique(x) }; r.v = kMap(r.k, () => k(tLIST, []));
	for (var z = 0; z < len(x); z++) { dictGet(r, x.v[z]).v.push(k(tNUMBER, z)); }
    return r;
}

function unique(x) {
	var r = [];
    for (var z = 0; z < len(x); z++) {
		if (!r.some(e => match(x.v[z], e).v)) { r.push(x.v[z]); }
	}
    return k(tLIST,r);
}

function binsearch(x, y) {
	var a = 0; var b = len(x); if (b < 1 || less(y, first(x)).v) { return k(tNUMBER, -1); }
	while (b - a > 1) { var i = a + Math.floor((b - a) / 2); if (more(x.v[i], y).v) { b = i; } else { a = i; } }
	return k(tNUMBER, a);
}

function comparelists(x, y, a) {
	return match(x, y).v ? 0 : len(x) < len(y) ? a : len(x) > len(y) ? !a :
	       less(first(x), first(y)).v ? a: more(first(x), first(y)).v ? !a :
	       comparelists(drop(K_ONE, x),drop(K_ONE, y), a);
}

function split  (x, y) { return (x.t != tCHAR) ? unpack(x, y) : call(splitimpl, k(tLIST, [x, y])); }
function unpack (x, y) { return call(unpackimpl, k(tLIST, [x,y])); }
function pack   (x, y) { return (x.t == tCHAR) ? join(x, y) : call(packimpl, k(tLIST, [x, y])); }
function kwindow(x, y) { return call(winimpl, k(tLIST, [x, y])); }
function splice(xyz)   { return call(spliceimpl, k(tLIST, xyz)); }
function identitymat(x){ var i = iota(x); return kMap(i, z => ar(equal)(z, i)); }
function odometer(x)   { return call(odoimpl, enlist(x)); }


////////////////////////////////////
//
//   Primitive Adverbs
//
////////////////////////////////////

function eachMonadic(monad, x, env) {
	if (x.t == tDICT) { return dict(x.k, eachMonadic(monad, x.v, env)); }
	return kMap(x, x => applyMonad(monad, x, env));
}

function eachDyadic(dyad, left, right, env) {
	if (!env) { return kMap(left, x => applyDyad(dyad, x, null, right)); }
	if (left.t == tDICT && right.t == tDICT) { return dict(left.k, eachDyadic(dyad, left.v, subscr(right, left.k), env)); }
	if (left.t != tLIST) { return eachRight(dyad, left, right, env); }
	if (right.t != tLIST) { return eachLeft(dyad, left, right, env); }
	return kZip(left, right, (x, y) => applyDyad(dyad, x, y, env));
}

function eachRight(dyad, left, list, env) {
	return kMap(list, x => applyDyad(dyad, left, x, env));
}

function eachLeft(dyad, list, right, env) {
	return kMap(list, x => applyDyad(dyad, x, right, env));
}

function eachPrior(dyad, x, env) {
	var specials = { "+": K_ZERO, "*": K_ONE, "-": K_ZERO, "&": first(x), ",": k(tLIST,[]), "%": K_ONE };
	return eachPriorHelper(dyad, (dyad.v in specials) ? specials[dyad.v] : K_NAN, x, env);
}

function stencil(monad, x, y, env) {
	return eachMonadic(monad, call(winimpl, k(tLIST, [x,y]), env))
}

function eachPriorHelper(dyad, x, y, env) {
	return kMap(y, v => { var t = x; x = v; return applyDyad(dyad, v, t, env); });
}

function over(dyad, x, env) {
	var specials = { "+": K_ZERO, "*": K_ONE, "|": k(tNUMBER, -Infinity), "&": k(tNUMBER, Infinity) };
	if (x.t == tLIST && len(x) < 1 && dyad.v in specials) { return specials[dyad.v]; }
	if (x.t == tLIST && len(x) == 1 && dyad.v == ",") { return first(x).t != tLIST ? x : first(x); }
	if (x.t != tLIST || len(x) < 1) { return x; }
	return overHelper(dyad, first(x), drop(K_ONE, x, env), env);
}

function overHelper(dyad, x, y, env) {
	return y.v.reduce((x, y) => applyDyad(dyad, x, y, env), x);
}

function eacha(func, args, env) {
	var x = args[0]; var y = flip(k(tLIST, args.slice(1)), env);
	if (x.t != tLIST) { return kMap(y, y => call(func, concat(x, y), env)); }
	return kZip(x, y, (x, y) => call(func, concat(x, y), env));
}
function overa(func, args, env) {
	var x = args[0]; var y = flip(k(tLIST, args.slice(1)), env);
	return y.v.reduce((x, y) => call(func, concat(enlist(x), y), env), x);
}
function scana(func, args, env) {
	var x = args[0]; var y = flip(k(tLIST, args.slice(1)), env);
	return concat(x, kMap(y, y => x = call(func, concat(enlist(x), y), env)));
}

function fixed(monad, x, env) {
	var cur = x, prev = x;
	do { cur = applyMonad(monad, prev = cur, env); } while (!match(prev, cur).v && !match(cur, x).v);
    return prev;
}

function fixedwhile(monad, x, y, env) {
	if (x.t == tNUMBER) { for (var z = 0;z < x.v; z++) { y = applyMonad(monad, y, env); } }
	else { do { y = applyMonad(monad, y, env); } while (applyMonad(x, y, env).v); } return y;
}

function scan(dyad, x, env) {
	if (x.t != tLIST || len(x) <= 1) { return x; }
	var i = first(x), r = enlist(i);
	kMap(drop(K_ONE,x,env), z => { r.v.push(i = applyDyad(dyad, i, z, env)); }); return r;
}

function scand(dyad, x, y, env) {
	return kMap(y, v => x = applyDyad(dyad, x, v, env));
}

function scanfixed(monad, x, env) {
	var r = [x];
    for (;;) {
		var p = r[r.length - 1]; var n = applyMonad(monad, p, env);
		if (match(p, n).v || match(n, x).v) break;
        r.push(n);
	}
    return k(tLIST,r);
}

function scanwhile(monad, x, y, env) {
	var r = [y];
    if (x.t == tNUMBER) {
        for (var z = 0; z < x.v; z++) { r.push(y = applyMonad(monad, y, env)); } }
	else { do { y = applyMonad(monad, y, env); r.push(y); } while (applyMonad(x, y, env).v != 0); }
	return k(tLIST, r);
}

////////////////////////////////////
//
//   Interpreter
//
////////////////////////////////////

function am(f) { // create an atomic monad
	const recur = (x, env) =>
        x.t == tDICT ? dict(x.k, recur(x.v, env)) :
		x.t == tLIST ? kMap(x, x => recur(x, env)) : f(x, env);
    return recur;
}
export { am as atomicMonad };

function as(f) { // create a string-atomic monad
	const recur = (x, env) =>
		x.t == tLIST && !x.v.every(x => x.t == tCHAR) ?
		kMap(x, x => recur(x, env)) : f(x, env);
    return recur;
}
export { as as atomicStringMonad };

function ar(f) { // create a right atomic dyad
	const recur = (x, y, env) =>
		y.t == tLIST ? kMap(y, z => recur(x, z, env)) : f(x, y, env);
    return recur;
}
export { ar as atomicRightMonad };

function ad(f) { // create an atomic dyad
	const recur = (x, y, env) => {
		if (x.t == tDICT && y.t == tDICT) {
			var r = emptydict();
            kMap(unique(concat(x.k, y.k)), k => {
				var a = dictGet(x,k), b = dictGet(y,k);
                dictSet(r, k, a == K_NAN ? b : b == K_NAN ? a : recur(a, b, env));
			});
            return r;
		}
		return x.t == tLIST && y.t == tLIST ? kZip(x, y, (a,b) => recur(a, b, env)) :
		       x.t == tDICT ? dict(x.k, recur(x.v, y, env)) :
		       y.t == tDICT ? dict(y.k, recur(x, y.v, env)) :
		       x.t == tLIST ? kMap(x, z => recur(z, y, env)) :
		       y.t == tLIST ? kMap(y, z => recur(x, z, env)) : f(x, y, env);
	};
    return recur;
}
export { ad as atomicDyad };

function applyMonad(verb, x, env) {
	if (verb.t == tFUNC) { return call(verb, enlist(x), env); }
	if (verb.t == tLIST) { return subscr(verb, x, env); }
	if (verb.t == tADVERB & verb.r == null) {
        verb.r = x;
        var r = run(verb, env);
        verb.r = null;
        return r;
    }
	if (verb.sticky) {
		var s = verb.sticky;
        s.r = x;
        verb.sticky = null;
		var r = run(verb, env);
        verb.sticky = s;
        s.r = null;
        return r;
	}
	return applyverb(verb, [x], env);
}

function applyDyad(verb, x, y, env) {
	if (verb.t == tFUNC) { return call(verb, k(tLIST,[x,y]), env); }
	if (verb.sticky && verb.sticky != verb) {
		var s = verb.sticky;
        s.l = x; s.r = y;
        verb.sticky = null;
		var r = run(verb, env);
        verb.sticky = s;
        s.r = s.l = null;
        return r;
	}
	return applyverb(verb, [x, y], env);
}

export const vtATOMICMONAD = 0, vtLISTMONAD = 1, vtATOMICDYAD = 2, vtLISTATOMDYAD = 3, vtATOMLISTDYAD = 4, vtLISTLISTDYAD = 5, vtTRIAD = 6, vtTETRAD = 7;

export const verbs = {
	//     a            l            a-a         l-a         a-l         l-l            triad    tetrad
	":" : [ident,       ident,       rident,     rident,     rident,     rident,        null,    null  ],
	"+" : [flip,        flip,        ad(plus),   ad(plus),   ad(plus),   ad(plus),      null,    null  ],
	"-" : [am(negate),  am(negate),  ad(minus),  ad(minus),  ad(minus),  ad(minus),     null,    null  ],
	"*" : [first,       first,       ad(times),  ad(times),  ad(times),  ad(times),     null,    null  ],
	"%" : [am(sqrt),    am(sqrt),    ad(divide), ad(divide), ad(divide), ad(divide),    null,    null  ],
	"!" : [iota,        odometer,    mod,        null,       ar(mod),    dict,          null,    null  ],
	"&" : [where,       where,       ad(min),    ad(min),    ad(min),    ad(min),       null,    null  ],
	"|" : [reverse,     reverse,     ad(max),    ad(max),    ad(max),    ad(max),       null,    null  ],
	"<" : [asc,         asc,         ad(less),   ad(less),   ad(less),   ad(less),      null,    null  ],
	">" : [desc,        desc,        ad(more),   ad(more),   ad(more),   ad(more),      null,    null  ],
	"=" : [identitymat, group,       ad(equal),  ad(equal),  ad(equal),  ad(equal),     null,    null  ],
	"~" : [am(not),     am(not),     match,      match,      match,      match,         null,    null  ],
	"," : [enlist,      enlist,      concat,     concat,     concat,     concat,        null,    null  ],
	"^" : [nullish,     am(nullish), ad(fill),   except,     ad(fill),   except,        null,    null  ],
	"#" : [count,       count,       take,       reshape,    take,       reshape,       null,    null  ],
	"_" : [am(floor),   am(floor),   drop,       dictdrop,   drop,       cut,           null,    null  ],
	"$" : [kFmt,        as(kFmt),    dollar,     dollar,     dollar,     dollar,        null,    null  ],
	"?" : [randomV,     unique,      rnd,        findEqual,  rnd,        ar(findEqual), splice,  null  ],
	"@" : [type,        type,        subscr,     subscr,     subscr,     subscr,        amend4,  amend4],
	"." : [kEval,       kEval,       call,       call,       call,       call,          dmend3,  dmend4],
	"'" : [null,        null,        null,       binsearch,  null,       ar(binsearch), null,    null  ],
	"/" : [null,        null,        null,       null,       pack,       pack,          null,    null  ],
	"\\": [null,        null,        null,       unpack,     split,      null,          null,    null  ],
	"':": [null,        null,        null,       null,       kwindow,    null,          null,    null  ],
};

function applyverb(node, args, env) {
	if (node.curry) {
		var a = [], i = 0;
        for (var z = 0; z < node.curry.length; z++) {
			if (!isNull(node.curry[z]).v) { a[z] = run(node.curry[z], env); continue; }
			while (i < args.length && !args[i]) i++;
            if (!args[i]) { return node; }
			a[z] = args[i++];
		}
        args = a;
	}
	if (node.t == tADVERB) { return applyadverb(node, node.verb, args, env); }
	var left  = args.length == 2 ? args[0] : node.l ? run(node.l, env) : null;
	var right = args.length == 2 ? args[1] : args[0];
	if (!right) { return { t: node.t, v: node.v, curry: [left, NILVAL] }; }
    var verbname = node.forcemonad ? node.v[0] : node.v;
	var r = null; var v = verbs[verbname];
	if (!v) { throw new Error(`internal error. verb '${verbname}' was not defined.`); }
	else if (args.length == 3)                    { r = v[vtTRIAD]; }
	else if (args.length == 4)                    { r = v[vtTETRAD]; }
	else if (!left           && right.t != tLIST) { r = v[vtATOMICMONAD]; }
	else if (!left           && right.t == tLIST) { r = v[vtLISTMONAD]; }
	else if (left.t != tLIST && right.t != tLIST) { r = v[vtATOMICDYAD]; }
	else if (left.t == tLIST && right.t != tLIST) { r = v[vtLISTATOMDYAD]; }
	else if (left.t != tLIST && right.t == tLIST) { r = v[vtATOMLISTDYAD]; }
	else if (left.t == tLIST && right.t == tLIST) { r = v[vtLISTLISTDYAD]; }
	if (!r) { throw new Error("invalid arguments to "+node.v); }
	return (args.length > 2) ? r(args, env) : left ? r(left, right, env) : r(right, env);
}

function valence(node, env) {
	if (node.t == tFUNC) {
		return (node.curry || []).reduce((x, v) => x - !isNull(v).v, node.args.length);
	}
	if (node.t == tREF) { return valence(env.lookup(sym(node.v))); }
	if (node.t == tADVERB && node.v == "'") { return valence(node.verb, env); }
	if (node.t == tADVERB)      { return 1; }
	if (node.t != tVERB)        { return 0; }
	if (node.forcemonad)        { return 1; }
	if (node.v in nativeMonads) { return 1; }
	return (node.sticky && (node.sticky.t == tADVERB || node.sticky.forcemonad || node.sticky.l)) ? 1 : 2;
}

export const atMONAD = 0, atDYAD = 1, atLISTMONAD = 2, atLISTDYAD = 3, atMANYARGS = 4;
export const adverbs = {
	//       mv/nv        dv          l-mv         l-dv             3+v
	"':"  : [null,        eachPrior,  stencil,     eachPriorHelper, null ],
	"'"   : [eachMonadic, eachDyadic, eachDyadic,  eachDyadic,      eacha],
	"/:"  : [null,        null,       eachRight,   eachRight,       null ],
	"\\:" : [null,        null,       eachLeft,    eachLeft,        null ],
	"/"   : [fixed,       over,       fixedwhile,  overHelper,      overa],
	"\\"  : [scanfixed,   scan,       scanwhile,   scand,           scana],
};

function applyadverb(node, verb, args, env) {
	if (verb.t == tREF) { verb = run(verb, env); }
	var r = null; var v = valence(verb, env);
	if (v > 2)                 { return adverbs[node.v][atMANYARGS](verb, args, env); }
	if (v == 0 && verb.t != tFUNC) { return applyverb(k(tVERB,node.v), [verb, args[atDYAD]], env); }
	if (v == 0 && verb.t == tFUNC) { v = 1; }
	if (v == 2 && !args[1])    { args = [null, args[0]]; }
	if (v == 1 && !args[0])    { r = adverbs[node.v][atMONAD]; }
	if (v == 2 && !args[0])    { r = adverbs[node.v][atDYAD]; }
	if (v == 1 &&  args[0])    { r = adverbs[node.v][atLISTMONAD]; }
	if (v == 2 &&  args[0])    { r = adverbs[node.v][atLISTDYAD]; }
	if (!r) throw new Error(`invalid arguments to ${node.v} [${(args[0] ? format(args[0]) + " " : "")} ${format(verb)} (valence ${v}), ${format(args[1])}]`);
	return args[0] ? r(verb, args[0], args[1], env) : r(verb, args[1], env);
}

export class Environment {
    constructor(pred) {
        this.p = pred; this.d = emptydict();
    }
    put(n, g, v) {
        if (typeof n == "string") { n = sym(n); }
        if (g && this.p) { this.p.put(n, g, v); } else { dictSet(this.d, n, v); }
    }
    contains(x) { return findMatch(this.d.k, x).v != len(this.d.k); }
    lookup(n, g) {
        if (g && this.p) { return this.p.lookup(n, g); }
        if (!this.contains(n)) {
            if (!this.p) { throw new Error("the name '" + n.v + "' has not been defined."); }
            return this.p.lookup(n);
        }
        var view = dictGet(this.d, n);
        if (view.t == tVIEW) {
            var dirty = view.cache == 0;
            Object.keys(view.depends).forEach(z => {
                var n = (z == view.v) ? view.cache : this.lookup(sym(z)), o = view.depends[z];
                if (!o || !match(n, o).v) { dirty = 1; view.depends[z] = n; }
            });
            if (dirty) { view.cache = run(view.r, this); } return view.cache;
        }
        return view;
    }
}

function subscr(x, y, env) {
	return x.t == tSYMBOL ? subscr(env.lookup(x), y, env) : y.t == tNIL ? x :
	       x.t == tLIST && y.t == tDICT ? dict(y.k, subscr(x, y.v, env)) :
	       x.t == tVERB || x.t == tADVERB ? applyMonad(x, y, env) :
	       (x.t == tLIST || x.t == tDICT) && y.t == tLIST ? kMap(y, z => subscr(x, z)) :
	       x.t == tLIST ? (y.t > 1 || y.v < 0 || y.v >= len(x) || y.v % 1 != 0) ? K_NAN : x.v[y.v] :
	       x.t == tDICT ? dictGet(x, y) : call(x, enlist(y), env)
}

function atDepth(x, y, i, env) {
	if (i >= len(y)) { return x; };
    var c = y.v[i]; var k = subscr(x, c, env);
	return (c.t != tNIL && c.t != tLIST) ? atDepth(k, y, i + 1, env) :
		   kMap(k, t => atDepth(t, y, i + 1, env))
}

function call(x, y, env) {
	if (x.sticky) { return (valence(x.sticky, env) == 1 ? applyMonad : applyDyad)(x, y.v[0], y.v[1], env); }
	if (x.t == tSYMBOL) { return call(env.lookup(x), y, env); }
	if (x.t == tLIST || x.t == tDICT) { return y.t == tLIST ? atDepth(x, y, 0, env) : subscr(x, y, env); }
	if (x.t == tVERB) { return applyverb(x, y.t == tLIST ? y.v : [y], env); }
	if (x.t == tADVERB) { return applyadverb(x, run(x.verb, env), y.v, env); }
	if (x.t != tFUNC) { throw new Error(`function or list expected, found ${TYPENAMES[x.t]}.`); }
	if (y.t == tDICT) { var e = new Environment(null); e.d = y; x.env = e; return x; }
	if (y.t != tLIST) { y = enlist(y); }
	var environment = new Environment(x.env); var curry = x.curry ? x.curry.slice() : [];
	if (x.args.length != 0 || len(y) != 1 || !isNull(y.v[0]).v) {
		var all = true, i = 0;
        for (var z = 0; z < x.args.length; z++) {
			if (curry[z] && !isNull(curry[z]).v) continue;
			if (i >= len(y)) { all = false; break; }
			if (y.v[i] == null || isNull(y.v[i]).v) { all = false; }
			curry[z] = y.v[i++];
		}
		if (!all) { return { t: tFUNC, v: x.v, args: x.args, env: x.env, curry }; }
		if (i < len(y) && x.args.length != 0) { throw new Error("valence error."); }
		for (var z = 0; z < x.args.length; z++) { environment.put(sym(x.args[z]), false, curry[z]); }
	}
	environment.put(sym("o"), false, x);
    return run(x.v, environment);
}

export function run(node, env) {
	if (node instanceof Array) { return node.reduce((_, x) => run(x, env), null); }
	if (node.sticky) { return node; }
	if (node.t == tLIST) { return reverse(kMap(reverse(node), v => run(v, env))); }
	if (node.t == tDICT) { return dict(node.k, kMap(node.v, x => run(x, env))); }
	if (node.t == tFUNC) {
		if (node.r) { return subscr(node, run(node.r, env), env); }
		if (!node.env) { return { t: tFUNC, v: node.v, args: node.args, curry: node.curry, env }; }
	}
	if (node.t == tVIEW) { env.put(sym(node.v), false, node); return node; }
	if (node.t == tREF) {
		if (node.r) { env.put(sym(node.v), node.global, run(node.r, env)); }
		return env.lookup(sym(node.v));
	}
	if (node.t == tVERB && node.curry && !node.r) { return applyverb(node, [], env); }
	if (node.t == tVERB && node.r) {
		var right = run(node.r, env);
		var left  = node.l ? run(node.l, env) : null;
		return applyverb(node, [left, right], env);
	}
	if (node.t == tADVERB && node.r) {
		var right = run(node.r, env);
		var verb  = run(node.verb, env);
		var left  = node.l ? run(node.l, env) : null;
		return applyadverb(node, verb, [left, right], env);
	}
	if (node.t == tCOND) {
		for (var z = 0; z < node.v.length - 1; z += 2) {
			if (!falsy(run(node.v[z], env))) { return run(node.v[z + 1], env); }
		}
        return run(node.v[node.v.length - 1], env);
	}
	if (node.t == tQUOTE) { return run(node.v, env); }
	return node;
}

function amend4(args, env) { return mend(args, env, amendm, amendd); }
function dmend3(args, env) { return args[0].t != tLIST ? trap(args, env) : dmend4(args, env); }
function dmend4(args, env) { return mend(args, env, dmend, dmend); }

function mend(args, env, monadic, dyadic) {
	var ds = deepclone(args[0]), i = args[1], f = args[2], y = args[3];
	(y ? dyadic : monadic)(ds.t == tSYMBOL ? env.lookup(ds,true) : ds, i, y, f, env); return ds;
}

function amendm(d, i, y, monad, env) {
	if (monad.t == tNUMBER) monad = { t: tFUNC, args: ["x"], v: [monad] };
	if (i.t != tLIST) listSet(d, i, applyMonad(monad, subscr(d, i, env), env));
	else kMap(i, v => amendm(d, v, y, monad, env));
}

function amendd(d, i, y, dyad, env) {
	if (i.t == tLIST) kMap(i, (iv, z) => amendd(d, iv, y.t == tLIST ? y.v[z] : y, dyad, env));
	else (d.t == tDICT ? dictSet : listSet)(d, i, applyDyad(dyad, subscr(d, i, env), y, env));
}

function dmend(d, i, y, f, env) {
	if (i.t != tLIST) { (y ? amendd : amendm)(d, i, y, f, env); return; }
	if (len(i) == 1) { dmend(d, i.v[0], y, f, env); return; }
    if (len(i) < 1) return;
	var rest = drop(K_ONE, i, env);
	if (i.v[0].t == tLIST) {
		if (y && y.t == tLIST) { kZip(i, y, (a, b) => amendd(d, a, b, f, env)); return; }
		kMap(i.v[0], x => dmend(subscr(d,x,env), rest, y, f, env));
	}
	else if (isNull(i.v[0]).v) { kMap(d, (_, i) => dmend(subscr(d,k(tNUMBER,i),env),rest,y,f,env)); }
	else if (d.t == tLIST && d.v[0].t != tLIST) { (y ? amendd : amendm)(d, i, y, f, env); }
	else {
		var di = subscr(d, first(i), env);
		if (di.t != tLIST) { (y ? amendd : amendm)(d, i, y, f, env); return; }
		dmend(di, rest, y, f, env);
	}
}

function trap(args, env) {
	try {
        return k(tLIST, [K_ZERO, call(args[0], ensureList(args[1]))]);
    } catch(e) {
        return k(tLIST, [K_ONE, jsStringToKString(e.message ?? String(e))]);
    }
}

////////////////////////////////////
//
//   Tokenizer
//
////////////////////////////////////

const rNUMBER  = /^(-?0w|0N|-?\d+\.\d*|-?\d*\.?\d+)/;
const rHEXLIT  = /^0x[a-zA-Z\d]+/;
const rBOOL    = /^[01]+b/;
const rNAME    = /^[a-z][a-z\d]*/i;
const rSYMBOL  = /^`([a-z.][a-z0-9.]*)?/i;
const rSTRING  = /^"(\\.|[^"\\\r\n])*"/;
const rVERB    = /^[+\-*%!&|<>=~,^#_$?@.:]/;
const rASSIGN  = /^[+\-*%!&|<>=~,^#_$?@.]:/;
const rIOVERB  = /^\d:/;
const rADVERB  = /^['\\\/]:?/;
const rSEMI    = /^;/;
const rCOLON   = /^:/;
const rVIEW    = /^::/;
const rCOND    = /^\$\[/;
const rDICT    = /^\[[a-z]+:/i;
const rOPEN_B  = /^\[/;
const rOPEN_P  = /^\(/;
const rOPEN_C  = /^{/;
const rCLOSE_B = /^\]/;
const rCLOSE_P = /^\)/;
const rCLOSE_C = /^}/;

const des = {};
des[rNUMBER ] = "number"; des[rNAME   ] = "name"   ; des[rSYMBOL ] = "symbol"; des[rSTRING] = "string";
des[rVERB   ] = "verb"  ; des[rIOVERB ] = "IO verb"; des[rADVERB ] = "adverb"; des[rSEMI  ] = "';'";
des[rCOLON  ] = "':'"   ; des[rVIEW   ] = "view"   ; des[rCOND   ] = "'$['"  ;
des[rOPEN_B ] = "'['"   ; des[rOPEN_P ] = "'('"    ; des[rOPEN_C ] = "'{'"   ; des[rASSIGN] = "assignment";
des[rCLOSE_B] = "']'"   ; des[rCLOSE_P] = "')'"    ; des[rCLOSE_C] = "'}'"   ;

var text = "";
var funcdepth = 0;
function begin(str) {
	str = str.replace(/("(?:[^"\\\n]|\\.)*")|(\s\/.*)|([a-z\d\]\)]-(?=\.?\d))/gi, (_, x, y, z) => {
		// preserve a string (x), remove a comment (y), disambiguate a minus sign (z)
		return x ? x : y ? "" : z.replace('-', '- ')
	})
	text = str.trim().replace(/\n/g, ";"); funcdepth = 0;
}
export function done()  { return text.length < 1; }
function at(regex)      { return regex.test(text); }
function matches(regex) { return at(regex) ? expect(regex) : false; }
function expect(regex) {
	var found = regex.exec(text);
	if (regex == rOPEN_C) { funcdepth++; } if (regex == rCLOSE_C) { funcdepth--; }
	if (found == null) { throw new Error("parse error. "+des[regex]+" expected."); }
	text = text.substring(found[0].length).trim(); return found[0];
}

////////////////////////////////////
//
//   Parser
//
////////////////////////////////////

function findNames(node, names) {
	if (node == null)          { return names; }
	if (node instanceof Array) { node.forEach(v => findNames(v, names)); return names; }
	if (node.t == tREF)        { names[node.v] = 0; }
	if (node.t != tFUNC)       { findNames(node.v, names); }
	return findNames([node.l, node.r, node.verb, node.curry], names);
}

function atNoun() {
	return !done() && at(rNUMBER) || at(rNAME) || at(rSYMBOL) || at(rSTRING) || at(rCOND) || at(rOPEN_P) || at(rOPEN_C);
}

function indexedassign(node, indexer) {
	var op = { t: tFUNC, args: ["x","y"], v: [{ t: tREF, v: "y" }] }; // {y}
	var gl = matches(rCOLON);
	var ex = parseEx(parseNoun());
	// t[x]::z  ->  ..[`t;x;{y};z]   t[x]:z  ->  t:.[t;x;{y};z]
	if (!gl) { node.r = { t: tVERB, v: ".", curry: [k(tREF, node.v), k(tLIST, indexer), op, ex] }; return node; }
	return { t: tVERB, v: ".", r: { t: tVERB, v: ".", curry: [sym(node.v), k(tLIST, indexer), op, ex] }};
}

function compoundassign(node, indexer) {
	if (!at(rASSIGN)) { return node; }
	var op = expect(rASSIGN).slice(0, 1); var gl = matches(rCOLON); var ex = parseEx(parseNoun());
	if (!indexer) {
		// t+::z  -> t::(.`t)+z
		var v = gl ? asVerb(".", null, sym(node.v)) : node;
		return { t: node.t, v: node.v, global: gl, r: asVerb(op, v, ex) };
	}
	// t[x]+::z -> ..[`t;x;+:;z]   t[x]+:z -> t:.[t;x;{y};z]
	if (!gl) { node.r = { t: tVERB, v: ".", curry: [k(tREF, node.v), k(tLIST, indexer), asVerb(op), ex] }; return node; }
	return asVerb(".", null, { t: tVERB, v: ".", curry: [sym(node.v), indexer, asVerb(op), ex] });
}

function applycallright(node) {
	while (matches(rOPEN_B)) {
		var args = parseList(rCLOSE_B);
        node = asVerb(".", node, k(tLIST, args.length ? args : [EMPTYSYM]));
	}
    return node;
}

function applyindexright(node) {
	if (node.sticky && at(rVERB)) {
		var x = parseNoun();
        x.l = node;
        x.r = parseEx(parseNoun());
        return x;
	}
	while (matches(rOPEN_B)) {
        node = asVerb(".", node, k(tLIST, parseList(rCLOSE_B)));
    }
	return node;
}

function findSticky(root) {
	var n = root;
    if (n == null || (n.t == tADVERB && n.r == null)) return;
	while (n.t == tVERB && !n.curry || n.t == tADVERB) {
		if (n.r == null) { root.sticky = n; return; }
        n = n.r;
	}
}

function parseList(terminal, cull) {
	var r = [];
    do {
		if (terminal && at(terminal)) break;
		while (matches(rSEMI)) { if (!cull) { r.push(NILVAL); } }
		var e = parseEx(parseNoun()); findSticky(e);
		if (e != null) { r.push(e); }
		else if (!cull) { r.push(NILVAL); }
	} while (matches(rSEMI));
    if (terminal) { expect(terminal); }
    return r;
}

function parseNoun() {
	if (at(rIOVERB)) { return k(tVERB, expect(rIOVERB)); }
	if (at(rBOOL)) {
		var n = expect(rBOOL), r = [];
		for (var z = 0; z < n.length - 1; z++) { r.push(k(tNUMBER, parseInt(n[z]))); }
		return applyindexright(k(tLIST, r));
	}
	if (at(rHEXLIT)) {
		var h = expect(rHEXLIT); if (h.length % 2) { throw new Error("stray hex digit at end of byte string."); }
		var r = kRange(h.length / 2 - 1, z => k(tCHAR, parseInt(h.slice(2 * z + 2, 2 * z + 4), 16)));
		return (r.v.length == 1) ? first(r) : r;
	}
	if (at(rNUMBER)) {
		var r = [];
        while (at(rNUMBER)) {
			var n = expect(rNUMBER);
            r.push(k(tNUMBER, n == "0w" ? Infinity : n == "-0w" ? -Infinity : n == "0N" ? NaN : parseFloat(n)));
		}
        return applyindexright(wraplist(r));
	}
	if (at(rSYMBOL)) {
		var r = [];
        while (at(rSYMBOL)) { r.push(k(tSYMBOL, expect(rSYMBOL).slice(1))); }
		return applyindexright(wraplist(r));
	}
	if (at(rSTRING)) {
		var str = expect(rSTRING); str = str.substring(1, str.length-1);
		for (var z=0;z < ESCAPE_PAIRS.length; z++) { str = str.split(ESCAPE_PAIRS[z][1]).join(ESCAPE_PAIRS[z][0]); }
		return applyindexright(jsStringToKString(str));
	}
	if (matches(rOPEN_B)) {
		var m = emptydict();
        if (!matches(rCLOSE_B)) {
            do {
                var key = sym(expect(rNAME));
                expect(rCOLON);
                dictSet(m, key, matches(rCOLON) ? dictGet(m, sym(expect(rNAME))) : parseEx(parseNoun()));
		    } while(matches(rSEMI));
            expect(rCLOSE_B);
        }
        return applyindexright(m);
	}
	if (matches(rOPEN_C)) {
		var args = [];
        if (matches(rOPEN_B)) {
			do { args.push(expect(rNAME)); } while(matches(rSEMI));
            expect(rCLOSE_B);
		}
		var r = k(tFUNC, parseList(rCLOSE_C, true));
		if (args.length == 0) {
			var names = findNames(r.v, {});
			if      ("z" in names) { args = ["x","y","z"]; }
			else if ("y" in names) { args = ["x","y"]; }
			else if ("x" in names) { args = ["x"]; }
		}
		r.args = args; return applycallright(r);
	}
	if (matches(rOPEN_P)) { return applyindexright(wraplist(parseList(rCLOSE_P))); }
	if (matches(rCOND))   { return k(tCOND, parseList(rCLOSE_B, true)); }
	if (at(rVERB)) {
		var r = k(tVERB, expect(rVERB));
		if (matches(rCOLON)) { r.v += ":"; r.forcemonad = true; }
		if (at(rOPEN_B) && !at(rDICT)) {
			expect(rOPEN_B); r.curry = parseList(rCLOSE_B, false);
			if (r.curry.length < 2 && !r.forcemonad) { r.curry.push(NILVAL); }
		} return r;
	}
	if (at(rNAME)) {
		var n = k(tREF, expect(rNAME));
		if (n.v in nativeMonads) { return applycallright(k(tVERB, n.v)); }
		if (funcdepth == 0 && matches(rVIEW)) {
			var r = k(tVIEW, n.v);
			r.r = parseEx(parseNoun());
			r.depends = findNames(r.r, {});
			r.cache = NILVAL;
			return r;
		}
		if (matches(rCOLON)) {
			n.global = matches(rCOLON);
            n.r = parseEx(parseNoun());
			if (n.r == null) { throw new Error("noun expected following ':'."); }
			findSticky(n.r); if (n.r == n.r.sticky) { n.r.sticky = null; }
			return n;
		}
		if (matches(rOPEN_B)) {
			var index = parseList(rCLOSE_B);
			if (at(rASSIGN)) { return compoundassign(n, index); }
			if (matches(rCOLON)) { return indexedassign(n, index); }
			if (index.length == 0) { index = [EMPTYSYM]; }
			n = asVerb(".", n, k(tLIST, index));
		}
		return applycallright(compoundassign(n, null));
	}
	return null;
}

function parseAdverb(left, verb) {
	var a = expect(rADVERB);
	while (at(rADVERB)) { var b = expect(rADVERB); verb = { t: tADVERB, v: a, verb }; a = b; }
	if (at(rOPEN_B)) { return applycallright({ t: tADVERB, v: a, verb, l: left }); }
	return { t: tADVERB, v: a, verb, l: left, r: parseEx(parseNoun()) };
}

function parseEx(node) {
	if (node == null) { return null; }
	if (at(rADVERB)) { return parseAdverb(null, node); }
	if (node.t == tVERB && !node.r) {
		var p = at(rOPEN_P), x = parseNoun();
		if (at(rADVERB) && valence(node) == 1) return parseAdverb(node, x)
		node.r = parseEx((p && x.t == tVERB) ? k(tQUOTE, x) : x);
        node.sticky = null;
	}
	if (atNoun() && !at(rIOVERB)) {
		var x = parseNoun();
		if (x.t == tREF && x.v in builtinInfix) { return asVerb(".", x, k(tLIST, [node, parseEx(parseNoun())])); }
		if (at(rADVERB)) { return parseAdverb(node, x); }
		return asVerb("@", node, parseEx(x));
	}
	if (at(rVERB) || at(rIOVERB)) {
		var x = parseNoun();
		if (x.forcemonad) { node.r = parseEx(x); return node; }
		if (at(rADVERB)) { return parseAdverb(node, x); }
		x.l = node; x.r = parseEx(parseNoun()); node = x;
	}
	return node;
}

export function parse(str) {
	begin(" " + str);
    var r = parseList(null, false);
    if (done()) { return r; }
	throw new Error(`unexpected character '${text[0]}'.`);
}

////////////////////////////////////
//
//   Prettyprinter
//
////////////////////////////////////

export function format(k, indent, symbol) {
	if (typeof indent == "number") { indent = ""; }
    if (k == null) { return ""; }
	function indented(k) { return format(k, indent + " "); };
	if (k instanceof Array) { return k.map(format).join(";"); }
	if (k.sticky) {
        var s = k.sticky;
        k.sticky = null;
        var r = format(k);
        k.sticky = s;
        return `(${r})`;
    }
	if (k.t == tNUMBER) {
		return k.v == Infinity ? "0w" : k.v == -Infinity ? "-0w" : isKNAN(k) ? "0N" :
		"" + (k.v % 1 == 0 ? k.v : Math.round(k.v * 10000) / 10000); // limit to 5 decimal digits
	}
	if (k.t == tCHAR) { return kStringToJSString(k, true); }
	if (k.t == tSYMBOL) { return (symbol ? "" : "`") + k.v; }
	if (k.t == tLIST) {
		if (len(k) <  1) { return "()"; }
		if (len(k) == 1) { return "," + format(k.v[0]); }
		var same = true, sublist = false;
        indent = indent || "";
		for (var z = 0; z < len(k); z++) { same &= k.v[z].t == k.v[0].t; sublist |= k.v[z].t == tLIST; }
		if (sublist) { return "(" + k.v.map(indented).join("\n " + indent) + ")"; }
		if (same & k.v[0].t == tCHAR) { return kStringToJSString(k, true); }
		if (same & k.v[0].t < tLIST)  { return k.v.map(format).join(k.v[0].t == tSYMBOL ? "" : " "); }
		return "(" + k.v.map(format).join(";") + ")";
	}
	if (k.t == tDICT) {
		if (len(k.k) < 1 || k.k.v.some(x => x.t != tSYMBOL)) {
            var t = format(k.k);
            if (len(k.k) == 1) { t = "(" + t + ")"; }
            return t + "!" + format(k.v);
        }
		return "[" + kZip(k.k, k.v, (x,y) => x.v + ":" + format(y)).v.join(";") + "]";
	}
	if (k.t == tFUNC) {
		return "{" + (k.args.length ? "[" + k.args.join(";") + "]" : "") + format(k.v) + "}" +
				(k.curry ? "[" + format(k.args.map((_, i) => k.curry[i])) + "]" : "");
	}
	if (k.t == tVIEW) { return k.v + "::" + format(k.r); }
	if (k.t == tREF) { return k.v + (k.r ? (k.global ? "::" : ":") + format(k.r) : ""); }
	if (k.t == tVERB) {
		if (k.curry) { return k.v + "[" + format(k.curry) + "]" + format(k.r); }
		var left = (k.l ? format(k.l) : ""); if (k.l && k.l.l) { left = "(" + left + ")"; }
		return left + k.v + (k.r ? format(k.r) : "");
	}
	if (k.t == tADVERB) { return (k.l ? format(k.l) + " " : "") + format(k.verb) + k.v + format(k.r); }
	if (k.t == tNIL) { return ""; }
	if (k.t == tCOND) { return "$[" + format(k.v) + "]"; }
	if (k.t == tQUOTE) { return "(" + format(k.v) + ")"; }
}

// js natives and k natives:
export const nativeMonads = {};
export const builtinInfix = { "o": 0, "in": 0 };
function numericMonad(n, f) { verbs[n] = [f, am(f), null, null, null, null, null, null]; nativeMonads[n] = 0; }
numericMonad("log", x => k(tNUMBER, Math.log(numeric(x).v)));
numericMonad("exp", x => k(tNUMBER, Math.exp(numeric(x).v)));
numericMonad("cos", x => k(tNUMBER, Math.cos(numeric(x).v)));
numericMonad("sin", x => k(tNUMBER, Math.sin(numeric(x).v)));
export { numericMonad as nmonad };

export function baseEnv() {
	var env = new Environment(null);
	run(parse("prm:{{$[x;,/x,''o'x^/:x;,x]}@$[-8>@x;!x;x]}"), env);
	run(parse("in:{~^y?x}"), env);
	return env;
}

var packimpl   = parse("{+/y*|*\\1,|1_(#y)#x}")[0];
var unpackimpl = parse("{(1_r,,y)-x*r:|y(_%)\\|x}")[0];
var spliceimpl = parse("{,/(*x;$[99<@z;z x 1;z];*|x:(0,y)_x)}")[0];
var winimpl    = parse("{$[0>x;3':0,y,0;y(!0|1+(#y)-x)+\\:!x]}")[0];
var odoimpl    = parse("{+x\\'!*/x}")[0];
var splitimpl  = parse("{1_'(&x=y)_y:x,y}")[0];

// export the public interface:
export function setIO(symbol, slot, func) {
	if (!(symbol in verbs)) { verbs[symbol] = [null, null, null, null, null, null]; }
	verbs[symbol][slot] = func;
}

export const version = "0.1";
