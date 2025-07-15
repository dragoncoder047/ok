#!/usr/bin/env node
import { setIO, format, baseEnv, run, parse, version } from './oK.js';
import { statSync as stat, readdirSync as readdir, readFileSync as slurp, readSync as readfd, writeFileSync as spit, writeSync as writefd } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { tojs, tok } from './convert.js';
var help = `oK has atom, list (2;\`c), dict \`a\`b!(2;\`c) and func {[x;y]x+y}
20 primitives/verbs, 6 operators/adverbs and 3 system functions

Verb       (unary)    Adverb             Noun         (null)
: gets                '  each            name  \`a\`b    \`
+ plus      flip      /  over|join       char  "ab"    " "
- minus     negate    \\  scan|split      num   2 .3    0N(nan) 0w(inf)
* times     first     ': eachprior       hex   0x2a2b
% divide    sqrt      /: eachright       bool  01000b
! mod|map   enum|key  \\: eachleft
& min|and   where
| max|or    reverse   System             list (2;3.4;\`ab)
< less      asc       0: file r/w        dict \`a\`b!(2;\`c)
> more      desc      1: json r/w        view f::32+1.8*c
= equal     group     5: printable form  func {[c]32+1.8*c}
~ match     not
, concat    enlist
^ fill|out  null                         \\t x   time
# take|rsh  count                        \\\\     exit
_ drop|cut  floor
$ cast|sum  string    $[c;t;f]     COND
? find|rnd  distinct  ?[x;I;[f;]y] insert
@ at        type      @[x;i;[f;]y] amend
. dot       eval|val  .[x;i;[f;]y] dmend

A manual of the oK language is available with more details:
    https://github.com/dragoncoder047/ok/blob/main/docs/Manual.md
A more general introduction to array programming is also provided:
    https://github.com/dragoncoder047/ok/blob/main/docs/Programming.md
`

// register I/O hooks
function str(x) { // convert a k string or symbol to a js string
	var s = tojs(x);
	if (typeof s !== 'string') { throw Error('ERROR: type'); }
	return s;
}
function readp(dt, x) {
	var f = str(x);
	var tojs;
	if (f) {
		f = resolve(process.cwd(), f);
		if (dt==0) {
			return tok(stat(f).isDirectory() ? readdir(f) : slurp(f, 'utf8').replace(/\r?\n$/, '').split(/\r?\n/));
		} else if (dt==1) {
			if (!stat(f).isDirectory()) 	{ tojs = slurp(f, 'utf8'); }
			else								{ throw Error("ERROR: Path '"+f+"' is a directory"); }
		}
	} else if (rl) {
		throw Error('ERROR: cannot read from stdin while in REPL');
	} else {
		var b = Buffer(128), b0, n = 0;
		while (readfd(process.stdin.fd, b, n, 1) && b[n] !== 10) {
			n++;
			if (n === b.length) { b0 = b; b = Buffer(2 * n); b0.copy(b, 0, 0, n); b0 = null; } // resize buffer when full
		}
		if 		(dt==0) { return tok(b.toString('utf8', 0, n)); }
		else if (dt==1) { tojs = b.toString('utf8', 0, n); }
	}
	if (tojs) {
		try 		{ return tok(JSON.parse(tojs)); }
		catch (err)	{ throw Error('JSON parsing error: ' + err.message); }
	}
}
function writep(dt, x, y) {
	var s = tojs(y);
	if (dt==0) {
		if (Array.isArray(s)) { s = s.join('\n') + '\n'; }
		if (typeof s !== 'string') { throw Error('ERROR: type'); }
	} else if (dt==1) {
		s = JSON.stringify(s);
	}
	var f = str(x);
	if (f) 	{ spit(resolve(process.cwd(), f), s); }
	else 	{ writefd(process.stdout.fd, s); }
	return y;
}
for (var i = 0; i < 2; i++) { setIO('0:', i, x => readp(0,x)); }
for (var i = 0; i < 2; i++) { setIO('1:', i, x => readp(1,x)); }
setIO('5:', 1, x => tok(format(x)));
for (var i = 2; i < 6; i++) { setIO('0:', i, (x,y) => writep(0,x,y)); }
for (var i = 2; i < 6; i++) { setIO('1:', i, (x,y) => writep(1,x,y)); }

var env = baseEnv();

// run user prelude file if exists
try {
	var preludeFile = homedir() + "/.config/okrc.k"
	var program = slurp(preludeFile, 'utf8');
	run(parse(program), env)
} catch (err) {
	if (err.code != 'ENOENT') throw err
}

// process filename.k as a command-line arg
if (process.argv.length > 2) {
	var program = slurp(process.argv[2], 'utf8');
	env.put('x', true, tok(process.argv.slice(3)))
	process.stdout.write(format(run(parse(program), env)) + '\n');
	process.exit(0);
}

// actual REPL
process.stdout.write(`oK v${version} (inspired by K5: http://kparc.com/k.txt; \\h for help)\n`);
var rl = createInterface({
	input:  process.stdin,
	output: process.stdout,
	completer(line) {
		var m = /[a-z][a-z\d]*$/i.exec(line);
		var prefix = m ? m[0] : '';
		var names = [];
		for (var e = env; e; e = e.p) { // iterate over ancestor environments
			for (var name in e.d) {
				if (name.slice(0, prefix.length) === prefix && names.indexOf(name) < 0) {
					names.push(name);
				}
			}
		}
		return [names, prefix];
	}
});
rl.on('line',  line => {
	if (line === '\\\\') { process.exit(0); }
	var showtime = false;
	var showhelp = false;
	if (line.lastIndexOf("\\t") == 0) {
		line = line.slice(2);
		showtime = true;
	} else if (line.lastIndexOf("\\h") == 0) {
		showhelp = true;
	}
	try {
		if (line.trim()) {
			if (!showhelp) {
				var starttime = new Date().getTime();
				var output = format(run(parse(line), env)) + '\n';
				if (showtime) {
					var endtime = new Date().getTime();
					output += "completed in "+(endtime-starttime)+"ms.\n";
				}
			} else {
				output = help;
			}
			process.stdout.write(output);
		}
	} catch (err) { process.stdout.write(err.message + '\n'); }
	rl.prompt();
});
rl.on('close', () => { process.stdout.write('\n'); process.exit(0); });
rl.setPrompt(' '); rl.prompt();
