// TypeScript's Node resolver does not understand Deno's npm: scheme; the runtime hook resolves the same package.
declare module "npm:hono@4" {
  export { Hono } from "hono";
  export type { Context, Next } from "hono";
}
