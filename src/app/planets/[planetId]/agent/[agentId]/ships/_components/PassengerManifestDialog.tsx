'use client';

import { formatNumberWithUnit } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PassengerManifest } from '@/simulation/ships/manifest';
import { parseManifestKey } from '@/simulation/ships/manifest';
import { useLocale, useTranslations } from 'next-intl';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    manifest: PassengerManifest;
    toPlanetName: string;
    phase: string;
};

type GroupedRow = {
    occupation: string;
    educationLevel: string;
    count: number;
};

export function countManifestPassengers(manifest: PassengerManifest): number {
    return Object.values(manifest).reduce((sum, cat) => sum + cat.total, 0);
}

function groupByOccupationAndEducation(manifest: PassengerManifest): GroupedRow[] {
    const grouped = new Map<string, number>();
    for (const [key, cat] of Object.entries(manifest)) {
        if (cat.total === 0) {
            continue;
        }
        const { occ, edu } = parseManifestKey(key);
        const groupKey = `${occ}:${edu}`;
        grouped.set(groupKey, (grouped.get(groupKey) ?? 0) + cat.total);
    }
    return Array.from(grouped.entries())
        .map(([k, count]) => {
            const [occupation, educationLevel] = k.split(':');
            return { occupation, educationLevel, count };
        })
        .sort((a, b) => b.count - a.count);
}

export function PassengerManifestDialog({ open, onOpenChange, manifest, toPlanetName, phase }: Props) {
    const locale = useLocale();
    const t = useTranslations('Ships');
    const total = countManifestPassengers(manifest);
    const rows = groupByOccupationAndEducation(manifest);

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal>
            <DialogContent className='max-w-lg'>
                <DialogHeader>
                    <DialogTitle>{t('manifest.title')}</DialogTitle>
                </DialogHeader>
                <div className='space-y-3'>
                    <div className='flex gap-4 text-sm text-muted-foreground'>
                        <span>
                            {t('manifest.phase')}{' '}
                            <span className='text-foreground font-medium capitalize'>{phase.replace(/_/g, ' ')}</span>
                        </span>
                        <span>
                            {t('manifest.destination')}{' '}
                            <span className='text-foreground font-medium'>{toPlanetName}</span>
                        </span>
                    </div>
                    <div className='rounded bg-muted px-3 py-2 text-sm'>
                        <span className='text-muted-foreground'>{t('manifest.total')} </span>
                        <span className='tabular-nums font-semibold'>
                            {formatNumberWithUnit(total, 'persons', undefined, locale)}
                        </span>
                    </div>
                    {rows.length > 0 ? (
                        <div className='overflow-auto max-h-80'>
                            <table className='w-full text-sm border-collapse'>
                                <thead>
                                    <tr className='text-xs text-muted-foreground border-b'>
                                        <th className='text-left py-1.5 pr-3 font-medium'>
                                            {t('manifest.occupation')}
                                        </th>
                                        <th className='text-left py-1.5 pr-3 font-medium'>{t('manifest.education')}</th>
                                        <th className='text-right py-1.5 font-medium'>{t('manifest.count')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr
                                            key={`${row.occupation}:${row.educationLevel}`}
                                            className='border-b border-border/50 last:border-0'
                                        >
                                            <td className='py-1.5 pr-3 capitalize'>{row.occupation}</td>
                                            <td className='py-1.5 pr-3 capitalize'>{row.educationLevel}</td>
                                            <td className='py-1.5 text-right tabular-nums'>
                                                {formatNumberWithUnit(row.count, 'persons', undefined, locale)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className='text-sm text-muted-foreground'>{t('manifest.none')}</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
