export function facilityImage(name: string): string {
    return `/images/facilities/${name.toLowerCase().replace(/\s+/g, '_')}.png`;
}

export function productImage(name: string): string {
    return `/images/products/${name.toLowerCase().replace(/\s+/g, '_')}.png`;
}

export const GAME_IMAGE_PROPS = { unoptimized: true } as const;
