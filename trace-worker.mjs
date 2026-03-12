/**
 * trace-worker.mjs
 *
 * Bundles the simulation worker (src/simulation/worker.ts) into a single
 * self-contained JavaScript file inside `.next/standalone/` using esbuild.
 *
 * Why this is necessary:
 *   `output: "standalone"` only traces modules reachable from Next.js's
 *   own server entry points.  The Piscina worker is loaded via a dynamic
 *   `filename` string at runtime, so its dependency graph is invisible
 *   to the tracer.
 *
 *   Node 24's native type-stripping can parse .ts files but does NOT
 *   rewrite extensionless imports (e.g. `from './gameSnapshotRepository'`).
 *   Without a loader like tsx (unavailable in the slim standalone output),
 *   the ESM resolver cannot find these modules.
 *
 *   The solution: bundle all local TypeScript sources into one .mjs file
 *   at build time.  Packages that only the worker uses (immutable,
 *   @msgpack/msgpack) are inlined into the bundle.  Packages that
 *   Next.js already traced into the standalone node_modules (knex,
 *   dotenv, dotenv-expand) are kept external.
 *
 * Run automatically via the `postbuild` npm script.
 */

import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const STANDALONE_DIR = '.next/standalone';
const WORKER_ENTRY = 'src/simulation/worker.ts';
const BUNDLE_OUTPUT = path.join(STANDALONE_DIR, 'worker.mjs');

/**
 * esbuild plugin that rewrites the `import('../../knexfile')` import
 * in worker.ts to `./knexfile.js` — the correct path relative to
 * the bundled output at `.next/standalone/worker.mjs`.
 */
const knexfilePlugin = {
    name: 'knexfile-rewrite',
    setup(build) {
        // Intercept the bare `../../knexfile` specifier used in worker.ts.
        build.onResolve({ filter: /\.\.\/\.\.\/knexfile$/ }, () => ({
            path: './knexfile.js',
            external: true,
        }));
    },
};

async function main() {
    const cwd = process.cwd();
    const standaloneDir = path.join(cwd, STANDALONE_DIR);

    // Verify that the standalone output exists (i.e. `next build` ran first).
    try {
        await fs.access(standaloneDir);
    } catch {
        console.error(`[trace-worker] ${STANDALONE_DIR} not found — did "next build" run?`);
        process.exit(1);
    }

    console.log(`[trace-worker] Bundling ${WORKER_ENTRY} with esbuild …`);

    const result = await build({
        entryPoints: [WORKER_ENTRY],
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'esm',
        outfile: BUNDLE_OUTPUT,

        // Only keep packages external that Next.js already traced into the
        // standalone node_modules (via serverExternalPackages in next.config.js).
        // Worker-only packages (immutable, @msgpack/msgpack) are inlined.
        external: ['knex', 'dotenv', 'dotenv-expand'],

        plugins: [knexfilePlugin],

        // Source maps for debuggability in production logs.
        sourcemap: true,

        // Silence non-critical warnings (e.g. dynamic require patterns).
        logLevel: 'warning',
    });

    if (result.errors.length > 0) {
        console.error('[trace-worker] esbuild errors:', result.errors);
        process.exit(1);
    }

    // Copy knexfile.js next to the bundle so the rewritten
    // require('./knexfile.js') resolves at runtime.
    const knexSrc = path.join(cwd, 'knexfile.js');
    const knexDst = path.join(standaloneDir, 'knexfile.js');
    try {
        await fs.copyFile(knexSrc, knexDst);
        console.log('[trace-worker] Copied knexfile.js into standalone.');
    } catch (err) {
        console.warn('[trace-worker] Could not copy knexfile.js:', err.message);
    }

    const stat = await fs.stat(path.join(cwd, BUNDLE_OUTPUT));
    console.log(`[trace-worker] Done — bundled worker at ${BUNDLE_OUTPUT} (${(stat.size / 1024).toFixed(1)} KB).`);
}

main().catch((err) => {
    console.error('[trace-worker] Fatal:', err);
    process.exit(1);
});
