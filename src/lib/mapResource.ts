export function facilityImage(name: string): string {
    return `/images/facilities/${name.toLowerCase().replace(/\s+/g, '_')}.webp`;
}

export function productImage(name: string): string {
    return `/images/products/${name.toLowerCase().replace(/\s+/g, '_')}.webp`;
}

export const GAME_IMAGE_PROPS = { unoptimized: true } as const;
