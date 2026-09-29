import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCAN_DIRS = ['src/app', 'src/components'];

const collect = (dir: string, out: string[]): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collect(full, out);
        } else if (entry.name.endsWith('.tsx') && !/\.(test|spec)\./.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
};

const DATA_TOUR_ATTR_RE = /(?:data-tour|dataTour)'?\s*[:=]\s*/g;
const QUOTED_RE = /^\s*(?:'([^']+)'|"([^"]+)")/;
const TEMPLATE_RE = /^\s*`([^`$]*)\$\{/;
const EXPRESSION_RE = /^\s*\{([^}]*)\}/;

const renderedTourNames = (files: string[]): Set<string> => {
    const names = new Set<string>();
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        for (const match of text.matchAll(DATA_TOUR_ATTR_RE)) {
            const rest = text.slice((match.index ?? 0) + match[0].length);

            const quoted = rest.match(QUOTED_RE);
            if (quoted) {
                names.add((quoted[1] ?? quoted[2]) as string);
                continue;
            }

            const template = rest.match(TEMPLATE_RE);
            if (template) {
                names.add(`${template[1]}*`);
                continue;
            }

            const expression = rest.match(EXPRESSION_RE);
            if (expression) {
                for (const literal of expression[1].matchAll(/'([^']+)'|"([^"]+)"/g)) {
                    names.add((literal[1] ?? literal[2]) as string);
                }
                const innerTemplate = expression[1].match(/`([^`$]*)\$\{/);
                if (innerTemplate) {
                    names.add(`${innerTemplate[1]}*`);
                }
            }
        }
    }
    return names;
};

const tourTargetNames = (): string[] => {
    const text = fs.readFileSync(path.join(ROOT, 'src/components/tour/tourSteps.ts'), 'utf8');
    const names: string[] = [];
    for (const match of text.matchAll(/target:\s*'\[data-tour="([^"]+)"\][^']*'/g)) {
        names.push(match[1]);
    }
    return names;
};

const isCovered = (name: string, rendered: Set<string>): boolean => {
    if (rendered.has(name)) {
        return true;
    }
    for (const entry of rendered) {
        if (entry.endsWith('*') && name.startsWith(entry.slice(0, -1))) {
            return true;
        }
    }
    return false;
};

describe('tour targets', () => {
    it('has a matching data-tour attribute in the UI for every tour step target', () => {
        const files = SCAN_DIRS.flatMap((dir) => collect(path.join(ROOT, dir), []));
        const rendered = renderedTourNames(files);
        const missing = tourTargetNames().filter((name) => !isCovered(name, rendered));

        expect(missing).toEqual([]);
    });
});
