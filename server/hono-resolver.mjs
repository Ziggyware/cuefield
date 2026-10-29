// Val Town resolves npm: imports itself. Node resolves the same Hono 4 dependency from package.json.
export function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === "npm:hono@4" ? "hono" : specifier, context);
}
