import fs from 'node:fs';
import path from 'node:path';

import { deserializeSnapshot, serializeGameState } from '../../src/simulation/snapshotCompression';

const srcDir = process.argv[2];
const dstDir = process.argv[3];
const factor = Number(process.argv[4] ?? '1e12');

if (!srcDir || !dstDir || !Number.isFinite(factor) || factor <= 0) {
    console.error('usage: tsx refillCheckpoint.ts <srcDir> <dstDir> <factor>  (factor > 0)');
    process.exit(1);
}

const metaPath = path.join(srcDir, 'checkpoint.json');
const statePath = path.join(srcDir, 'checkpoint.bin');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const gameState = deserializeSnapshot(fs.readFileSync(statePath));

interface Row {
    planet: string;
    resource: string;
    regenerationRate: number;
    poolBefore: number;
    poolAfter: number;
    claimsBefore: number;
    claimsAfter: number;
    capacityAfter: number;
}

const rows: Row[] = [];
for (const planet of gameState.planets.values()) {
    for (const [name, entry] of Object.entries(planet.resources)) {
        if (entry.pool.regenerationRate !== 0) {
            continue;
        }
        const claimsBefore = entry.claims.reduce((sum, claim) => sum + claim.quantity, 0);
        const poolBefore = entry.pool.quantity;
        entry.pool.quantity = poolBefore * factor;
        for (const claim of entry.claims) {
            claim.quantity = claim.quantity * factor;
        }
        rows.push({
            planet: planet.name,
            resource: name,
            regenerationRate: entry.pool.regenerationRate,
            poolBefore,
            poolAfter: entry.pool.quantity,
            claimsBefore,
            claimsAfter: entry.claims.reduce((sum, claim) => sum + claim.quantity, 0),
            capacityAfter: entry.pool.maximumCapacity,
        });
    }
}

fs.mkdirSync(dstDir, { recursive: true });
fs.writeFileSync(path.join(dstDir, 'checkpoint.json'), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(dstDir, 'checkpoint.bin'), serializeGameState(gameState));

console.log(`refilled ${rows.length} resource entries x${factor} at tick ${meta.tick} (y${(meta.tick / 360).toFixed(1)})`);
for (const row of rows.sort((a, b) => a.resource.localeCompare(b.resource))) {
    const zero = row.regenerationRate === 0 ? 'nonrenewable' : `regen=${row.regenerationRate}`;
    console.log(
        `  ${row.resource.padEnd(22)} ${zero.padEnd(18)} pool ${row.poolBefore.toExponential(3)} -> ${row.poolAfter.toExponential(3)}` +
            `   leased ${row.claimsBefore.toExponential(3)} -> ${row.claimsAfter.toExponential(3)}`
    );
}
console.log(`wrote ${path.join(dstDir, 'checkpoint.bin')} (${(fs.statSync(path.join(dstDir, 'checkpoint.bin')).size / 1e6).toFixed(1)} MB)`);
