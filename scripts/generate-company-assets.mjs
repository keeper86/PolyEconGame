import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const companiesDir = join(import.meta.dirname, '../public/images/companies');
const files = readdirSync(companiesDir)
    .filter((f) => f.endsWith('.webp'))
    .sort();

const companyEntries = files.map((f) => {
    const key = f.replace(/\.webp$/, '');
    const value = `/images/companies/${f}`;
    return `    ${key}: '${value}'`;
});

const manifestPath = join(import.meta.dirname, '../src/lib/assetManifest.ts');
const original = readFileSync(manifestPath, 'utf8');

// Find the lines we need to replace (old company entries: lines 33-36)
const oldLines = [
    "    companies_company_logo_001: '/images/companies/company-logo_001.webp',",
    "    companies_company_logo_002: '/images/companies/company-logo_002.webp',",
    "    company_logo_001: '/images/companies/company-logo_001.webp',",
    "    company_logo_002: '/images/companies/company-logo_002.webp',",
];

const toInsert = companyEntries.join(',\n') + ',';

const updated = original.replace(oldLines.join('\n'), toInsert);
writeFileSync(manifestPath, updated);

console.log(`Done. Added ${files.length} company logo entries.`);
