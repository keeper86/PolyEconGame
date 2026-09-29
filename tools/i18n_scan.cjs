const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src');
const scope = require('./i18n_scan_scope.json');
const EXCLUDED_DIRS = scope.excludedDirsRelativeToSrc;
const DEBUG_FILES = new Set(scope.excludedFileSuffixes);
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

const isDebugFile = (rel) => [...DEBUG_FILES].some((file) => rel.endsWith(file));

const DEBUG_MARKERS = new Set(['TEMP DEBUG']);
const isEntityOnly = (text) => /^(&#?\w+;|\u00a0|\s)+$/.test(text);

const staticTextOf = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
        return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
    }
    return null;
};

const staticTextsOf = (node) => {
    if (!node) return [];
    if (ts.isConditionalExpression(node)) return [...staticTextsOf(node.whenTrue), ...staticTextsOf(node.whenFalse)];
    if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
            node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
        return staticTextsOf(node.right);
    }
    const text = staticTextOf(node);
    return text === null ? [] : [text];
};

const isDataKey = (text) => /^[a-z][a-zA-Z0-9_-]*$/.test(text);

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
        if (!text || /^[\W_0-9]+$/.test(text) || isEntityOnly(text) || DEBUG_MARKERS.has(text)) return;
        hits.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, text });
    };
    const visit = (node) => {
        if (ts.isJsxText(node)) add(node, 'text', node.text);
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
            const name = node.name.text;
            const init = node.initializer;
            const isText = TEXT_ATTRS.has(name) || name === 'aria-label' || name === 'aria-description';
            if (init) {
                const expr = ts.isJsxExpression(init) ? init.expression : init;
                if (isText) {
                    for (const text of staticTextsOf(expr)) add(node, name, text);
                } else if (name === 'name') {
                    const value = staticTextOf(expr);
                    if (value !== null && !isDataKey(value.trim())) add(node, name, value);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return { rel, hits };
};

const results = collect(target, [])
    .filter((file) => !/\.test\.|\.spec\./.test(file))
    .map((file) => ({ file, rel: path.relative(target, file) }))
    .filter(({ rel }) => !isExcluded(rel) && !isDebugFile(rel))
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
