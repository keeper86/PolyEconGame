import { NextResponse } from 'next/server';
import { readdirSync } from 'fs';
import { readFile, writeFile, rename } from 'fs/promises';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const COMPANIES_DIR = path.join(PUBLIC_DIR, 'images', 'companies');
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'lib', 'assetManifest.ts');

function getGeminiImages(): string[] {
    return readdirSync(PUBLIC_DIR)
        .filter((f) => f.startsWith('Gemini_Generated_Image_') && f.endsWith('.webp'))
        .sort();
}

function sanitizeCategory(label: string): string {
    return label
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

function getExistingCompanyFiles(): string[] {
    return readdirSync(COMPANIES_DIR)
        .filter((f) => f.endsWith('.webp'))
        .sort();
}

export async function GET() {
    const images = getGeminiImages();
    const existingFiles = getExistingCompanyFiles();

    const categoryCounts: Record<string, number> = {};
    for (const file of existingFiles) {
        const match = file.match(/^company_icon_(.+)_(\d+)\.webp$/);
        if (match) {
            const category = match[1];
            const num = parseInt(match[2], 10);
            categoryCounts[category] = Math.max(categoryCounts[category] ?? 0, num + 1);
        }
    }

    return NextResponse.json({
        images: images.map((f) => ({ filename: f, url: `/${f}` })),
        count: images.length,
        existingCategoryCounts: categoryCounts,
    });
}

export async function POST(request: Request) {
    try {
        const { mappings, categories } = (await request.json()) as {
            mappings: Record<string, string>;
            categories: string[];
        };

        const errors: string[] = [];
        const moved: { from: string; to: string }[] = [];

        const categoryCounters: Record<string, number> = {};
        for (const cat of categories) {
            const sanitized = sanitizeCategory(cat);
            const existing = getExistingCompanyFiles();
            let maxNum = -1;
            for (const file of existing) {
                const match = file.match(new RegExp(`^company_icon_${sanitized}_(\\d+)\\.webp$`));
                if (match) {
                    maxNum = Math.max(maxNum, parseInt(match[1], 10));
                }
            }
            categoryCounters[sanitized] = maxNum + 1;
        }

        const byCategory: Record<string, string[]> = {};
        for (const [filename, categoryLabel] of Object.entries(mappings)) {
            const sanitized = sanitizeCategory(categoryLabel);
            if (!byCategory[sanitized]) {
                byCategory[sanitized] = [];
            }
            byCategory[sanitized].push(filename);
        }

        for (const [sanitized, filenames] of Object.entries(byCategory)) {
            for (const filename of filenames) {
                const num = categoryCounters[sanitized]++;
                const newName = `company_icon_${sanitized}_${String(num).padStart(2, '0')}.webp`;
                const oldPath = path.join(PUBLIC_DIR, filename);
                const newPath = path.join(COMPANIES_DIR, newName);

                try {
                    await rename(oldPath, newPath);
                    moved.push({ from: filename, to: newName });
                } catch {
                    errors.push(`Failed to move ${filename} -> ${newName}`);
                }
            }
        }

        await regenerateAssetManifest();

        return NextResponse.json({ moved, errors, total: moved.length });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

async function regenerateAssetManifest() {
    const files = getExistingCompanyFiles();
    const companyEntries = files.map((f) => {
        const key = f.replace(/\.webp$/, '');
        return `    ${key}: '/images/companies/${f}'`;
    });

    const content = await readFile(MANIFEST_PATH, 'utf8');

    // Find the start: first line containing '/images/companies/' (the ai_company entry)
    // Find the end: last line containing '/images/companies/' (the last company entry)
    const lines = content.split('\n');

    const companyLineIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("'/images/companies/")) {
            companyLineIndices.push(i);
        }
    }

    if (companyLineIndices.length === 0) {
        throw new Error('Could not locate company entries in assetManifest.ts');
    }

    const startIdx = companyLineIndices[0];
    const endIdx = companyLineIndices[companyLineIndices.length - 1];

    // before = lines before the first company entry (preserving the line before)
    // after = lines after the last company entry
    const before = lines.slice(0, startIdx).join('\n');
    const after = lines.slice(endIdx + 1).join('\n');

    let newContent = before;
    if (before.length > 0 && !before.endsWith('\n')) {
        newContent += '\n';
    }
    newContent += companyEntries.join(',\n') + ',';
    if (after.length > 0) {
        newContent += '\n' + after;
    }

    const trimmed = newContent.replace(/[ \t]+$/gm, '');

    await writeFile(MANIFEST_PATH, trimmed, 'utf8');
}
