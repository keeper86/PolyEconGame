const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src');
const EXCLUDED_DIRS = ['app/simulation', 'app/supply-chain'];
const DEBUG_FILES = new Set(['FacilitiesMaintenanceDebug.tsx']);
const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'loading', 'message', 'custom']);
const LABEL_ATTRS = new Set(['pendingLabel', 'actionLabel', 'errorLabel', 'loadingLabel', 'emptyLabel']);

const collect = (dir, out) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full, out);
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
};

const isExcluded = (rel) =>
    EXCLUDED_DIRS.some((dir) => rel.startsWith(dir)) || [...DEBUG_FILES].some((file) => rel.endsWith(file));

const unwrap = (node) => {
    let current = node;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    return current;
};

const isTranslatable = (text) => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed || /^[\W_0-9]+$/.test(trimmed)) return false;
    if (/^(&#?\w+;|\u00a0|\s)+$/.test(trimmed)) return false;
    if (trimmed === 'true' || trimmed === 'false') return false;
    if (/^(text-|bg-|border-|fill-|stroke-|hover:|dark:)/.test(trimmed)) return false;
    if (trimmed.includes('/') && !trimmed.includes(' ')) return false;
    return true;
};

const reportLiteral = (hits, node, source, kind, literal) => {
    if (!isTranslatable(literal.text)) return;
    hits.push({
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        kind,
        text: literal.text.replace(/\s+/g, ' ').trim(),
    });
};

const findLiterals = (file) => {
    const rel = path.relative(target, file);
    const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const hits = [];

    const reportConditional = (node) => {
        const expr = unwrap(node);
        if (ts.isStringLiteral(expr)) {
            reportLiteral(hits, node, source, 'jsx-literal', expr);
            return;
        }
        if (ts.isConditionalExpression(expr)) {
            for (const branch of [expr.whenTrue, expr.whenFalse]) {
                const inner = unwrap(branch);
                if (ts.isStringLiteral(inner)) reportLiteral(hits, branch, source, 'jsx-ternary', inner);
            }
            return;
        }
        if (ts.isBinaryExpression(expr) && ts.isStringLiteral(unwrap(expr.right))) {
            reportLiteral(hits, expr.right, source, 'jsx-logical', unwrap(expr.right));
        }
    };

    const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const callee = node.expression;
            if (
                ts.isIdentifier(callee.expression) &&
                callee.expression.text === 'toast' &&
                TOAST_METHODS.has(callee.name.text) &&
                node.arguments.length > 0 &&
                ts.isStringLiteral(unwrap(node.arguments[0]))
            ) {
                reportLiteral(hits, node.arguments[0], source, 'toast', unwrap(node.arguments[0]));
            }
        }
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && LABEL_ATTRS.has(node.name.text)) {
            const init = node.initializer;
            if (init && ts.isStringLiteral(init)) reportLiteral(hits, node, source, node.name.text, init);
        }
        if (
            node.kind === ts.SyntaxKind.JsxExpression &&
            node.expression &&
            !(node.parent && ts.isJsxAttribute(node.parent))
        ) {
            reportConditional(node.expression);
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
    .map(({ file }) => findLiterals(file))
    .filter(({ hits }) => hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

let total = 0;
for (const { rel, hits } of results) {
    total += hits.length;
    process.stdout.write(`\n${rel} (${hits.length})\n`);
    for (const hit of hits) process.stdout.write(`  L${hit.line} [${hit.kind}] ${JSON.stringify(hit.text)}\n`);
}
process.stdout.write(`\nTOTAL ${total} in ${results.length} files\n`);
