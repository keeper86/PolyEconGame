/**
 * workerBundle.test.ts
 *
 * Smoke-tests the production worker bundle produced by trace-worker.mjs.
 *
 * What it checks:
 *  1. esbuild can bundle worker.ts without errors (no missing modules at
 *     bundle time).
 *  2. The resulting .mjs can be imported by Node (via a child-process
 *     `node --input-type=module` eval) without any "Cannot find package"
 *     or "Dynamic require" runtime errors.
 *
 * This catches the class of bug where a package is listed as `external`
 * in trace-worker.mjs but is NOT present in the standalone node_modules —
 * e.g. dotenv being external while Next.js doesn't trace it.
 *
 * The test intentionally does NOT start the actual simulation loop; it
 * just verifies that all imports in the bundle resolve at startup.
 *
 * Run via:  npm run test:worker
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — mirror the logic in trace-worker.mjs so the test is independent
// of the actual postbuild script state.
// ---------------------------------------------------------------------------

/** Repo root — two levels up from src/simulation/ */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKER_ENTRY = path.join(REPO_ROOT, 'src/simulation/worker.ts');

/**
 * Same knexfile-rewrite plugin as in trace-worker.mjs.
 * Rewrites `../../knexfile.js` to the copy we place next to the bundle.
 */
function makeKnexfilePlugin(bundleDir: string) {
    return {
        name: 'knexfile-rewrite',
        setup(b: import('esbuild').PluginBuild) {
            b.onResolve({ filter: /\.\.\/\.\.\/knexfile\.js$/ }, () => ({
                path: path.join(bundleDir, 'knexfile.js'),
                external: true,
            }));
        },
    };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('worker production bundle', () => {
    let tmpDir: string;
    let bundlePath: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-bundle-test-'));
        bundlePath = path.join(tmpDir, 'worker.mjs');

        // Copy knexfile next to the bundle (mirrors what trace-worker.mjs does)
        // so the rewritten import resolves correctly at import-time.
        await fs.copyFile(path.join(REPO_ROOT, 'knexfile.js'), path.join(tmpDir, 'knexfile.js'));
    });

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('bundles without esbuild errors', async () => {
        const result = await build({
            entryPoints: [WORKER_ENTRY],
            bundle: true,
            platform: 'node',
            target: 'node24',
            format: 'esm',
            outfile: bundlePath,
            // Must exactly mirror the `external` list in trace-worker.mjs.
            // If you add/remove entries there, update this list too — the
            // test will then fail if the package is missing from node_modules.
            external: ['knex'],
            plugins: [makeKnexfilePlugin(tmpDir)],
            logLevel: 'silent',
            write: true,
        });

        expect(result.errors, 'esbuild produced errors').toHaveLength(0);

        const stat = await fs.stat(bundlePath);
        expect(stat.size, 'bundle should not be empty').toBeGreaterThan(0);
    });

    it('all imports in the bundle resolve at runtime (no missing packages)', async () => {
        // We run a short Node script that imports the bundle and immediately
        // exits.  The worker's default export starts the tick loop, so we
        // intercept module load errors before the export is ever called.
        //
        // We set NODE_ENV=production so knexfile.js skips the dotenv.config()
        // call (no .env file exists in the tmp dir) and DATABASE_URL to a
        // dummy value so the knex config object is non-null.
        //
        // We DON'T actually invoke the default export — just importing the
        // module is enough to surface any "Cannot find package X" errors.
        const script = `import ${JSON.stringify(bundlePath)}; process.exit(0);`;

        const result = spawnSync(process.execPath, ['--input-type=module'], {
            input: script,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
                // Make sure node_modules from the repo are on the path so
                // external packages (knex) can be resolved.
                NODE_PATH: path.join(REPO_ROOT, 'node_modules'),
            },
            timeout: 15_000,
            encoding: 'utf8',
        });

        const stderr = result.stderr ?? '';
        const exitCode = result.status;

        // Fail with a readable message that names the missing package.
        expect(stderr, `bundle import failed (exit ${exitCode}):\n${stderr}`).not.toMatch(
            /Cannot find package|Cannot find module|Dynamic require|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM/,
        );

        expect(exitCode, `bundle import exited with non-zero code:\n${stderr}`).toBe(0);
    });
});
