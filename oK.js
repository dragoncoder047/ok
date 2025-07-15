////////////////////////////////////
//
//   A small(ish) implementation
//   of the K programming language.
//
//   John Earnest
//
////////////////////////////////////

"use strict";

var TN = [
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

var NIL = sym("");
var k0 = k(tNUMBER, 0);
var k1 = k(tNUMBER, 1);
var ESCAPE_PAIRS = [["\\","\\\\"],["\"","\\\""],["\n","\\n"],["\t","\\t"]];
var kt = [-9, -10, -11, 0, 99, 102, NaN, NaN, 107, 105, NaN, NaN, NaN];
var SP = k(tCHAR, " ".charCodeAt(0));
var NA = k(tNUMBER, NaN);

export function k(t, v)  { return { 't':t, 'v':v }; }
function dict  (x, y)    { return { t:tDICT, k:samelen(x,y), v:y }; }
export function sym(x)   { return k(tSYMBOL, x); }
function asVerb(x, y, z) { return { t:tVERB, v:x, l:y, r:z }; }
function wlist (x)       { return x.length==1 ? x[0] : k(tLIST,x); }
function kf    (x)       { return match(k(tLIST,[]), x).v || match(k0, x).v; }
function tobool(x)       { return x ? k1 : k0; }
function isstr (x)       { return x.t == tLIST && x.v.every(c => c.t == tCHAR); }
function kmod  (x, y)    { return x-y*Math.floor(x/y); }
function len   (x)       { return enslist(x).v.length; }
function krange(x, f)    { var r=[]; for(var z=0;z<x;z++) { r.push(f(z)); } return k(tLIST,r); }
function hex2  (x)       { return (x.v+0x100).toString(16).substring(-2); }
function lget  (x, y)    { if(y<0||y>=len(x)) { throw new Error("length error."); } return x.v[y]; }
function dget  (x, y)    { var i=findm(x.k, y); return (i.v==len(x.k)) ? NA : subscr(x.v, i); }
function lset  (x, y, z) { if (len(x) <= ensureposint(y)) { throw new Error("index error."); } x.v[y.v]=z; }
function dset  (x, y, z) { var i=findm(x.k, y).v; if(i==len(x.k)) { x.k.v.push(y); } x.v.v[i]=z; }
function lower (x)       { return k(tCHAR, String.fromCharCode(x.v).toLowerCase().charCodeAt(0)); }
function kmap  (x, f)    { return k(tLIST, enslist(x).v.map(f)); }
function kzip  (x, y, f) { return kmap(samelen(x,y), (z, i) => f(z, y.v[i])); }
function samelen(x, y)    { if (len(x) != len(y)) { throw new Error("length error."); } return x; }
function numeric(x)       { return (x.t==tNUMBER||x.t==tCHAR) ? x : ensuretype(x, tNUMBER); }
function enslist(x)       { return ensuretype(x, tLIST); }
function ensdict(x)       { return ensuretype(x, tDICT); }
function ensatom(x)       { if (x.t > 2) { throw new Error("domain error."); } return x; }
function nanp   (x)       { return x.t == tNUMBER && isNaN(x.v); }

function strtokval(x) { return wlist(krange(x.length, z => k(tCHAR,x.charCodeAt(z))).v); }
function clone(x)    { return (x.t==tLIST) ? k(x.t, x.v.slice(0)) : (x.t==tDICT) ? dict(clone(x.k), clone(x.v)) : x; }
function deepclone(x)   { return (x.t==tLIST) ? k(x.t, x.v.map(deepclone))  : (x.t==tDICT) ? dict(deepclone(x.k), deepclone(x.v)) : x; }
function ensuretype(n,t) { if (n.t!=t) throw new Error(TN[t]+" expected, found "+TN[n.t]+"."); return n; }
function ensureposint(x) { if (numeric(x).v<0||x.v%1!=0) { throw new Error("positive int expected."); } return x.v; }
function atomtostring(x, esc) {
	if (x.t != tLIST) { x = enlist(x); }
	var h = x.v.some(v => (v.v<32||v.v>127)&v.v!=9&v.v!=10);
	if (h) { return "0x"+x.v.map(hex2).join(""); }
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
function mod   (x, y) { return k(tNUMBER, numeric(x).v>0 ? kmod(numeric(y).v, x.v) : Math.floor(numeric(y).v / -x.v)); }
function max   (x, y) { return nanp(x)?y:nanp(y)?x:k(tNUMBER, Math.max(numeric(x).v, numeric(y).v)); }
function min   (x, y) { return                 k(tNUMBER, Math.min(numeric(x).v, numeric(y).v)); }
function less  (x, y) { return tobool(x.t==tLIST && y.t==tLIST ? comparelists(x,y,1) : ensatom(x).v < ensatom(y).v); }
function more  (x, y) { return tobool(x.t==tLIST && y.t==tLIST ? comparelists(x,y,0) : ensatom(x).v > ensatom(y).v); }
function equal (x, y) { return tobool((x.v == y.v) || (nanp(x) && nanp(y))); }
function join  (x, y) { return enslist(y).v.reduce((z, y) => concat(z, concat(x, y))); }
function ident    (x) { return x; }
function rident(x, y) { return y; }
function negate   (x) { return k(tNUMBER, -numeric(x).v); }
function first    (x) { return (x.t == tDICT) ? first(x.v) : (x.t != tLIST) ? x : len(x) ? x.v[0]:k(tLIST,[]); }
function sqrt     (x) { return k(tNUMBER, Math.sqrt(numeric(x).v)); }
function keys     (x) { return clone(ensdict(x).k); }
function rev      (x) { return x.t==tDICT?dict(rev(x.k),rev(x.v)):x.t==tLIST?k(tLIST,clone(enslist(x)).v.reverse()):x; }
function asc      (x) { return grade(-1, x); }
function desc     (x) { return grade(1, x); }
function not      (x) { return equal(numeric(x), k0); }
function enlist   (x) { return k(tLIST, [x]); }
function isnull   (x) { return max(match(x, NIL),match(x,k(tNIL))); }
function count    (x) { return k(tNUMBER, x.t == tDICT ? len(x.v) : x.t == tLIST ? len(x) : 1); }
function floor    (x) { return x.t == tCHAR ? lower(x) : k(tNUMBER, Math.floor(numeric(x).v)); }
function type     (x) { return k(tNUMBER, kt[x.t]); }
function kfmt     (x) { var r=strtokval(format(x, 0, 1)); return x.t==tLIST ? x : r.t==tLIST ? r : enlist(r); }
function real     (x) { return krange(numeric(x).v, () => k(tNUMBER, Math.random())); }

function iota(x) {
	if (x.t == tDICT) { return keys(x); }
	var i = krange(Math.abs(numeric(x).v), k.bind(null, 0)); return x.v>=0 ? i : rightatomicdyad(plus)(x, i);
}

function concat(x, y) {
	if (x.t==tDICT&&y.t==tDICT) { x=clone(x); kmap(y.k, v => { dset(x,v,dget(y,v)); }); return x; };
	return k(tLIST, (x.t==tLIST?x.v:[x]).concat(y.t==tLIST?y.v:[y]));
}

function keval(x, env) {
	if (x.t == tFUNC) { return x.env.d; }
	return x.t == tDICT ? clone(x.v) : x.t == tSYMBOL ? env.lookup(x, true) : run(parse(atomtostring(x)), env);
}

function dfmt(x, y) {
	if (x.t == tSYMBOL && x.v == '' && y.t == tLIST) { return isstr(y) ? k(tSYMBOL,atomtostring(y)) : kmap(y, z => dfmt(x, z)); }
	if (x.t == tLIST           && y.t == tLIST) { return kzip(x, y, dfmt); }
	if (x.t == tLIST           && y.t != tLIST) { return kmap(x, z => dfmt(z, y)); }
	if ((x.t == tSYMBOL || !isstr(y)) && y.t == tLIST) { return kmap(y, z => dfmt(x, z)); }
	if (x.t == tSYMBOL) { return {b: k(tNUMBER,y.v&1), i: k(tNUMBER,y.v|0), f: k(tNUMBER,y.v), c: k(tCHAR,y.v)}[x.v]; }
	if (y.t == tCHAR) { return y; } var r=clone(y); var d=Math.abs(x.v);
	while(len(r) < d) { x.v>0 ? r.v.push(SP) : r.v.unshift(SP); }
	while(len(r) > d) { x.v>0 ? r.v.pop()    : r.v.shift();     }
	return r;
}

function fill(x, y) { return nullish(y).v ? x : y; }

function except(x, y) {
	y = y.t == tLIST ? y : enlist(y);
	return k(tLIST, x.v.filter(z => nanp(finde(y, z))));
}

function filter(x,y,k) { return y.t == tDICT ? dict(k,subscr(y,k)) : subscr(y,k) }
function dictdrop(x, y) { var k = except(ensdict(y).k, x); return dict(k, subscr(y, k)); }
function drop(x, y, env) {
	if (x.t == tFUNC || x.t == tVERB || x.t == tADVERB) { return filter(x,y, where(atomicmonad(not)(each(x,y,env),env))) }
	if (y.t == tDICT) { return dict(drop(x, y.k, env), drop(x, y.v, env)); }
	return (y.t != tLIST || len(y) < 1) ? y : k(tLIST, numeric(x).v<0 ? y.v.slice(0,x.v) : y.v.slice(x.v));
}

function take(x, y, env) {
	if (x.t == tFUNC || x.t == tVERB || x.t == tADVERB) { return filter(x,y, where(each(x,y,env),env)) }
	if (y.t == tDICT) { return dict(take(x, y.k, env), take(x, y.v, env)); }
	if (y.t != tLIST || len(y) == 0) { y = enlist(y); }
	var s=numeric(x).v<0?kmod(x.v, len(y)):0;
	return krange(Math.abs(x.v), x => y.v[kmod(x+s, len(y))]);
}

function reshape(x, y) {
	if (y.t == tDICT) { return dict(x, subscr(y, x)); }
	if (y.t != tLIST) { y = enlist(y); }
	var a = first(x); var b = x.v[len(x)-1]; var c = 0;
	function rshr(x, y, i) {
		return krange(x.v[i].v, z => {
			return i==len(x)-1 ? y.v[kmod(c++, len(y))] : rshr(x, y, i+1);
		});
	}
	return nanp(a) ? (!len(y) ? y : cut(krange(len(y)/b.v, z => k(tNUMBER, z*b.v)), y)) :
	       nanp(b) ? cut(krange(a.v, z => k(tNUMBER, Math.floor(z*len(y)/a.v))), y) :
	       rshr(enslist(x), len(y) ? y : enlist(y), 0);
}

function match(x, y) {
	if (x.t != y.t) { return k0; }
	if (x.t == tDICT) { return min(match(x.k, y.k), match(x.v, y.v)); }
	if (x.t != tLIST) { return equal(x, y); }
	if (len(x) != len(y)) { return k0; }
	return tobool(x.v.every((x,i) => match(x, y.v[i]).v));
}

function findm(x, y) { y=x.v.findIndex(z => {return match(z,y).v}); return k(tNUMBER,y>=0?y:len(x)) }
function finde(x, y) { y=x.v.findIndex(z => {return equal(z,y).v}); return y>=0?k(tNUMBER,y):NA }
function nullish(x) { return tobool(match(x, NIL).v || match(x, k(tNIL)).v || nanp(x)); }

function cut(x, y, env) {
	return kzip(x, concat(drop(k1,x,env),count(y)), (a, b) => { // {x{x@y+!z-y}[y]'1_x,#y} ?
		var r=[]; for(var z=ensureposint(a);z<ensureposint(b);z++) { r.push(lget(y,z)); } return k(tLIST,r);
	});
}

function rnd(x, y, env) {
	if (x.t == tDICT) { return subscr(x.k, rightatomicdyad(finde)(x.v,y), env); }
	if (y.t == tCHAR) { return dfmt(k(tSYMBOL,"c"),rnd(x,rightatomicdyad(plus)(y,iota(k(tNUMBER,26))))); }
	if (y.t == tLIST) { return subscr(y, rnd(x, count(y))); }
    ensureposint(y);
	if (numeric(x).v<0) { if(-x.v>y.v) throw new Error("length error.");return take(x,asc(real(y)),env); }
	return kmap(iota(x), () => k(tNUMBER,Math.floor(Math.random()*y.v)));
}

function flip(x, env) {
	if (x.t != tLIST) return enlist(enlist(x))
	x=eachright(k(tVERB,"#"), over(k(tVERB,"|"), each(k(tVERB,"#"), x, env), env), x, env);
	return krange(len(first(x)), z => {
		return krange(len(x), t => x.v[t].v[z]);
	});
}

function grade(dir, x) {
	return x.t == tDICT ? subscr(x.k, grade(dir, x.v)) : k(tLIST, iota(count(x)).v.sort((a, b) => {
		var f = i => { var v = x.v[i.v]; return isstr(v) ? sym(atomtostring(v)) : v; }
		var av = f(a), bv = f(b); return less(av,bv).v ? dir : more(av,bv).v ? -dir : a.v - b.v;
	}));
}

function where(x, env) {
	if (x.t == tDICT) { return subscr(x.k, where(x.v, env)); } // {,/(0|x)#'!#x}...
	var s = kmap(x.t==tLIST ?x:enlist(x), (v,i) => take(k(tNUMBER,ensureposint(v)), k(tNUMBER,i), env));
	return over(asVerb(","), s, env);
}

function group(x) {
	var r={t:tDICT, k:unique(x)}; r.v=kmap(r.k, function(){ return k(tLIST,[]); });
	for(var z=0;z<len(x);z++) { dget(r, x.v[z]).v.push(k(tNUMBER, z)); } return r;
}

function unique(x) {
	var r=[]; for(var z=0;z<len(x);z++) {
		if (!r.some(e => match(x.v[z], e).v)) { r.push(x.v[z]); }
	} return k(tLIST,r);
}

function binsearch(x, y) {
	var a=0; var b=len(x); if (b<1 || less(y, first(x)).v) { return k(tNUMBER,-1); }
	while(b - a > 1) { var i=a+Math.floor((b-a)/2); if (more(x.v[i], y).v) { b=i; } else { a=i; } }
	return k(tNUMBER, a);
}

function comparelists(x, y, a) {
	return match(x,y).v?0: len(x)<len(y)?a: len(x)>len(y)?!a:
	       less(first(x),first(y)).v?a: more(first(x),first(y)).v?!a:
	       comparelists(drop(k1,x),drop(k1,y),a);
}

function split  (x, y) { return (x.t != tCHAR) ? unpack(x, y) : call(splitimpl, k(tLIST, [x,y])); }
function unpack (x, y) { return call(unpackimpl, k(tLIST, [x,y])); }
function pack   (x, y) { return (x.t == tCHAR) ? join(x, y) : call(packimpl, k(tLIST, [x,y])); }
function kwindow(x, y) { return call(winimpl, k(tLIST, [x,y])); }
function splice(xyz)   { return call(spliceimpl, k(tLIST, xyz)); }
function identitymat(x)       { var i = iota(x); return kmap(i, z => rightatomicdyad(equal)(z, i)); }
function odometer(x)   { return call(odoimpl, enlist(x)); }


////////////////////////////////////
//
//   Primitive Adverbs
//
////////////////////////////////////

function each(monad, x, env) {
	if (x.t == tDICT) { return dict(x.k, each(monad, x.v, env)); }
	return kmap(x, x => applymonad(monad, x, env));
}

function eachd(dyad, left, right, env) {
	if (!env) { return kmap(left, x => applydyad(dyad, x, null, right)); }
	if (left.t==tDICT&&right.t==tDICT) { return dict(left.k,eachd(dyad,left.v,subscr(right,left.k),env)); }
	if (left.t!=tLIST) { return eachright(dyad, left, right, env); }
	if (right.t!=tLIST) { return eachleft(dyad, left, right, env); }
	return kzip(left, right, (x, y) => applydyad(dyad, x, y, env));
}

function eachright(dyad, left, list, env) {
	return kmap(list, x => applydyad(dyad, left, x, env));
}

function eachleft(dyad, list, right, env) {
	return kmap(list, x => applydyad(dyad, x, right, env));
}

function eachprior(dyad, x, env) {
	var specials = {"+":k0, "*":k1, "-":k0, "&":first(x), ",":k(tLIST,[]), "%":k1};
	return eachpc(dyad, (dyad.v in specials) ? specials[dyad.v] : NA, x, env);
}

function stencil(monad, x, y, env) {
	return each(monad, call(winimpl, k(tLIST, [x,y]), env))
}

function eachpc(dyad, x, y, env) {
	return kmap(y, v => { var t=x; x=v; return applydyad(dyad, v, t, env); });
}

function over(dyad, x, env) {
	var specials = {"+":k0, "*":k1, "|":k(tNUMBER,-1/0), "&":k(tNUMBER,1/0)};
	if (x.t == tLIST && len(x) < 1 && dyad.v in specials) { return specials[dyad.v]; }
	if (x.t == tLIST && len(x) == 1 && dyad.v == ",") { return first(x).t != tLIST ? x : first(x); }
	if (x.t != tLIST || len(x) < 1) { return x; }
	return overd(dyad, first(x), drop(k1,x,env), env);
}

function overd(dyad, x, y, env) {
	return y.v.reduce((x, y) => applydyad(dyad, x, y, env), x);
}

function eacha(func, args, env) {
	var x = args[0]; var y = flip(k(tLIST, args.slice(1)), env);
	if (x.t != tLIST) { return kmap(y, y => call(func, concat(x, y), env)); }
	return kzip(x, y, (x, y) => call(func, concat(x, y), env));
}
function overa(func, args, env) {
	var x = args[0]; var y = flip(k(tLIST, args.slice(1)), env);
	return y.v.reduce((x, y) => call(func, concat(enlist(x), y), env), x);
}
function scana(func, args, env) {
	var x = args[0]; var y = flip(k(tLIST, args.slice(1)), env);
	return concat(x, kmap(y, y => x = call(func, concat(enlist(x), y), env)));
}

function fixed(monad, x, env) {
	var r=x, p=x;
	do { r=applymonad(monad, p=r, env); } while(!match(p, r).v && !match(r, x).v); return p;
}

function fixedwhile(monad, x, y, env) {
	if (x.t == tNUMBER) { for(var z=0;z<x.v;z++) { y = applymonad(monad, y, env); } }
	else { do { y = applymonad(monad, y, env); } while (applymonad(x, y, env).v); } return y;
}

function scan(dyad, x, env) {
	if (x.t != tLIST || len(x) <= 1) { return x; }
	var i = first(x); var r = enlist(i);
	kmap(drop(k1,x,env), z => { r.v.push(i = applydyad(dyad, i, z, env)); }); return r;
}

function scand(dyad, x, y, env) {
	return kmap(y, v => x = applydyad(dyad, x, v, env));
}

function scanfixed(monad, x, env) {
	var r=[x]; while(1) {
		var p = r[r.length-1]; var n = applymonad(monad, p, env);
		if (match(p, n).v || match(n, x).v) { break; } r.push(n);
	} return k(tLIST,r);
}

function scanwhile(monad, x, y, env) {
	var r=[y]; if (x.t == tNUMBER) { for(var z=0;z<x.v;z++) { r.push(y = applymonad(monad, y, env)); } }
	else { do { y = applymonad(monad, y, env); r.push(y); } while (applymonad(x, y, env).v != 0); }
	return k(tLIST, r);
}

////////////////////////////////////
//
//   Interpreter
//
////////////////////////////////////

function atomicmonad(f) { // create an atomic monad
	return function recur(x, env) {
		return x.t == tDICT ? dict(x.k, recur(x.v, env)) :
		       x.t == tLIST ? kmap(x, x => recur(x, env)) : f(x, env);
	};
}
function stringatomicmonad(f) { // create a string-atomic monad
	return function recur(x, env) {
		return x.t == tLIST && !x.v.every(x => x.t == tCHAR) ?
		       kmap(x, x => recur(x, env)) : f(x, env);
	}
}
function rightatomicdyad(f) { // create a right atomic dyad
	return function recur(x, y, env) {
		return y.t == tLIST ? kmap(y, z => recur(x, z, env)) : f(x, y, env);
	};
}
function atomicdyad(f) { // create an atomic dyad
	return function recur(x, y, env) {
		if (x.t == tDICT && y.t == tDICT) {
			var r=dict(k(tLIST,[]),k(tLIST,[])); kmap(unique(concat(x.k,y.k)), k => {
				var a=dget(x,k), b=dget(y,k); dset(r,k,a==NA?b:b==NA?a:recur(a,b,env));
			}); return r;
		}
		return x.t == tLIST && y.t == tLIST ? kzip(x, y, (a,b) => recur(a, b, env)) :
		       x.t == tDICT ? dict(x.k, recur(x.v, y, env)) :
		       y.t == tDICT ? dict(y.k, recur(x, y.v, env)) :
		       x.t == tLIST ? kmap(x, z => recur(z, y, env)) :
		       y.t == tLIST ? kmap(y, z => recur(x, z, env)) : f(x, y, env);
	};
}

function applymonad(verb, x, env) {
	if (verb.t == tFUNC) { return call(verb, enlist(x), env); }
	if (verb.t == tLIST) { return subscr(verb, x, env); }
	if (verb.t == tADVERB & verb.r == null) { verb.r=x; var r=run(verb, env); verb.r=null; return r; }
	if (verb.sticky) {
		var s=verb.sticky; s.r=x; verb.sticky=null;
		var r=run(verb, env); verb.sticky=s; s.r=null; return r;
	}
	return applyverb(verb, [x], env);
}

function applydyad(verb, x, y, env) {
	if (verb.t == tFUNC) { return call(verb, k(tLIST,[x,y]), env); }
	if (verb.sticky && verb.sticky != verb) {
		var s=verb.sticky; s.l=x; s.r=y; verb.sticky=null;
		var r=run(verb, env); verb.sticky=s; s.r=null; s.l=null; return r;
	}
	return applyverb(verb, [x, y], env);
}

export const sATOMICMONAD = 0, sLISTMONAD = 1,         sATOMICDYAD = 2,   sLISTATOMDYAD = 3, sATOMLISTDYAD = 4,   sLISTLISTDYAD = 5,         sTRIAD = 6, sTETRAD = 7;

var verbs = {
	//     a                   l                       a-a                l-a                a-l                  l-l                        triad    tetrad
	":" : [ident,              ident,                  rident,            rident,            rident,              rident,                    null,    null  ],
	"+" : [flip,               flip,                   atomicdyad(plus),  atomicdyad(plus),  atomicdyad(plus),    atomicdyad(plus),          null,    null  ],
	"-" : [atomicmonad(negate),atomicmonad(negate),    atomicdyad(minus), atomicdyad(minus), atomicdyad(minus),   atomicdyad(minus),         null,    null  ],
	"*" : [first,              first,                  atomicdyad(times), atomicdyad(times), atomicdyad(times),   atomicdyad(times),         null,    null  ],
	"%" : [atomicmonad(sqrt),  atomicmonad(sqrt),      atomicdyad(divide),atomicdyad(divide),atomicdyad(divide),  atomicdyad(divide),        null,    null  ],
	"!" : [iota,               odometer,               mod,               null,              rightatomicdyad(mod),dict,                      null,    null  ],
	"&" : [where,              where,                  atomicdyad(min),   atomicdyad(min),   atomicdyad(min),     atomicdyad(min),           null,    null  ],
	"|" : [rev,                rev,                    atomicdyad(max),   atomicdyad(max),   atomicdyad(max),     atomicdyad(max),           null,    null  ],
	"<" : [asc,                asc,                    atomicdyad(less),  atomicdyad(less),  atomicdyad(less),    atomicdyad(less),          null,    null  ],
	">" : [desc,               desc,                   atomicdyad(more),  atomicdyad(more),  atomicdyad(more),    atomicdyad(more),          null,    null  ],
	"=" : [identitymat,        group,                  atomicdyad(equal), atomicdyad(equal), atomicdyad(equal),   atomicdyad(equal),         null,    null  ],
	"~" : [atomicmonad(not),   atomicmonad(not),       match,             match,             match,               match,                     null,    null  ],
	"," : [enlist,             enlist,                 concat,            concat,            concat,              concat,                    null,    null  ],
	"^" : [nullish,            atomicmonad(nullish),   atomicdyad(fill),  except,            atomicdyad(fill),    except,                    null,    null  ],
	"#" : [count,              count,                  take,              reshape,           take,                reshape,                   null,    null  ],
	"_" : [atomicmonad(floor), atomicmonad(floor),     drop,              dictdrop,          drop,                cut,                       null,    null  ],
	"$" : [kfmt,               stringatomicmonad(kfmt),dfmt,              dfmt,              dfmt,                dfmt,                      null,    null  ],
	"?" : [real,               unique,                 rnd,               finde,             rnd,                 rightatomicdyad(finde),    splice,  null  ],
	"@" : [type,               type,                   subscr,            subscr,            subscr,              subscr,                    amend4,  amend4],
	"." : [keval,              keval,                  call,              call,              call,                call,                      dmend3,  dmend4],
	"'" : [null,               null,                   null,              binsearch,         null,                rightatomicdyad(binsearch),null,    null  ],
	"/" : [null,               null,                   null,              null,              pack,                pack,                      null,    null  ],
	"\\": [null,               null,                   null,              unpack,            split,               null,                      null,    null  ],
	"':": [null,               null,                   null,              null,              kwindow,             null,                      null,    null  ],
};

function applyverb(node, args, env) {
	if (node.curry) {
		var a=[]; var i=0; for(var z=0;z<node.curry.length;z++) {
			if (!isnull(node.curry[z]).v) { a[z]=run(node.curry[z], env); continue; }
			while(i<args.length && !args[i]) { i++; } if (!args[i]) { return node; }
			a[z]=args[i++];
		} args = a;
	}
	if (node.t == tADVERB) { return applyadverb(node, node.verb, args, env); }
	var left  = args.length == 2 ? args[0] : node.l ? run(node.l, env) : null;
	var right = args.length == 2 ? args[1] : args[0];
	if (!right) { return { t:node.t, v:node.v, curry:[left,k(tNIL)] }; }
	var r = null; var v = verbs[node.forcemonad ? node.v[0] : node.v];
	if (!v) {}
	else if (args.length == 3)            { r = v[6]; }
	else if (args.length == 4)            { r = v[7]; }
	else if (!left       && right.t != tLIST) { r = v[0]; }
	else if (!left       && right.t == tLIST) { r = v[1]; }
	else if (left.t != tLIST && right.t != tLIST) { r = v[2]; }
	else if (left.t == tLIST && right.t != tLIST) { r = v[3]; }
	else if (left.t != tLIST && right.t == tLIST) { r = v[4]; }
	else if (left.t == tLIST && right.t == tLIST) { r = v[5]; }
	if (!r) { throw new Error("invalid arguments to "+node.v); }
	return (args.length > 2) ? r(args, env) : left ? r(left, right, env) : r(right, env)
}

function valence(node, env) {
	if (node.t == tFUNC) {
		return (node.curry||[]).reduce((x,v) => x-!isnull(v).v, node.args.length);
	}
	if (node.t == tREF) { return valence(env.lookup(sym(node.v))); }
	if (node.t == tADVERB && node.v == "'") { return valence(node.verb, env); }
	if (node.t == tADVERB)       { return 1; }
	if (node.t != tVERB)       { return 0; }
	if (node.forcemonad)   { return 1; }
	if (node.v in natives) { return 1; }
	return (node.sticky && (node.sticky.t==tADVERB || node.sticky.forcemonad || node.sticky.l)) ? 1 : 2;
}

var adverbs = {
	//       mv/nv       dv          l-mv         l-dv       3+v
	"':"  : [null,       eachprior,  stencil,     eachpc,    null ],
	"'"   : [each,       eachd,      eachd,       eachd,     eacha],
	"/:"  : [null,       null,       eachright,   eachright, null ],
	"\\:" : [null,       null,       eachleft,    eachleft,  null ],
	"/"   : [fixed,      over,       fixedwhile,  overd,     overa],
	"\\"  : [scanfixed,  scan,       scanwhile,   scand,     scana],
};

function applyadverb(node, verb, args, env) {
	if (verb.t == tREF) { verb = run(verb, env); }
	var r = null; var v = valence(verb, env);
	if (v > 2)                 { return adverbs[node.v][4](verb, args, env); }
	if (v == 0 && verb.t != tFUNC) { return applyverb(k(tVERB,node.v), [verb, args[1]], env); }
	if (v == 0 && verb.t == tFUNC) { v = 1; }
	if (v == 2 && !args[1])    { args = [null, args[0]]; }
	if (v == 1 && !args[0])    { r = adverbs[node.v][0]; }
	if (v == 2 && !args[0])    { r = adverbs[node.v][1]; }
	if (v == 1 &&  args[0])    { r = adverbs[node.v][2]; }
	if (v == 2 &&  args[0])    { r = adverbs[node.v][3]; }
	if (!r) { throw new Error("invalid arguments to "+node.v+" ["+
		(args[0]?format(args[0])+" ":"")+" "+format(verb)+" (valence "+v+"), "+format(args[1])+"]");
	}
	return args[0] ? r(verb, args[0], args[1], env) : r(verb, args[1], env);
}

export class Environment {
    constructor(pred) {
        this.p = pred; this.d = dict(k(tLIST, []), k(tLIST, []));
    }
    put (n, g, v) {
        if (typeof n == "string") { n = sym(n); }
        if (g && this.p) { this.p.put(n, g, v); } else { dset(this.d, n, v); }
    }
    contains(x) { return findm(this.d.k, x).v != len(this.d.k); }
    lookup(n, g) {
        if (g && this.p) { return this.p.lookup(n, g); }
        if (!this.contains(n)) {
            if (!this.p) { throw new Error("the name '" + n.v + "' has not been defined."); }
            return this.p.lookup(n);
        }
        var view = dget(this.d, n);
        if (view.t == tVIEW) {
            var dirty = view.cache == 0, env = this;
            Object.keys(view.depends).forEach(z => {
                var n = (z == view.v) ? view.cache : env.lookup(sym(z)), o = view.depends[z];
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
	       x.t == tVERB || x.t == tADVERB ? applymonad(x, y, env) :
	       (x.t == tLIST || x.t == tDICT) && y.t == tLIST ? kmap(y, z => subscr(x, z)) :
	       x.t == tLIST ? (y.t > 1 || y.v < 0 || y.v >= len(x) || y.v%1 != 0) ? NA : x.v[y.v] :
	       x.t == tDICT ? dget(x, y) : call(x, enlist(y), env)
}

function atdepth(x, y, i, env) {
	if (i >= len(y)) { return x; }; var c = y.v[i]; var k = subscr(x, c, env);
	return (c.t != tNIL && c.t != tLIST) ?    atdepth(k, y, i+1, env) :
		   kmap(k, t => atdepth(t, y, i+1, env))
}

function call(x, y, env) {
	if (x.sticky) { return (valence(x.sticky, env)==1?applymonad:applydyad)(x, y.v[0], y.v[1], env); }
	if (x.t == tSYMBOL) { return call(env.lookup(x), y, env); }
	if (x.t == tLIST || x.t == tDICT) { return y.t == tLIST ? atdepth(x, y, 0, env) : subscr(x, y, env); }
	if (x.t == tVERB) { return applyverb(x, y.t == tLIST ? y.v : [y], env); }
	if (x.t == tADVERB) { return applyadverb(x, run(x.verb, env), y.v, env); }
	if (x.t != tFUNC) { throw new Error("function or list expected, found " + TN[x.t]+'.'); }
	if (y.t == tDICT) { var e=new Environment(null); e.d=y; x.env=e; return x; }
	if (y.t != tLIST) { y = enlist(y); }
	var environment = new Environment(x.env); var curry = x.curry?x.curry.concat([]):[];
	if (x.args.length != 0 || len(y) != 1 || !isnull(y.v[0]).v) {
		var all=true; var i=0; for(var z=0;z<x.args.length;z++) {
			if (curry[z] && !isnull(curry[z]).v) { continue; }
			if (i >= len(y)) { all=false; break; }
			if (y.v[i] == null || isnull(y.v[i]).v) { all=false; }
			curry[z]=y.v[i++];
		}
		if (!all) { return { t:tFUNC, v:x.v, args:x.args, env:x.env, curry:curry }; }
		if (i < len(y) && x.args.length != 0) { throw new Error("valence error."); }
		for(var z=0;z<x.args.length;z++) { environment.put(sym(x.args[z]), false, curry[z]); }
	}
	environment.put(sym("o"), false, x); return run(x.v, environment);
}

export function run(node, env) {
	if (node instanceof Array) { return node.reduce((_,x) => run(x, env), null); }
	if (node.sticky) { return node; }
	if (node.t == tLIST) { return rev(kmap(rev(node), v => run(v, env))); }
	if (node.t == tDICT) { return dict(node.k, kmap(node.v, x => run(x, env))); }
	if (node.t == tFUNC) {
		if (node.r) { return subscr(node, run(node.r, env), env); }
		if (!node.env) { return { t:tFUNC, v:node.v, args:node.args, curry:node.curry, env:env }; }
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
		for(var z=0;z<node.v.length-1;z+=2) {
			if (!kf(run(node.v[z], env))) { return run(node.v[z+1], env); }
		} return run(node.v[node.v.length-1], env);
	}
	if (node.t == tQUOTE) { return run(node.v, env); }
	return node;
}

function amend4(args, env) { return mend(args, env, amendm, amendd); }
function dmend3(args, env) { return args[0].t != tLIST ? trap(args, env) : dmend4(args, env); }
function dmend4(args, env) { return mend(args, env, dmend, dmend); }

function mend(args, env, monadic, dyadic) {
	var ds = deepclone(args[0]), i = args[1], f = args[2], y = args[3];
	(y?dyadic:monadic)(ds.t == tSYMBOL ? env.lookup(ds,true) : ds, i, y, f, env); return ds;
}

function amendm(d, i, y, monad, env) {
	if (monad.t == tNUMBER) { monad = { t:tFUNC,args:["x"],v:[{ t:tNUMBER, v:monad.v }] }; }
	if (i.t != tLIST) { lset(d, i, applymonad(monad, subscr(d, i, env), env)); }
	else { kmap(i, v => { amendm(d, v, y, monad, env); }); }
}

function amendd(d, i, y, dyad, env) {
	if (i.t == tLIST) { kmap(i, (iv, z) => { amendd(d, iv, y.t == tLIST ? y.v[z] : y, dyad, env) }); }
	else { (d.t == tDICT ? dset : lset)(d, i, applydyad(dyad, subscr(d, i, env), y, env)); }
}

function dmend(d, i, y, f, env) {
	if (i.t != tLIST) { (y?amendd:amendm)(d, i, y, f, env); return; }
	if (len(i) == 1) { dmend(d, i.v[0], y, f, env); return; }
	var rest = drop(k1,i,env); if (len(i)<1) { return; }
	if (i.v[0].t == tLIST) {
		if (y && y.t == tLIST) { kzip(i, y, (a, b) => { amendd(d, a, b, f, env); }); return; }
		kmap(i.v[0],x => { dmend(subscr(d,x,env), rest, y, f, env); });
	}
	else if (isnull(i.v[0]).v) { kmap(d,(x,i) => { dmend(subscr(d,k(tNUMBER,i),env),rest,y,f,env); }); }
	else if (d.t == tLIST && d.v[0].t != tLIST) { (y?amendd:amendm)(d, i, y, f, env); }
	else {
		var di=subscr(d, first(i), env);
		if(di.t!=tLIST) { (y?amendd:amendm)(d, i, y, f, env); return }
		dmend(di, rest, y, f, env);
	}
}

function trap(args, env) {
	try { return k(tLIST,[k0,call(args[0],enslist(args[1]))]) } catch(e) { return k(tLIST,[k1,strtokval(e.message)]) }
}

////////////////////////////////////
//
//   Tokenizer
//
////////////////////////////////////

var rNUMBER  = /^(-?0w|0N|-?\d+\.\d*|-?\d*\.?\d+)/;
var rHEXLIT  = /^0x[a-zA-Z\d]+/;
var rBOOL    = /^[01]+b/;
var rNAME    = /^[a-z][a-z\d]*/i;
var rSYMBOL  = /^`([a-z.][a-z0-9.]*)?/i;
var rSTRING  = /^"(\\.|[^"\\\r\n])*"/;
var rVERB    = /^[+\-*%!&|<>=~,^#_$?@.:]/;
var rASSIGN  = /^[+\-*%!&|<>=~,^#_$?@.]:/;
var rIOVERB  = /^\d:/;
var rADVERB  = /^['\\\/]:?/;
var rSEMI    = /^;/;
var rCOLON   = /^:/;
var rVIEW    = /^::/;
var rCOND    = /^\$\[/;
var rDICT    = /^\[[a-z]+:/i;
var rOPEN_B  = /^\[/;
var rOPEN_P  = /^\(/;
var rOPEN_C  = /^{/;
var rCLOSE_B = /^\]/;
var rCLOSE_P = /^\)/;
var rCLOSE_C = /^}/;

var des = {};
des[rNUMBER ]="number";des[rNAME   ]="name"   ;des[rSYMBOL ]="symbol";des[rSTRING]="string";
des[rVERB   ]="verb"  ;des[rIOVERB ]="IO verb";des[rADVERB ]="adverb";des[rSEMI  ]="';'";
des[rCOLON  ]="':'"   ;des[rVIEW   ]="view"   ;des[rCOND   ]="'$['"  ;
des[rOPEN_B ]="'['"   ;des[rOPEN_P ]="'('"    ;des[rOPEN_C ]="'{'"   ;des[rASSIGN]="assignment";
des[rCLOSE_B]="']'"   ;des[rCLOSE_P]="')'"    ;des[rCLOSE_C]="'}'";

var text = "";
var funcdepth = 0;
function begin(str) {
	str = str.replace(/("(?:[^"\\\n]|\\.)*")|(\s\/.*)|([a-z\d\]\)]-(?=\.?\d))/gi,(_,x,y,z) => {
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
	if (node instanceof Array) { node.forEach(v => { findNames(v, names); }); return names; }
	if (node.t == tREF)           { names[node.v] = 0; }
	if (node.t != tFUNC)           { findNames(node.v, names); }
	return findNames([node.l, node.r, node.verb, node.curry], names);
}

function atNoun() {
	return !done()&&at(rNUMBER)||at(rNAME)||at(rSYMBOL)||at(rSTRING)||at(rCOND)||at(rOPEN_P)||at(rOPEN_C);
}

function indexedassign(node, indexer) {
	var op = { t:tFUNC, args:["x","y"], v:[{ t:tREF, v:"y" }] }; // {y}
	var gl = matches(rCOLON);
	var ex = parseEx(parseNoun());
	//t[x]::z  ->  ..[`t;x;{y};z]   t[x]:z  ->  t:.[t;x;{y};z]
	if (!gl) { node.r = { t:tVERB, v:".", curry:[ k(tREF,node.v), k(tLIST,indexer), op, ex] }; return node; }
	return { t:tVERB, v:".", r:{ t:tVERB, v:".", curry:[sym(node.v), k(tLIST,indexer), op, ex] }};
}

function compoundassign(node, indexer) {
	if (!at(rASSIGN)) { return node; }
	var op = expect(rASSIGN).slice(0,1); var gl = matches(rCOLON); var ex = parseEx(parseNoun());
	if (!indexer) {
		// t+::z  -> t::(.`t)+z
		var v = gl ? asVerb(".", null, sym(node.v)) : node;
		return { t:node.t, v:node.v, global:gl, r:asVerb(op, v, ex) };
	}
	// t[x]+::z -> ..[`t;x;+:;z]   t[x]+:z -> t:.[t;x;{y};z]
	if (!gl) { node.r={ t:tVERB, v:".", curry:[ k(tREF,node.v),k(tLIST,indexer),asVerb(op),ex] }; return node; }
	return asVerb(".", null, { t:tVERB, v:".", curry:[sym(node.v), indexer, asVerb(op), ex] });
}

function applycallright(node) {
	while (matches(rOPEN_B)) {
		var args = parseList(rCLOSE_B); node = asVerb(".", node, k(tLIST, args.length ? args : [NIL]));
	} return node;
}

function applyindexright(node) {
	if (node.sticky && at(rVERB)) {
		var x = parseNoun(); x.l = node; x.r = parseEx(parseNoun()); return x;
	}
	while (matches(rOPEN_B)) { node = asVerb(".", node, k(tLIST, parseList(rCLOSE_B))); }
	return node;
}

function findSticky(root) {
	var n = root; if (n == null || (n.t == tADVERB && n.r == null)) { return; }
	while(n.t == tVERB && !n.curry || n.t == tADVERB) {
		if (n.r == null) { root.sticky = n; return; } n = n.r;
	}
}

function parseList(terminal, cull) {
	var r=[]; do {
		if (terminal && at(terminal)) { break; }
		while(matches(rSEMI)) { if (!cull) { r.push(k(tNIL)); } }
		var e = parseEx(parseNoun()); findSticky(e);
		if (e != null) { r.push(e); }
		else if (!cull) { r.push(k(tNIL)); }
	} while(matches(rSEMI)); if (terminal) { expect(terminal); } return r;
}

function parseNoun() {
	if (at(rIOVERB)) { return k(tVERB, expect(rIOVERB)); }
	if (at(rBOOL)) {
		var n = expect(rBOOL); var r=[];
		for(var z=0;z<n.length-1;z++) { r.push(k(tNUMBER, parseInt(n[z]))); }
		return applyindexright(k(tLIST, r));
	}
	if (at(rHEXLIT)) {
		var h=expect(rHEXLIT); if (h.length%2) { throw new Error("malformed byte string."); }
		var r=krange(h.length/2-1, z => k(tCHAR,parseInt(h.slice(2*z+2,2*z+4),16)));
		return (r.v.length == 1) ? first(r) : r;
	}
	if (at(rNUMBER)) {
		var r=[]; while(at(rNUMBER)) {
			var n=expect(rNUMBER); r.push(k(tNUMBER, n=="0w"?1/0:n=="-0w"?-1/0:n=="0N"?NaN:parseFloat(n)));
		} return applyindexright(wlist(r));
	}
	if (at(rSYMBOL)) {
		var r=[]; while(at(rSYMBOL)) { r.push(k(tSYMBOL, expect(rSYMBOL).slice(1))); }
		return applyindexright(wlist(r));
	}
	if (at(rSTRING)) {
		var str = expect(rSTRING); str = str.substring(1, str.length-1);
		for(var z=0;z<ESCAPE_PAIRS.length;z++) { str=str.split(ESCAPE_PAIRS[z][1]).join(ESCAPE_PAIRS[z][0]); }
		return applyindexright(strtokval(str));
	}
	if (matches(rOPEN_B)) {
		var m=dict(k(tLIST,[]), k(tLIST,[])); if (!matches(rCLOSE_B)) { do {
			var key = sym(expect(rNAME)); expect(rCOLON);
			dset(m, key, matches(rCOLON) ? dget(m, sym(expect(rNAME))) : parseEx(parseNoun()));
		} while(matches(rSEMI)); expect(rCLOSE_B); } return applyindexright(m);
	}
	if (matches(rOPEN_C)) {
		var args=[]; if (matches(rOPEN_B)) {
			do { args.push(expect(rNAME)); } while(matches(rSEMI)); expect(rCLOSE_B);
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
	if (matches(rOPEN_P)) { return applyindexright(wlist(parseList(rCLOSE_P))); }
	if (matches(rCOND))   { return k(tCOND, parseList(rCLOSE_B, true)); }
	if (at(rVERB)) {
		var r = k(tVERB, expect(rVERB));
		if (matches(rCOLON)) { r.v += ":"; r.forcemonad = true; }
		if (at(rOPEN_B) && !at(rDICT)) {
			expect(rOPEN_B); r.curry = parseList(rCLOSE_B, false);
			if (r.curry.length < 2 && !r.forcemonad) { r.curry.push(k(tNIL)); }
		} return r;
	}
	if (at(rNAME)) {
		var n = k(tREF, expect(rNAME));
		if (n.v in natives) { return applycallright(k(tVERB, n.v)); }
		if (funcdepth == 0 && matches(rVIEW)) {
			var r = k(tVIEW, n.v);
			r.r = parseEx(parseNoun());
			r.depends = findNames(r.r, {});
			r.cache = k(tNIL);
			return r;
		}
		if (matches(rCOLON)) {
			n.global = matches(rCOLON); n.r = parseEx(parseNoun());
			if (n.r == null) { throw new Error("noun expected following ':'."); }
			findSticky(n.r); if (n.r == n.r.sticky) { n.r.sticky = null; }
			return n;
		}
		if (matches(rOPEN_B)) {
			var index = parseList(rCLOSE_B);
			if (at(rASSIGN)) { return compoundassign(n, index); }
			if (matches(rCOLON)) { return indexedassign(n, index); }
			if (index.length == 0) { index = [NIL]; }
			n = asVerb(".", n, k(tLIST, index));
		}
		return applycallright(compoundassign(n, null));
	}
	return null;
}

function parseAdverb(left, verb) {
	var a = expect(rADVERB);
	while(at(rADVERB)) { var b = expect(rADVERB); verb = { t:tADVERB, v:a, verb:verb }; a = b; }
	if (at(rOPEN_B)) { return applycallright({ t:tADVERB, v:a, verb:verb, l:left }); }
	return { t:tADVERB, v:a, verb:verb, l:left, r:parseEx(parseNoun()) };
}

function parseEx(node) {
	if (node == null) { return null; }
	if (at(rADVERB)) { return parseAdverb(null, node); }
	if (node.t == tVERB && !node.r) {
		var p = at(rOPEN_P); var x = parseNoun();
		if (at(rADVERB) && valence(node) == 1) return parseAdverb(node, x)
		node.r = parseEx((p && x.t == tVERB) ? k(tQUOTE, x) : x); node.sticky = null;
	}
	if (atNoun() && !at(rIOVERB)) {
		var x = parseNoun();
		if (x.t == tREF && x.v in infix) { return asVerb(".", x, k(tLIST, [node, parseEx(parseNoun())])); }
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
	begin(" "+str); var r = parseList(null, false); if (done()) { return r; }
	throw new Error("unexpected character '"+text[0]+"'");
}

////////////////////////////////////
//
//   Prettyprinter
//
////////////////////////////////////

export function format(k, indent, symbol) {
	if (typeof indent == "number") { indent = ""; } if (k == null) { return ""; }
	function indented(k) { return format(k, indent+" "); };
	if (k instanceof Array) { return k.map(format).join(";"); }
	if (k.sticky) { var s=k.sticky; k.sticky=null; var r=format(k); k.sticky=s; return "("+r+")"; }
	if (k.t == tNUMBER) {
		return k.v==1/0?"0w":k.v==-1/0?"-0w":nanp(k)?"0N":
		""+(k.v % 1 == 0 ? k.v : Math.round(k.v * 10000) / 10000);
	}
	if (k.t == tCHAR) { return atomtostring(k,true); }
	if (k.t == tSYMBOL) { return (symbol==1?"":"`")+k.v; }
	if (k.t == tLIST) {
		if (len(k) <  1) { return "()"; }
		if (len(k) == 1) { return ","+format(k.v[0]); }
		var same = true; var sublist = false; indent = indent || "";
		for(var z=0;z<len(k);z++) { same &= k.v[z].t == k.v[0].t; sublist |= k.v[z].t == tLIST; }
		if (sublist) { return "("+k.v.map(indented).join("\n "+indent)+")"; }
		if (same & k.v[0].t == tCHAR) { return atomtostring(k, true); }
		if (same & k.v[0].t <  3) { return k.v.map(format).join(k.v[0].t == tSYMBOL ? "" : " "); }
		return "("+k.v.map(format).join(";")+")" ;
	}
	if (k.t == tDICT) {
		if (len(k.k)<1 || k.k.v.some(x => x.t != tSYMBOL))
		{ var t=format(k.k); if (len(k.k)==1) { t="("+t+")"; } return t+"!"+format(k.v); }
		return "["+kzip(k.k,k.v,(x,y) => {return x.v+":"+format(y);}).v.join(";")+"]";
	}
	if (k.t == tFUNC) {
		return "{"+(k.args.length?"["+k.args.join(";")+"]":"")+format(k.v)+"}" +
				(k.curry ? "["+format(k.args.map((x,i) => k.curry[i]))+"]" : "");
	}
	if (k.t == tVIEW) { return k.v+"::"+format(k.r); }
	if (k.t == tREF) { return k.v+(k.r?(k.global?"::":":")+format(k.r):""); }
	if (k.t == tVERB) {
		if (k.curry) { return k.v+"["+format(k.curry)+"]"+format(k.r); }
		var left = (k.l?format(k.l):""); if (k.l && k.l.l) { left = "("+left+")"; }
		return left+k.v+(k.r?format(k.r):"");
	}
	if (k.t == tADVERB) { return (k.l?format(k.l)+" ":"")+format(k.verb)+k.v+format(k.r); }
	if (k.t == tNIL) { return ""; }
	if (k.t == tCOND) { return "$["+format(k.v)+"]"; }
	if (k.t == tQUOTE) { return "("+format(k.v)+")"; }
}

// js natives and k natives:
export var natives = {"log":0,"exp":0,"cos":0,"sin":0};
var infix   = {"o":0,"in":0};
function nmonad(n, f) { verbs[n]=[f, atomicmonad(f), null,null,null,null,null,null]; }
export function baseEnv() {
	var env = new Environment(null);
	nmonad("log", x => k(tNUMBER, Math.log(numeric(x).v)));
	nmonad("exp", x => k(tNUMBER, Math.exp(numeric(x).v)));
	nmonad("cos", x => k(tNUMBER, Math.cos(numeric(x).v)));
	nmonad("sin", x => k(tNUMBER, Math.sin(numeric(x).v)));
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
	if (!(symbol in verbs)) { verbs[symbol]=[null,null,null,null,null,null]; }
	verbs[symbol][slot] = func;
}

export const version = "0.1";
