import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKER_ENTRY = path.join(REPO_ROOT, 'src/simulation/worker.ts');

function makeKnexfilePlugin(_bundleDir: string) {
    return {
        name: 'knexfile-inline',
        setup(b: import('esbuild').PluginBuild) {
            b.onResolve({ filter: /\.\.\/\.\.\/knexfile\.js$/ }, (args) => ({
                path: path.resolve(path.dirname(args.importer), args.path),
            }));
            b.onResolve({ filter: /^dotenv(-expand)?$/ }, (args) => ({
                path: args.path,
                namespace: 'dotenv-stub',
            }));
            b.onLoad({ filter: /.*/, namespace: 'dotenv-stub' }, () => ({
                contents: 'export default {}; export const config = () => ({}); export const expand = () => ({});',
                loader: 'js' as const,
            }));
        },
    };
}

describe('worker production bundle', () => {
    let tmpDir: string;
    let bundlePath: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-bundle-test-'));
        bundlePath = path.join(tmpDir, 'worker.mjs');
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
        const script = `import ${JSON.stringify(bundlePath)}; process.exit(0);`;

        const result = spawnSync(process.execPath, ['--input-type=module'], {
            input: script,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                DATABASE_URL: 'postgresql://test:test@localhost:5432/test',

                NODE_PATH: path.join(REPO_ROOT, 'node_modules'),
            },
            timeout: 15_000,
            encoding: 'utf8',
        });

        const stderr = result.stderr ?? '';
        const exitCode = result.status;

        expect(stderr, `bundle import failed (exit ${exitCode}):\n${stderr}`).not.toMatch(
            /Cannot find package|Cannot find module|Dynamic require|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM/,
        );

        expect(exitCode, `bundle import exited with non-zero code:\n${stderr}`).toBe(0);
    });
});
