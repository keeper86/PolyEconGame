import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('i18n scan', () => {
    it('reports no untranslated UI text', () => {
        const output = execFileSync('node', [path.join(process.cwd(), 'tools/i18n_scan.cjs')], { encoding: 'utf8' });
        const total = Number(/TOTAL (\d+) in/.exec(output)?.[1] ?? NaN);
        expect(total).toBe(0);
    });
});
