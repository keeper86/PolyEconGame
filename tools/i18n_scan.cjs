const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src');
const EXCLUDED_DIRS = ['app/simulation', 'app/supply-chain'];
const TEXT_ATTRS = new Set([
    'label',
    'title',
    'placeholder',
    'alt',
    'description',
    'emptyText',
    'tooltip',
    'helpText',
    'message',
    'caption',
    'heading',
    'legend',
    'subtitle',
    'text',
    'confirmLabel',
    'cancelLabel',
    'actionLabel',
]);

const collect = (dir, out) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full, out);
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
};

const isExcluded = (rel) => EXCLUDED_DIRS.some((dir) => rel.startsWith(dir));

const findText = (file) => {
    const rel = path.relative(target, file);
    const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const hits = [];
    const add = (node, kind, value) => {
        const text = value.replace(/\s+/g, ' ').trim();
        if (!text || /^[\W_0-9]+$/.test(text)) return;
        hits.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, text });
    };
    const visit = (node) => {
        if (ts.isJsxText(node)) add(node, 'text', node.text);
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
            const name = node.name.text;
            const init = node.initializer;
            const isText = TEXT_ATTRS.has(name) || name === 'aria-label' || name === 'aria-description';
            if (isText && init && ts.isStringLiteral(init)) add(node, name, init.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return { rel, hits };
};

const results = collect(target, [])
    .filter((file) => !/\.test\.|\.spec\./.test(file))
    .map((file) => ({ file, rel: path.relative(target, file) }))
    .filter(({ rel }) => !isExcluded(rel))
    .map(({ file }) => findText(file))
    .filter(({ hits }) => hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

let total = 0;
for (const { rel, hits } of results) {
    total += hits.length;
    process.stdout.write(`\n${rel} (${hits.length})\n`);
    for (const hit of hits) process.stdout.write(`  L${hit.line} [${hit.kind}] ${JSON.stringify(hit.text)}\n`);
}
process.stdout.write(`\nTOTAL ${total} in ${results.length} files\n`);
