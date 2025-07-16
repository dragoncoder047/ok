import { KValue, Environment } from "./oK.js";
export function tok(v: any): KValue;
export function tojs(V: KValue): any;
export function trampoline(env: Environment, name: string, args: string[]): void;

