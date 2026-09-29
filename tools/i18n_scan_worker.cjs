const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src', 'simulation');

const collect = (dir, out) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full, out);
        else if (entry.name.endsWith('.ts') && !/\.test\./.test(entry.name)) out.push(full);
    }
    return out;
};

const isTranslatable = (text) => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 3) return false;
    if (!/[A-Za-z]/.test(trimmed)) return false;
    if (/^[a-z]+([A-Z][a-zA-Z0-9]*)+$/.test(trimmed)) return false;
    if (/^[a-z][a-z0-9]*$/.test(trimmed)) return false;
    return true;
};

const staticTextOf = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
        return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
    }
    return null;
};

const hits = [];
let bareReasonFields = 0;

for (const file of collect(target, [])) {
    const rel = path.relative(target, file);
    const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const visit = (node) => {
        if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'reason') {
            const text = staticTextOf(node.initializer);
            if (text !== null && isTranslatable(text)) {
                hits.push(`${rel}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}  ${JSON.stringify(text.trim())}`);
            }
        }
        if (
            ts.isPropertySignature(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text === 'reason' &&
            node.type &&
            node.type.kind === ts.SyntaxKind.StringKeyword
        ) {
            bareReasonFields++;
            hits.push(`${rel}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}  reason: string`);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}

process.stdout.write(`worker message files with translatable reason text: ${hits.length}\n`);
for (const hit of hits) process.stdout.write(`  ${hit}\n`);
process.stdout.write(`TOTAL ${hits.length} in ${bareReasonFields} bare reason fields\n`);
