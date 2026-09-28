'use client';

import type { Facility, LastTickResults } from '@/simulation/planet/facility';
import React from 'react';
import { CardHeaderBlock } from './CardHeaderBlock';
import { WorkerBars } from './WorkerBars';
import { termFor } from '@/i18n/terms';
import { useLocale, useTranslations } from 'next-intl';

export const limitingEfficiency = (results: LastTickResults | undefined): number =>
    results
        ? Math.min(
              ...Object.values(results.resourceEfficiency),
              ...Object.values(results.workerEfficiency).filter((v): v is number => v !== undefined),
          )
        : 0;

export function FacilityHeader({
    facility,
    results,
    planetId,
    agentId,
    badge,
    titleClassName,
}: {
    facility: Facility;
    results?: LastTickResults;
    planetId?: string;
    agentId?: string;
    badge: React.ReactNode;
    titleClassName?: string;
}): React.ReactElement {
    const locale = useLocale();
    const t = useTranslations('Agent');
    const active = results !== undefined;
    const workerScale = active ? facility.scale : (facility.construction?.constructionTargetMaxScale ?? facility.scale);

    return (
        <CardHeaderBlock
            title={termFor(locale, facility.name)}
            titleClassName={titleClassName ?? ''}
            badge={badge}
            details={
                <>
                    {active ? t('facilityWorkerEfficiency') : t('facilityWorkerRequirement')}
                    <WorkerBars
                        workerRequirement={facility.workerRequirement}
                        scale={workerScale}
                        neutral={!active}
                        workerEfficiency={results?.workerEfficiency ?? {}}
                        globalMin={limitingEfficiency(results)}
                        planetId={planetId}
                        agentId={agentId}
                    />
                </>
            }
        />
    );
}
