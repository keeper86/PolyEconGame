import { useLocale, useTranslations } from 'next-intl';
import type { DomainErrorPacket } from '@/server/domainError';
import { termFor } from './terms';

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
        if (domainError.code === 'unknownResource') {
            return t('unknownResource', {
                resourceName: termFor(locale, String(domainError.params.resourceName)),
            });
        }
        if (domainError.code === 'invalidBuyBid' || domainError.code === 'invalidSellOffer') {
            return t(domainError.code, {
                resourceName: termFor(locale, String(domainError.params.resourceName)),
                detail: String(domainError.params.detail),
            });
        }
        return t(domainError.code);
    };
};
