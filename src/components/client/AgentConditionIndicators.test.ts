import { hrProductivityColor, storageStarvationColor } from '@/components/client/AgentConditionIndicators';
import { describe, expect, it } from 'vitest';

describe('hrProductivityColor', () => {
    it('returns red below 80% productivity', () => {
        expect(hrProductivityColor(0.5)).toBe('text-red-600');
        expect(hrProductivityColor(0.79)).toBe('text-red-600');
    });

    it('returns amber from 80% to below 95%', () => {
        expect(hrProductivityColor(0.8)).toBe('text-amber-600');
        expect(hrProductivityColor(0.94)).toBe('text-amber-600');
    });

    it('returns green at 95% and above', () => {
        expect(hrProductivityColor(0.95)).toBe('text-green-600');
        expect(hrProductivityColor(1)).toBe('text-green-600');
    });
});

describe('storageStarvationColor', () => {
    it('returns green for healthy starvation levels', () => {
        expect(storageStarvationColor(0)).toBe('text-green-600');
        expect(storageStarvationColor(0.05)).toBe('text-green-600');
        expect(storageStarvationColor(0.1)).toBe('text-green-600');
    });

    it('returns yellow above 10% starvation', () => {
        expect(storageStarvationColor(0.11)).toBe('text-yellow-500');
        expect(storageStarvationColor(0.25)).toBe('text-yellow-500');
    });

    it('returns orange above 25% starvation', () => {
        expect(storageStarvationColor(0.26)).toBe('text-orange-500');
        expect(storageStarvationColor(0.5)).toBe('text-orange-500');
    });

    it('returns red above 50% starvation', () => {
        expect(storageStarvationColor(0.51)).toBe('text-red-600');
        expect(storageStarvationColor(0.75)).toBe('text-red-600');
    });

    it('returns dark red above 75% starvation', () => {
        expect(storageStarvationColor(0.76)).toBe('text-red-700');
        expect(storageStarvationColor(1)).toBe('text-red-700');
    });
});
