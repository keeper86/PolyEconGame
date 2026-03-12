import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest config for the simulation worker bundle smoke-tests.
 *
 * Runs in a Node environment (no jsdom) with no browser-specific setup
 * files, so esbuild and child_process work correctly.
 *
 * Usage:
 *   npm run test:worker
 *   npx vitest run --config vitest.worker.config.ts
 */
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        include: ['src/simulation/workerBundle.test.ts'],
        environment: 'node',
        globals: true,
        typecheck: {
            tsconfig: './tsconfig.json',
        },
        // No jsdom setup file — this suite only tests the build artifact.
        setupFiles: [],
        // esbuild can take a few seconds; give it room.
        testTimeout: 30_000,
    },
});
