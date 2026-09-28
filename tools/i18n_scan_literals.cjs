const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src');
const EXCLUDED_DIRS = ['app/simulation', 'app/supply-chain', 'server', 'app/api'];
const DEBUG_FILES = new Set(['FacilitiesMaintenanceDebug.tsx']);
const KEY_REF_FILES = new Set(['lib/appRoutes.ts']);
const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'loading', 'message', 'custom']);
const TEXT_ATTRS = new Set([
    'label',
    'title',
    'tooltip',
    'description',
    'message',
    'heading',
    'placeholder',
    'alt',
    'caption',
    'subtitle',
    'legend',
    'helpText',
    'emptyText',
    'text',
    'confirmLabel',
    'cancelLabel',
    'actionLabel',
    'pendingLabel',
    'errorLabel',
    'loadingLabel',
    'emptyLabel',
    'aria-label',
    'aria-description',
]);
const TEXT_KEYS = new Set([
    'label',
    'labels',
    'text',
    'title',
    'message',
    'description',
    'placeholder',
    'heading',
    'caption',
    'subtitle',
    'legend',
    'tooltip',
    'helpText',
    'emptyText',
    'alt',
    'confirmLabel',
    'cancelLabel',
    'actionLabel',
    'pendingLabel',
    'errorLabel',
    'loadingLabel',
    'emptyLabel',
]);
const TEXT_SUFFIX_RE = /(?:Labels?|Text|Title|Message|Description|Placeholder|Caption|Subtitle|Heading|Legend|Tooltip)$/;
const MAP_NAME_RE = /(LABELS?|_TEXTS?|_NAMES|_POOL|_STEPS)$/;
const SKIP_DECLARATIONS = new Set(['PLANET_NAMES', 'FACILITY_LEVEL_LABELS', 'STORAGE_SHELL_FORM_NAMES']);

const collect = (dir, out) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full, out);
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
};

const isExcluded = (rel) =>
    EXCLUDED_DIRS.some((dir) => rel.startsWith(dir)) ||
    [...DEBUG_FILES, ...KEY_REF_FILES].some((file) => rel.endsWith(file));

const enMessages = JSON.parse(fs.readFileSync(path.join(root, 'messages/en.json'), 'utf8'));
const collectLeafKeys = (value, out) => {
    for (const [key, child] of Object.entries(value)) {
        if (typeof child === 'string') out.add(key);
        else if (child && typeof child === 'object') collectLeafKeys(child, out);
    }
    return out;
};
const LEAF_KEYS = collectLeafKeys(enMessages, new Set());

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
    if (/^[a-z]$/i.test(trimmed)) return false;
    if (/^(text-|bg-|border-|fill-|stroke-|hover:|dark:)/.test(trimmed)) return false;
    if (trimmed.includes('/') && !trimmed.includes(' ')) return false;
    if (trimmed.includes('[') || trimmed.includes(']')) return false;
    if (/^[a-z]+([A-Z][a-zA-Z0-9]*)+$/.test(trimmed)) return false;
    if (/^[a-z][a-z0-9]*$/.test(trimmed) && LEAF_KEYS.has(trimmed)) return false;
    return true;
};

const staticTextOf = (node) => {
    const expr = unwrap(node);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (ts.isTemplateExpression(expr)) {
        return [expr.head.text, ...expr.templateSpans.map((span) => span.literal.text)].join(' ');
    }
    return null;
};

const isDataKey = (text) => /^[a-z][a-zA-Z0-9_-]*$/.test(text);

const reportText = (hits, node, source, kind, text) => {
    if (text === null || !isTranslatable(text)) return;
    hits.push({
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        kind,
        text: text.replace(/\s+/g, ' ').trim(),
    });
};

const reportValue = (hits, node, source, kind) => reportText(hits, node, source, kind, staticTextOf(node));

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
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
            reportValue(hits, node, source, 'jsx-literal');
            return;
        }
        if (ts.isConditionalExpression(expr)) {
            for (const branch of [expr.whenTrue, expr.whenFalse]) reportValue(hits, branch, source, 'jsx-ternary');
            return;
        }
        if (ts.isBinaryExpression(expr) && staticTextOf(expr.right) !== null) {
            reportValue(hits, expr.right, source, 'jsx-logical');
        }
    };

    const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const callee = node.expression;
            if (
                ts.isIdentifier(callee.expression) &&
                callee.expression.text === 'toast' &&
                TOAST_METHODS.has(callee.name.text) &&
                node.arguments.length > 0
            ) {
                reportValue(hits, node.arguments[0], source, 'toast');
            }
        }
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
            const name = node.name.text;
            const init = node.initializer;
            if (init) {
                const expr = ts.isJsxExpression(init) ? init.expression : init;
                const text = expr ? staticTextOf(expr) : null;
                if (text !== null && TEXT_ATTRS.has(name)) reportText(hits, expr, source, name, text);
                else if (text !== null && name === 'name' && !isDataKey(text.trim()))
                    reportText(hits, expr, source, name, text);
            }
        }
        if (
            ts.isPropertyAssignment(node) &&
            ts.isIdentifier(node.name) &&
            TEXT_KEYS.has(node.name.text) &&
            !(node.parent && ts.isJsxAttributes(node.parent))
        ) {
            reportValue(hits, node.initializer, source, `prop:${node.name.text}`);
        }
        if (ts.isAssignmentPattern(node) && node.left && ts.isIdentifier(node.left)) {
            const text = staticTextOf(node.right);
            if (text !== null && (TEXT_KEYS.has(node.left.text) || /\s/.test(text.trim()))) {
                reportText(hits, node.right, source, `default:${node.left.text}`, text);
            }
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            const name = node.name.text;
            if (
                !SKIP_DECLARATIONS.has(name) &&
                (MAP_NAME_RE.test(name) || TEXT_KEYS.has(name) || TEXT_SUFFIX_RE.test(name))
            ) {
                const init = unwrap(node.initializer);
                if (ts.isObjectLiteralExpression(init)) {
                    for (const prop of init.properties) {
                        if (ts.isPropertyAssignment(prop)) reportValue(hits, prop.initializer, source, `map:${name}`);
                    }
                } else if (ts.isArrayLiteralExpression(init)) {
                    for (const element of init.elements) reportValue(hits, element, source, `array:${name}`);
                } else {
                    reportValue(hits, init, source, `const:${name}`);
                }
            }
        }
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left) &&
            (TEXT_SUFFIX_RE.test(node.left.text) || TEXT_KEYS.has(node.left.text))
        ) {
            reportValue(hits, node.right, source, `assign:${node.left.text}`);
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
