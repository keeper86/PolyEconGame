// TEMP-DEV: Company icon classifier - will be removed
import { ALL_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import fs from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const COMPANIES_DIR = path.join(PUBLIC_DIR, 'images', 'companies');

// Derive all possible categories from the simulation
function buildCategories(): { key: string; label: string; group: 'facility' | 'level' | 'general' }[] {
    const categories: { key: string; label: string; group: 'facility' | 'level' | 'general' }[] = [];

    // Facility types - from ALL_FACILITY_ENTRIES
    const seen = new Set<string>();
    for (const entry of ALL_FACILITY_ENTRIES) {
        const name = entry.factory('tool', 'preview').name;
        const key = name.toLowerCase().replace(/\s+/g, '_');
        if (!seen.has(key)) {
            seen.add(key);
            categories.push({ key, label: name, group: 'facility' });
        }
    }

    // Also add facility type keys from preConfiguredCompanies that may not be in ALL_FACILITY_ENTRIES
    const extraFacilities = [
        'bauxite_mine',
        'brick_factory',
        'fertilizer_plant',
        'natural_gas_well',
        'phosphate_mine',
        'potash_mine',
        'rare_earth_mine',
        'aluminum_smelter',
    ];
    for (const k of extraFacilities) {
        const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        if (!seen.has(k)) {
            seen.add(k);
            categories.push({ key: k, label, group: 'facility' });
        }
    }

    // Process levels
    const levels = ['raw', 'refined', 'manufactured', 'services'] as const;
    for (const level of levels) {
        categories.push({ key: level, label: level.charAt(0).toUpperCase() + level.slice(1), group: 'level' });
    }

    // General
    categories.push({ key: 'general', label: 'General', group: 'general' });

    return categories;
}

export const categories = buildCategories();

export async function GET() {
    try {
        // List all Gemini files in public/
        const files = fs
            .readdirSync(PUBLIC_DIR)
            .filter((f) => f.startsWith('Gemini_') && f.endsWith('.webp'))
            .sort();

        // Get existing named files in companies dir
        let existingInCompanies: string[] = [];
        try {
            existingInCompanies = fs.readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.webp'));
        } catch {
            // dir may not exist
        }

        return NextResponse.json({
            files,
            total: files.length,
            categories,
            existingInCompanies,
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const classifications: Record<string, string> = body.classifications; // { oldFilename: categoryKey }
        const dryRun = body.dryRun === true;

        if (!classifications || typeof classifications !== 'object') {
            return NextResponse.json({ error: 'Invalid classifications payload' }, { status: 400 });
        }

        // Build counter per category
        const counters: Record<string, number> = {};
        // Seed with existing files in companies dir
        try {
            const existing = fs.readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.webp'));
            for (const f of existing) {
                // Parse company_icon_<category>_<nn>.webp
                const match = f.match(/^company_icon_(\w+)_(\d+)\.webp$/);
                if (match) {
                    const cat = match[1];
                    const num = parseInt(match[2], 10);
                    if (!counters[cat] || num >= counters[cat]) {
                        counters[cat] = num + 1;
                    }
                }
            }
        } catch {
            // companies dir doesn't exist yet
        }

        const results: { oldName: string; newName: string; category: string }[] = [];
        const errors: { oldName: string; error: string }[] = [];

        for (const [oldFilename, categoryKey] of Object.entries(classifications)) {
            if (!oldFilename.endsWith('.webp') || !oldFilename.startsWith('Gemini_')) {
                errors.push({ oldName: oldFilename, error: 'Not a Gemini webp file' });
                continue;
            }

            const normalizedKey = categoryKey.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
            const counter = counters[normalizedKey] ?? 0;
            const newFilename = `company_icon_${normalizedKey}_${String(counter).padStart(2, '0')}.webp`;
            counters[normalizedKey] = counter + 1;

            results.push({ oldName: oldFilename, newName: newFilename, category: normalizedKey });

            if (!dryRun) {
                const src = path.join(PUBLIC_DIR, oldFilename);
                const destDir = COMPANIES_DIR;
                const dest = path.join(destDir, newFilename);

                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }

                if (!fs.existsSync(src)) {
                    errors.push({ oldName: oldFilename, error: 'Source file not found' });
                    continue;
                }

                fs.renameSync(src, dest);
            }
        }

        return NextResponse.json({
            dryRun,
            totalProcessed: results.length,
            results,
            errors: errors.length > 0 ? errors : undefined,
            counters,
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
