import { ALL_PRODUCTION_FACILITY_ENTRIES } from '@/simulation/planet/productionFacilities';
import { assetManifest } from '@/lib/assetManifest';
import type { ResourceProcessLevel } from '@/simulation/planet/claims';

const CATEGORY_RAW = 'Raw';
const CATEGORY_REFINEMENT = 'Refinement';
const CATEGORY_MANUFACTURING = 'Manufacturing';
const CATEGORY_SERVICES = 'Services';
const CATEGORY_GENERAL = 'General';

const LEVEL_LABELS: Record<ResourceProcessLevel, string> = {
    raw: CATEGORY_RAW,
    refined: CATEGORY_REFINEMENT,
    manufactured: CATEGORY_MANUFACTURING,
    services: CATEGORY_SERVICES,
};

const ICON_KEY_OVERRIDES: Record<string, ResourceProcessLevel> = {
    food_processing_plant: 'manufactured',
    pharmaceutical_plant: 'manufactured',
    water_extraction_facility: 'raw',
};

const FACILITY_ICON_MAP: Record<string, ResourceProcessLevel> = {};
for (const entry of Object.values(ALL_PRODUCTION_FACILITY_ENTRIES)) {
    const normalized = entry.template.name.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
    FACILITY_ICON_MAP[normalized] = entry.primaryOutputLevel;
}

function getBaseIconKey(key: string): string | null {
    if (!key.startsWith('company_icon_')) {
        return null;
    }
    return key.replace('company_icon_', '').replace(/_\d+$/, '');
}

function categoryForBaseKey(base: string): string {
    switch (base) {
        case 'general':
            return CATEGORY_GENERAL;
        case 'raw':
            return CATEGORY_RAW;
        case 'refined':
            return CATEGORY_REFINEMENT;
        case 'manufactured':
            return CATEGORY_MANUFACTURING;
        case 'services':
            return CATEGORY_SERVICES;
    }
    const level = ICON_KEY_OVERRIDES[base] ?? FACILITY_ICON_MAP[base];
    if (level) {
        return LEVEL_LABELS[level];
    }
    return CATEGORY_GENERAL;
}

export const LOGO_CATEGORIES: Record<string, string> = {};
for (const key of Object.keys(assetManifest)) {
    const base = getBaseIconKey(key);
    if (base) {
        LOGO_CATEGORIES[key] = categoryForBaseKey(base);
    }
}

export const CATEGORY_ORDER = [
    CATEGORY_RAW,
    CATEGORY_REFINEMENT,
    CATEGORY_MANUFACTURING,
    CATEGORY_SERVICES,
    CATEGORY_GENERAL,
] as const;

export function getCategoryForLogoKey(key: string): string {
    return LOGO_CATEGORIES[key] ?? CATEGORY_GENERAL;
}
