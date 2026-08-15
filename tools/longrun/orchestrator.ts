import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { SCENARIOS } from './scenarios';

const OUT_ROOT = path.join(__dirname, 'results');

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

function runOne(name: string, years: number, bands: string): Promise<{ name: string; code: number | null }> {
    const outDir = path.join(OUT_ROOT, name);
    fs.mkdirSync(outDir, { recursive: true });
    const logPath = path.join(outDir, 'run.log');
    const log = fs.openSync(logPath, 'w');

    const args = ['tsx', path.join(__dirname, 'run.ts'), `--scenario=${name}`, `--years=${years}`, `--bands=${bands}`];

    console.log(`[orchestrator] launch ${name} → ${logPath}`);

    return new Promise((resolve) => {
        const child = spawn('npx', args, { stdio: ['ignore', log, log] });
        child.on('close', (code) => {
            fs.closeSync(log);
            console.log(`[orchestrator] ${name} finished with exit code ${code}`);
            resolve({ name, code });
        });
        child.on('error', (err) => {
            fs.closeSync(log);
            console.error(`[orchestrator] ${name} failed to spawn: ${err.message}`);
            resolve({ name, code: null });
        });
    });
}

async function main(): Promise<void> {
    const years = Number(arg('years') ?? 30);
    const bands = arg('bands') ?? 'report';
    const only = arg('scenario');

    const scenarios = only ? SCENARIOS.filter((s) => s.name === only) : SCENARIOS;
    if (scenarios.length === 0) {
        console.error(`No scenarios to run (--scenario=${only})`);
        process.exit(2);
    }

    console.log(`[orchestrator] running ${scenarios.length} scenario(s) in parallel (years=${years}, bands=${bands})`);
    const results = await Promise.all(scenarios.map((s) => runOne(s.name, years, bands)));

    console.log('\n[orchestrator] summary:');
    let failed = 0;
    for (const r of results) {
        const ok = r.code === 0;
        if (!ok) {
            failed += 1;
        }
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${r.name} (exit ${r.code})`);
    }
    console.log(`\n[orchestrator] ${results.length - failed}/${results.length} scenarios finished cleanly.`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

main();
