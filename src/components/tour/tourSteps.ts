import type { Step as JoyrideStep } from 'react-joyride';

/**
 * Tour steps grouped by page route.
 * Each page returns the steps relevant to that page.
 * Navigation to the next page is handled externally via goToNextPage.
 */

type PageRoute = 'central-bank' | 'financial' | 'workforce' | 'claims' | 'production' | 'storage' | 'market' | 'ships';

/**
 * Get the steps for a given page in the tour.
 *
 * @param completedActions - Set of action keys already completed.
 *   Steps whose `data.actionKey` is in this set will be filtered out.
 */
export function getStepsForPage(
    page: PageRoute,
    planetId: string,
    agentId: string,
    completedActions?: string[],
): JoyrideStep[] {
    const completed = new Set(completedActions ?? []);
    const steps: JoyrideStep[] = [];

    switch (page) {
        case 'financial':
            // Step 0: Blocking — user must click the starter loan button to proceed.
            if (!completed.has('starter-loan')) {
                steps.push({
                    target: '[data-tour="starter-loan"]',
                    content:
                        'Click the green button above to take your starter loan. It provides initial capital to build your company infrastructure and hire workers.',
                    title: '\uD83C\uDFE6 Now take the loan',
                    placement: 'bottom',
                    hideOverlay: true,
                    blockTargetInteraction: false,
                    spotlightPadding: 8,
                    skipBeacon: true,
                    buttons: ['skip'],
                    locale: {
                        skip: 'Skip tour',
                    },
                    zIndex: 10000,
                    data: { blocking: true, actionKey: 'starter-loan' },
                });
            }

            steps.push({
                target: 'body',
                content:
                    'Your loan has been credited to your account. Now let\u2019s look at your financial overview and then move on.',
                title: '\u2705 Loan taken successfully!',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                locale: {
                    next: 'Next',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-overview"]',
                content:
                    'This is your Financial Overview. Here you can see your deposits, outstanding loans, and net position. Track your cash flow to ensure you stay profitable.',
                title: '\uD83D\uDCB0 Financial Overview',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: '[data-tour="financial-loan-panel"]',
                content:
                    'The loan panel lets you request additional loans or repay existing ones. Managing debt wisely is key to growing your company.',
                title: '\uD83D\uDCB3 Loan Management',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Now let\u2019s look at hiring workers. Your company needs a workforce to produce goods.',
                title: '\u27A1\uFE0F Next: Workforce',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                locale: {
                    next: 'Go to Workforce \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
                data: { navStep: true },
            });
            break;

        case 'workforce':
            steps.push({
                target: '[data-tour="workforce-wages"]',
                content:
                    'Set wages for each education level to attract workers. Higher wages attract more skilled employees, but also increase your costs.',
                title: '\uD83D\uDC77 Wage Settings',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: '[data-tour="workforce-allocation"]',
                content:
                    'Allocate workers to your facilities. You can automate this process with the toggle above so workers are assigned where they are needed most.',
                title: '\uD83D\uDD04 Worker Allocation',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Before you can produce, you need land and resources. Let\u2019s go to Land Claims.',
                title: '\u27A1\uFE0F Next: Land Claims',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                locale: {
                    next: 'Go to Claims \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
                data: { navStep: true },
            });
            break;

        case 'claims':
            steps.push({
                target: '[data-tour="claims-grid"]',
                content:
                    'Lease land claims to access natural resources. Each claim provides raw materials needed for production. Select available resources and lease them to start extraction.',
                title: '\uD83C\uDF0D Land Claims',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content:
                    'Now that you have resources, let\u2019s set up production facilities to turn them into products.',
                title: '\u27A1\uFE0F Next: Production',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                locale: {
                    next: 'Go to Production \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
                data: { navStep: true },
            });
            break;

        case 'production':
            steps.push({
                target: '[data-tour="production-facilities"]',
                content:
                    'Build production facilities to process raw materials into finished goods. Click on a facility card to expand it and see its inputs, outputs, and automation settings.',
                title: '\uD83C\uDFED Production Facilities',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Your products are stored in your warehouse. Let\u2019s check your storage.',
                title: '\u27A1\uFE0F Next: Storage',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                locale: {
                    next: 'Go to Storage \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
                data: { navStep: true },
            });
            break;

        case 'storage':
            steps.push({
                target: '[data-tour="storage-overview"]',
                content:
                    'This is your storage facility. It shows all the goods you have accumulated \u2014 both raw materials and finished products. Keep an eye on capacity!',
                title: '\uD83D\uDCE6 Storage Overview',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Now let\u2019s see the Market where you can buy inputs and sell your finished goods.',
                title: '\u27A1\uFE0F Next: Market',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                locale: {
                    next: 'Go to Market \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
                data: { navStep: true },
            });
            break;

        case 'market':
            steps.push({
                target: '[data-tour="market-overview"]',
                content:
                    'The Market panel shows buy and sell orders for all resources. You can place orders to buy inputs for production or sell your products to earn revenue.',
                title: '\uD83C\uDFEA Market Overview',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Finally, let\u2019s look at Ships \u2014 your gateway to interplanetary trade and expansion.',
                title: '\u27A1\uFE0F Next: Ships',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                locale: {
                    next: 'Go to Ships \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
                data: { navStep: true },
            });
            break;

        case 'ships':
            steps.push({
                target: '[data-tour="ships-tabs"]',
                content:
                    'Ships allow you to trade with other planets and expand your business across the solar system. Build ships at shipyards, manage your fleet, and trade on the ship marketplace.',
                title: '\uD83D\uDE80 Ship Management',
                placement: 'top',
                skipBeacon: true,
                locale: {
                    next: 'Finish',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content:
                    '\uD83C\uDF89 Congratulations! You have completed the guided tour. You now know the basics of managing your company. Feel free to explore each section in more detail. Good luck!',
                title: '\u2705 Tour Complete',
                placement: 'center',
                skipBeacon: true,
                locale: {
                    close: 'Finish Tour',
                    skip: 'Skip',
                    last: 'Finish',
                },
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
    }

    return steps;
}

export type { PageRoute };
