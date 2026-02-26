import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./tests/vitest/setup.ts'],
        globals: true,
        typecheck: {
            tsconfig: './tsconfig.json',
        },
        env: {
            NODE_ENV: 'test',
        },
        environmentOptions: {
            jsdom: {
                resources: 'usable',
            },
        },
        exclude: [
            'src/server/**',
            '**/node_modules/**',
            '**/dist/**',
            '**/cypress/**',
            '**/.{idea,git,cache,output,temp}/**',
            '**/tests/e2e/**', // Exclude Playwright e2e tests
        ],
    },
});
