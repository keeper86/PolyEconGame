import { useTranslations } from 'next-intl';
import type { DomainErrorPacket } from '@/server/domainError';

export const readDomainError = (error: unknown): DomainErrorPacket | null => {
    const data = (error as { data?: { domainError?: DomainErrorPacket | null } } | null)?.data;
    return data?.domainError ?? null;
};

export const useErrorMessage = () => {
    const t = useTranslations('Errors');

    return (error: unknown): string => {
        const domainError = readDomainError(error);
        if (!domainError) {
            return error instanceof Error ? error.message : t('unexpected');
        }
        switch (domainError.code) {
            case 'notLoggedIn':
                return t('notLoggedIn');
            case 'notOwner':
                return t('notOwner');
            case 'workforceLicenseRequired':
                return t('workforceLicenseRequired');
            case 'commercialLicenseRequired':
                return t('commercialLicenseRequired');
            case 'unknownResource':
                return t('unknownResource', { resourceName: String(domainError.params.resourceName) });
            default:
                return t('unexpected');
        }
    };
};
