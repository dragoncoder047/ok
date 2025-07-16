export type KValue = {
    t: number;
    v: any;
} & Record<string, any>;
export const tNUMBER = 0, tCHAR = 1, tSYMBOL = 2, tLIST = 3, tDICT = 4, tFUNC = 5, tVIEW = 6, tREF = 7, tVERB = 8, tADVERB = 9, tRETURN = 10, tNIL = 11, tCOND = 12, tQUOTE = 13;
export function k(t: number, v: any): KValue;
export function dict(k: KValue, v: KValue): KValue;
export function emptydict(): KValue;
export function len(l: KValue): number;
export function numeric(x: KValue): KValue;
export type Monad = (x: KValue, env: Environment) => KValue;
export type Dyad = (x: KValue, y: KValue, env: Environment) => KValue;
export type VarargFunc = (xs: KValue[], env: Environment) => KValue;
export function am(monad: Monad): Monad;
export function as(monad: Monad): Monad;
export function ar(dyad: Dyad): Dyad;
export function ad(dyad: Dyad): Dyad;
export const vtATOMICMONAD = 0, vtLISTMONAD = 1, vtATOMICDYAD = 2, vtLISTATOMDYAD = 3, vtATOMLISTDYAD = 4, vtLISTLISTDYAD = 5, vtTRIAD = 6, vtTETRAD = 7;
export const verbs: Record<string, [Monad | null, Monad | null, Dyad | null, Dyad | null, Dyad | null, Dyad | null, VarargFunc | null, VarargFunc | null]>;
export const atMONAD = 0, atDYAD = 1, atLISTMONAD = 2, atLISTDYAD = 3, atMANYARGS = 4;

export const adverbs: Record<string, unknown[]>;
export class Environment {
    p: Environment | null;
    d: KValue;
    constructor(parent: Environment | null);
    put(name: KValue | string, global: boolean, value: KValue): void;
    contains(name: KValue): boolean;
    lookup(name: KValue, global?: boolean): KValue;
}
export function run(exp: KValue, env: Environment): KValue;
export function done(): boolean;
export function parse(exp: string): KValue;
export function format(v: KValue, indent?: number | string, symbol?: boolean): string;
export const natives: Record<string, 0>;
export const builtinInfix: Record<string, 0>;
export function nmonad(name: string, impl: Monad): void;
export function baseEnv(): Environment;
export function setIO<T extends keyof (typeof verbs)[string]>(name: string, slot: T, func: (typeof verbs)[string][T]): void;
export const version: string;
