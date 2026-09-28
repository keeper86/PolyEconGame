import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const runScan = (script: string): number => {
    const output = execFileSync('node', [path.join(process.cwd(), 'tools', script)], { encoding: 'utf8' });
    return Number(/TOTAL (\d+) in/.exec(output)?.[1] ?? NaN);
};

describe('i18n scan', () => {
    it('reports no untranslated JSX text', () => {
        expect(runScan('i18n_scan.cjs')).toBe(0);
    });

    it('reports no untranslated literals', () => {
        expect(runScan('i18n_scan_literals.cjs')).toBe(0);
    });
});
