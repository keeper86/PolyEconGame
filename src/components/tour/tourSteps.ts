import type { Step as JoyrideStep } from 'react-joyride';
import type { useTranslations } from 'next-intl';

type PageRoute = 'financial' | 'workforce' | 'claims' | 'production' | 'storage' | 'market' | 'ships';

type TourTranslator = ReturnType<typeof useTranslations<'Tour'>>;

export function getStepsForPage(
    t: TourTranslator,
    page: PageRoute,
    planetId: string,
    agentId: string,
    completedActions?: string[],
): JoyrideStep[] {
    const completed = new Set(completedActions ?? []);
    const steps: JoyrideStep[] = [];

    switch (page) {
        case 'financial': {
            steps.push({
                target: 'body',
                content: t('steps.financial.0.content'),
                title: t('steps.financial.0.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('starter-loan')) {
                steps.push({
                    target: '[data-tour="starter-loan"]',
                    content: t('steps.financial.1.content'),
                    title: t('steps.financial.1.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'starter-loan' },
                });
            }

            steps.push({
                target: '[data-tour="financial-loan-panel"]',
                content: t('steps.financial.2.content'),
                title: t('steps.financial.2.title'),
                placement: 'top',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-cash-flow"]',
                content: t('steps.financial.3.content'),
                title: t('steps.financial.3.title'),
                placement: 'top',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-positions"]',
                content: t('steps.financial.4.content'),
                title: t('steps.financial.4.title'),
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-expenses-revenue-chart"]',
                content: t('steps.financial.5.content'),
                title: t('steps.financial.5.title'),
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-balance-flow-chart"]',
                content: t('steps.financial.6.content'),
                title: t('steps.financial.6.title'),
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-product-resolution"]',
                content: t('steps.financial.7.content'),
                title: t('steps.financial.7.title'),
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-loan-panel"]',
                content: t('steps.financial.8.content'),
                title: t('steps.financial.8.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.financial.9.content'),
                title: t('steps.financial.9.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }

        case 'workforce': {
            steps.push({
                target: '[data-tour="workforce-wages"]',
                content: t('steps.workforce.0.content'),
                title: t('steps.workforce.0.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-wages"]',
                content: t('steps.workforce.1.content'),
                title: t('steps.workforce.1.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('enable-automation')) {
                steps.push({
                    target: '[data-tour="workforce-automation"]',
                    content: t('steps.workforce.2.content'),
                    title: t('steps.workforce.2.title'),
                    placement: 'bottom',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'enable-automation' },
                });
            }

            steps.push({
                target: 'body',
                content: t('steps.workforce.3.content'),
                title: t('steps.workforce.3.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-allocation"]',
                content: t('steps.workforce.4.content'),
                title: t('steps.workforce.4.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-demographics-title"]',
                content: t('steps.workforce.5.content'),
                title: t('steps.workforce.5.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-age-distribution"]',
                content: t('steps.workforce.6.content'),
                title: t('steps.workforce.6.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-tenure-chart"]',
                content: t('steps.workforce.7.content'),
                title: t('steps.workforce.7.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-charts"]',
                content: t('steps.workforce.8.content'),
                title: t('steps.workforce.8.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.workforce.9.content'),
                title: t('steps.workforce.9.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('build-hr')) {
                steps.push({
                    target: '[data-tour="build-hr"]',
                    content: t('steps.workforce.10.content'),
                    title: t('steps.workforce.10.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'build-hr' },
                });
            }

            steps.push({
                target: 'body',
                content: t('steps.workforce.11.content'),
                title: t('steps.workforce.11.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.workforce.12.content'),
                title: t('steps.workforce.12.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.workforce.13.content'),
                title: t('steps.workforce.13.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }

        case 'market': {
            steps.push({
                target: '[data-tour="market-tabs"]',
                content: t('steps.market.0.content'),
                title: t('steps.market.0.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
                data: { timeoutMs: 30000 },
            });

            steps.push({
                target: '[data-tour="market-tab-services"]',
                content: t('steps.market.1.content'),
                title: t('steps.market.1.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.market.2.content'),
                title: t('steps.market.2.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('expand-construction-accordion')) {
                steps.push({
                    target: '[data-tour="market-accordion-construction"]',
                    content: t('steps.market.3.content'),
                    title: t('steps.market.3.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'expand-construction-accordion' },
                });
            }

            if (!completed.has('enable-buy-construction')) {
                steps.push({
                    target: '[data-tour="market-buy-switch"]',
                    content: t('steps.market.4.content'),
                    title: t('steps.market.4.title'),
                    placement: 'right',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'enable-buy-construction' },
                });
            }

            steps.push({
                target: 'body',
                content: t('steps.market.5.content'),
                title: t('steps.market.5.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('expand-administration-accordion')) {
                steps.push({
                    target: '[data-tour="market-accordion-administration"]',
                    content: t('steps.market.6.content'),
                    title: t('steps.market.6.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'expand-administration-accordion' },
                });
            }

            if (!completed.has('enable-buy-administration')) {
                steps.push({
                    target: '[data-tour="market-buy-switch"]',
                    content: t('steps.market.7.content'),
                    title: t('steps.market.7.title'),
                    placement: 'right',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'enable-buy-administration' },
                });
            }

            if (!completed.has('expand-logistics-accordion')) {
                steps.push({
                    target: '[data-tour="market-accordion-logistics"]',
                    content: t('steps.market.8.content'),
                    title: t('steps.market.8.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'expand-logistics-accordion' },
                });
            }

            if (!completed.has('enable-buy-logistics')) {
                steps.push({
                    target: '[data-tour="market-buy-switch"]',
                    content: t('steps.market.9.content'),
                    title: t('steps.market.9.title'),
                    placement: 'auto',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'enable-buy-logistics' },
                });
            }

            if (!completed.has('expand-maintenance-accordion')) {
                steps.push({
                    target: '[data-tour="market-accordion-maintenance"]',
                    content: t('steps.market.10.content'),
                    title: t('steps.market.10.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'expand-maintenance-accordion' },
                });
            }

            if (!completed.has('enable-buy-maintenance')) {
                steps.push({
                    target: '[data-tour="market-buy-switch"]',
                    content: t('steps.market.11.content'),
                    title: t('steps.market.11.title'),
                    placement: 'right',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'enable-buy-maintenance' },
                });
            }

            steps.push({
                target: '[data-tour="market-sell-switch"]',
                content: t('steps.market.12.content'),
                title: t('steps.market.12.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="market-price-chart"]',
                content: t('steps.market.13.content'),
                title: t('steps.market.13.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="market-relevant-toggle"]',
                content: t('steps.market.14.content'),
                title: t('steps.market.14.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.market.15.content'),
                title: t('steps.market.15.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });

            break;
        }

        case 'production': {
            steps.push({
                target: '[data-tour="production-tabs"]',
                content: t('steps.production.0.content'),
                title: t('steps.production.0.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
                data: { timeoutMs: 30000 },
            });

            steps.push({
                target: '[data-tour="production-tabs"]',
                content: t('steps.production.1.content'),
                title: t('steps.production.1.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('click-plus-build')) {
                steps.push({
                    target: '[data-tour="production-build"]',
                    content: t('steps.production.2.content'),
                    title: t('steps.production.2.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'click-plus-build' },
                });
            }

            if (!completed.has('build-oil-well')) {
                steps.push({
                    target: '[data-tour="build-oil-well"]',
                    content: t('steps.production.3.content'),
                    title: t('steps.production.3.title'),
                    placement: 'top',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'build-oil-well' },
                });
            }

            steps.push({
                target: 'body',
                content: t('steps.production.4.content'),
                title: t('steps.production.4.title'),
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.production.5.content'),
                title: t('steps.production.5.title'),
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.production.6.content'),
                title: t('steps.production.6.title'),
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.production.7.content'),
                title: t('steps.production.7.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }

        case 'claims': {
            steps.push({
                target: 'body',
                content: t('steps.claims.0.content'),
                title: t('steps.claims.0.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { timeoutMs: 30000 },
            });

            if (!completed.has('lease-oil')) {
                steps.push({
                    target: '[data-tour="claims-oil"]',
                    content: t('steps.claims.1.content'),
                    title: t('steps.claims.1.title'),
                    placement: 'auto',
                    hideOverlay: false,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'lease-oil' },
                });
            }

            steps.push({
                target: 'body',
                content: t('steps.claims.2.content'),
                title: t('steps.claims.2.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="claims-active"]',
                content: t('steps.claims.3.content'),
                title: t('steps.claims.3.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="claims-active"]',
                content: t('steps.claims.4.content'),
                title: t('steps.claims.4.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.claims.5.content'),
                title: t('steps.claims.5.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.claims.6.content'),
                title: t('steps.claims.6.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }

        case 'storage': {
            steps.push({
                target: '[data-tour="storage-overview"]',
                content: t('steps.storage.0.content'),
                title: t('steps.storage.0.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
                data: { timeoutMs: 30000 },
            });

            steps.push({
                target: '[data-tour="storage-capacity"]',
                content: t('steps.storage.1.content'),
                title: t('steps.storage.1.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-department"] h3',
                content: t('steps.storage.2.content'),
                title: t('steps.storage.2.title'),
                placement: 'auto',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="facility-maintenance-row"]',
                content: t('steps.storage.3.content'),
                title: t('steps.storage.3.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-starvation"]',
                content: t('steps.storage.4.content'),
                title: t('steps.storage.4.title'),
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.storage.5.content'),
                title: t('steps.storage.5.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }

        case 'ships': {
            steps.push({
                target: '[data-tour="ships-tabs"]',
                content: t('steps.ships.0.content'),
                title: t('steps.ships.0.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
                data: { timeoutMs: 30000 },
            });

            steps.push({
                target: '[data-tour="ships-shipyards"]',
                content: t('steps.ships.1.content'),
                title: t('steps.ships.1.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-my-ships"]',
                content: t('steps.ships.2.content'),
                title: t('steps.ships.2.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-marketplace"]',
                content: t('steps.ships.3.content'),
                title: t('steps.ships.3.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-tabs"]',
                content: t('steps.ships.4.content'),
                title: t('steps.ships.4.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-tabs"]',
                content: t('steps.ships.5.content'),
                title: t('steps.ships.5.title'),
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.ships.6.content'),
                title: t('steps.ships.6.title'),
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: t('steps.ships.7.content'),
                title: t('steps.ships.7.title'),
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
            });
            break;
        }
    }

    return steps;
}

export type { PageRoute };
