import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const files = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const apply = process.argv.includes('--apply');

const unwrap = (node: ts.Node | undefined): ts.ObjectLiteralExpression | null => {
    const inner = node && ts.isParenthesizedExpression(node) ? node.expression : node;
    if (inner && ts.isObjectLiteralExpression(inner)) {
        return inner;
    }
    if (inner && ts.isCallExpression(inner) && ts.isObjectLiteralExpression(inner.arguments[1])) {
        return inner.arguments[1];
    }
    return null;
};

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits: { pos: number; end?: number; text: string }[] = [];
    const unsupported: string[] = [];

    const visit = (node: ts.Node): void => {
        const body = (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body;
        const literal = unwrap(body ?? undefined);
        if (literal && body && ts.isCallExpression(ts.isParenthesizedExpression(body) ? body.expression : body)) {
            const property = literal.properties.find(
                (candidate): candidate is ts.PropertyAssignment =>
                    ts.isPropertyAssignment(candidate) && candidate.name.getText(source) === 'workerRequirement',
            );
            if (property) {
                edits.push({ pos: property.getFullStart(), end: property.getEnd(), text: '' });
            }
        }
        ts.forEachChild(node, visit);
    };

    ts.forEachChild(source, visit);

    for (const edit of edits) {
        console.log(`${file}:${source.getLineAndCharacterOfPosition(edit.pos).line + 1} unwrapped`);
    }
    for (const entry of unsupported) {
        console.log(`MANUAL ${entry}`);
    }

    if (apply) {
        let out = text;
        for (const edit of [...edits].sort((a, b) => b.pos - a.pos)) {
            out = out.slice(0, edit.pos) + edit.text + out.slice(edit.end ?? edit.pos);
        }
        writeFileSync(file, out);
    }
    console.log(`${file}: ${edits.length} properties ${apply ? 'removed' : 'would be removed'}`);
}
