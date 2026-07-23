// Each company_icon key maps to one of five categories
// Lookup is done via prefix matching on the part after `company_icon_`

const CATEGORY_RAW = 'Raw';
const CATEGORY_INDUSTRIAL = 'Industrial & Manufacturing';
const CATEGORY_PROCESSING = 'Processing & Trade';
const CATEGORY_SERVICES = 'Institutions & Services';
const CATEGORY_GENERAL = 'General';

export const LOGO_CATEGORIES: Record<string, string> = {};

export const CATEGORY_ORDER = [
    CATEGORY_RAW,
    CATEGORY_INDUSTRIAL,
    CATEGORY_PROCESSING,
    CATEGORY_SERVICES,
    CATEGORY_GENERAL,
] as const;

export function getCategoryForLogoKey(key: string): string {
    const prefix = key.replace('company_icon_', '');
    if (prefix.startsWith('general_')) {
        return CATEGORY_GENERAL;
    }
    if (
        prefix.startsWith('agricultural') ||
        prefix.startsWith('raw_') ||
        prefix.startsWith('logging_camp') ||
        prefix.startsWith('oil_well') ||
        prefix.startsWith('sand_mine') ||
        prefix.startsWith('limestone_quarry') ||
        prefix.startsWith('water_extraction') ||
        prefix.startsWith('cotton_farm') ||
        prefix.startsWith('sawmill')
    ) {
        return CATEGORY_RAW;
    }
    if (
        prefix.startsWith('clothing') ||
        prefix.startsWith('construction_facility') ||
        prefix.startsWith('glass_factory') ||
        prefix.startsWith('iron_smelter') ||
        prefix.startsWith('it_devices') ||
        prefix.startsWith('machinery_factory') ||
        prefix.startsWith('manufactured') ||
        prefix.startsWith('packaging_plant') ||
        prefix.startsWith('paper_mill') ||
        prefix.startsWith('textile_mill') ||
        prefix.startsWith('vehicle_factory')
    ) {
        return CATEGORY_INDUSTRIAL;
    }
    if (
        prefix.startsWith('food_processing') ||
        prefix.startsWith('oil_refinery') ||
        prefix.startsWith('pharmaceutical') ||
        prefix.startsWith('refined') ||
        prefix.startsWith('grocery_chain') ||
        prefix.startsWith('retail_chain')
    ) {
        return CATEGORY_PROCESSING;
    }
    if (
        prefix.startsWith('administrative') ||
        prefix.startsWith('education') ||
        prefix.startsWith('hospital') ||
        prefix.startsWith('logistics_hub') ||
        prefix.startsWith('maintenance') ||
        prefix.startsWith('services_')
    ) {
        return CATEGORY_SERVICES;
    }
    return CATEGORY_GENERAL;
}
