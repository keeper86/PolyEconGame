import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import scope from '../../tools/i18n_scan_scope.json';

const ROOT = process.cwd();
const TARGETS = ['src/app', 'src/components'];
const EXCLUDED_DIRS = scope.excludedDirsRelativeToSrc.map((dir) => `src/${dir}`);
const RAW_ERROR_MESSAGE_RE = /\.error\??\.message\b/;

const collect = (dir: string, out: string[]): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collect(full, out);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
};

describe('error message rendering', () => {
    it('renders errors through useErrorMessage instead of a raw error.message', () => {
        const offenders = TARGETS.flatMap((target) => collect(path.join(ROOT, target), []))
            .map((file) => path.relative(ROOT, file))
            .filter((rel) => !EXCLUDED_DIRS.some((dir) => rel.startsWith(dir)))
            .filter((rel) => RAW_ERROR_MESSAGE_RE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));

        expect(offenders).toEqual([]);
    });
});
