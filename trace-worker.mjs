/**
 * trace-worker.mjs
 *
 * Bundles the simulation worker (src/simulation/worker.ts) into a single
 * self-contained JavaScript file using esbuild.
 *
 * In production (Docker):
 *   Run by the dedicated `worker-builder` Dockerfile stage, which installs
 *   only the minimal dependencies listed in simulation.package.json.
 *   Output is placed in .next/standalone/ and copied into the final image.
 *
 * In local development / CI (npm run build):
 *   Still invoked via the `postbuild` npm script after `next build` so that
 *   a local standalone build also gets a correctly bundled worker.
 *
 * Why bundling is necessary:
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
 *   @msgpack/msgpack, dotenv, dotenv-expand) are inlined into the bundle,
 *   including knexfile.js itself (so its dotenv imports are satisfied at
 *   bundle time and no loose knexfile.js is needed in the production image).
 *   Only knex is kept external — it is in serverExternalPackages and
 *   therefore already traced by Next.js into the standalone node_modules.
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
 * esbuild plugin that resolves the `import('../../knexfile.js')` dynamic
 * import in worker.ts to the actual knexfile.js path on disk so that
 * esbuild can bundle it (and its dotenv/dotenv-expand dependencies) inline.
 *
 * Previously knexfile.js was kept external and copied next to the bundle,
 * but that caused a hard failure in production because dotenv/dotenv-expand
 * are not present in the standalone node_modules and the top-level ESM
 * import statements in knexfile.js cannot be guarded by a runtime check.
 * Inlining knexfile.js into the bundle resolves the issue: esbuild bundles
 * knexfile.js and its dotenv/dotenv-expand dependencies directly into the
 * worker output, so no loose knexfile.js or dotenv modules are needed and
 * the runtime is not required to resolve those files from node_modules.
 */
const knexfilePlugin = {
    name: 'knexfile-inline',
    setup(build) {
        // Rewrite the `../../knexfile.js` specifier to the real absolute
        // path so esbuild can find and bundle the file.
        build.onResolve({ filter: /\.\.\/\.\.\/knexfile\.js$/ }, (args) => ({
            path: path.resolve(path.dirname(args.importer), args.path),
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
        // Worker-only packages (immutable, @msgpack/msgpack, dotenv,
        // dotenv-expand) are inlined — including those transitively pulled in
        // by knexfile.js, which is also bundled inline (see knexfilePlugin).
        external: ['knex'],

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

    const stat = await fs.stat(path.join(cwd, BUNDLE_OUTPUT));
    console.log(`[trace-worker] Done — bundled worker at ${BUNDLE_OUTPUT} (${(stat.size / 1024).toFixed(1)} KB).`);
}

main().catch((err) => {
    console.error('[trace-worker] Fatal:', err);
    process.exit(1);
});
