import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT_ROOT = path.join(__dirname, 'results');

const RESULT_FILES = ['series.csv', 'scaleGaps.csv', 'checkpoint.json', 'checkpoint.bin', 'summary.json', 'seedGap.txt'];

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

interface Task {
    rate: number;
    seed: number;
    out: string;
    logPath: string;
}

function buildTasks(
    rates: number[],
    seeds: number[],
    prefix: string,
    resume: boolean,
    years: number,
): Task[] {
    const tasks: Task[] = [];
    for (const rate of rates) {
        for (const seed of seeds) {
            const out = `${prefix}-r${rate}-s${seed}`;
            const outDir = path.join(OUT_ROOT, out);
            fs.mkdirSync(outDir, { recursive: true });
            const existing = fs.readdirSync(outDir).filter((f) => RESULT_FILES.includes(f));
            if (!resume && existing.length > 0) {
                throw new Error(
                    `out dir '${outDir}' already contains results (${existing.join(', ')}). ` +
                        `Use a fresh --prefix, or pass --resume to continue the same runs.`,
                );
            }
            if (resume && !fs.existsSync(path.join(outDir, 'checkpoint.json'))) {
                throw new Error(`--resume passed but no checkpoint in '${outDir}'. Use a fresh --prefix instead.`);
            }
            console.log(`[sweep] plan ${out} (${years}y)`);
            tasks.push({ rate, seed, out, logPath: path.join(outDir, 'run.log') });
        }
    }
    return tasks;
}

function runOne(task: Task, scenario: string, years: number, checkpointEveryYears: number, resume: boolean): Promise<{ out: string; code: number | null }> {
    const log = fs.openSync(task.logPath, 'w');
    const args = [
        'tsx',
        path.join(__dirname, 'run.ts'),
        `--scenario=${scenario}`,
        `--interestRate=${task.rate}`,
        `--seed=${task.seed}`,
        `--years=${years}`,
        '--bands=off',
        `--checkpointEveryYears=${checkpointEveryYears}`,
        `--out=${task.out}`,
    ];
    if (resume) {
        args.push('--resume');
    }

    console.log(`[sweep] launch ${task.out} → ${task.logPath}`);

    return new Promise((resolve) => {
        const child = spawn('npx', args, { stdio: ['ignore', log, log] });
        let settled = false;
        const finalize = (code: number | null): void => {
            if (settled) {
                return;
            }
            settled = true;
            fs.closeSync(log);
            resolve({ out: task.out, code });
        };
        child.on('close', (code) => finalize(code));
        child.on('error', (err) => {
            console.error(`[sweep] ${task.out} failed to spawn: ${err.message}`);
            finalize(null);
        });
    });
}

async function runWithConcurrency(
    tasks: Task[],
    concurrency: number,
    scenario: string,
    years: number,
    checkpointEveryYears: number,
    resume: boolean,
): Promise<Array<{ out: string; code: number | null }>> {
    const results: Array<{ out: string; code: number | null }> = [];
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        for (;;) {
            const index = next++;
            const task = tasks[index];
            if (task === undefined) {
                return;
            }
            results.push(await runOne(task, scenario, years, checkpointEveryYears, resume));
        }
    });
    await Promise.all(workers);
    return results;
}

interface RunSummary {
    years: number;
    msPerTick: number;
    ticksPerSecond: number;
}

async function main(): Promise<void> {
    const rates = (arg('rates') ?? '0.01,0.05,0.25').split(',').map((s) => Number(s.trim()));
    const seeds = (arg('seeds') ?? '1001,1002,1003').split(',').map((s) => Number(s.trim()));
    const years = Number(arg('years') ?? 80);
    const scenario = arg('scenario') ?? 'singleAgent';
    const concurrency = Number(arg('concurrency') ?? 9);
    const prefix = arg('prefix') ?? 'pilot';
    const checkpointEveryYears = Number(arg('checkpointEveryYears') ?? 20);
    const resume = process.argv.includes('--resume');

    const tasks = buildTasks(rates, seeds, prefix, resume, years);
    console.log(
        `[sweep] running ${tasks.length} run(s): scenario=${scenario}, years=${years}, concurrency=${Math.min(concurrency, tasks.length)}${resume ? ', resume' : ''}`,
    );

    const t0 = Date.now();
    const results = await runWithConcurrency(tasks, concurrency, scenario, years, checkpointEveryYears, resume);
    const elapsed = (Date.now() - t0) / 1000;

    console.log(`\n[sweep] finished in ${elapsed.toFixed(0)}s`);
    let failed = 0;
    for (const r of results.sort((a, b) => a.out.localeCompare(b.out))) {
        const summaryPath = path.join(OUT_ROOT, r.out, 'summary.json');
        let extra = '';
        if (fs.existsSync(summaryPath)) {
            const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as RunSummary;
            extra = `msPerTick=${summary.msPerTick.toFixed(1)} (${summary.ticksPerSecond.toFixed(1)} tick/s)`;
        }
        const ok = r.code === 0;
        if (!ok) {
            failed += 1;
        }
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${r.out.padEnd(24)} ${extra}`);
    }
    console.log(`\n[sweep] ${results.length - failed}/${results.length} runs finished cleanly.`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

main();
