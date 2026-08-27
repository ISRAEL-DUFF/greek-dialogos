/**
 * Vercel serverless entry point.
 *
 * The ".js" extension is required and must not be removed. package.json sets
 * "type": "module", so Vercel's compiled output is ESM — and Node ESM performs
 * no extension inference. Vercel compiles these files without bundling them,
 * so an extensionless specifier survives into the output and fails to resolve
 * at runtime:
 *
 *   Cannot find module '/var/task/server' imported from /var/task/api/index.js
 *
 * TypeScript maps the ".js" specifier back to the ".ts" source, and Vite and
 * tsx both resolve it too — which is why this only ever failed once deployed.
 */
import app from "../server.js";

export default app;
