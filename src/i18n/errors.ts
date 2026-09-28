import { useLocale, useTranslations } from 'next-intl';
import type { DomainErrorPacket } from '@/server/domainError';
import { termFor } from './terms';

const TERM_PARAM_KEYS = ['resourceName', 'facilityName', 'shipType', 'licenseType'] as const;

export const readDomainError = (error: unknown): DomainErrorPacket | null => {
    const data = (error as { data?: { domainError?: DomainErrorPacket | null } } | null)?.data;
    return data?.domainError ?? null;
};

export const useErrorMessage = () => {
    const t = useTranslations('Errors');
    const locale = useLocale();

    return (error: unknown): string => {
        const domainError = readDomainError(error);
        if (!domainError) {
            return error instanceof Error ? error.message : t('unexpected');
        }
        const params: Record<string, string | number> = { ...domainError.params };
        for (const key of TERM_PARAM_KEYS) {
            if (typeof params[key] === 'string') {
                params[key] = termFor(locale, params[key]);
            }
        }
        return t(domainError.code, params);
    };
};
