import type { Step as JoyrideStep } from 'react-joyride';

/**
 * Tour steps grouped by page route.
 * Each page returns the steps relevant to that page.
 * The tour progresses through pages via navigation in step `after` callbacks.
 *
 * Note: joyride v3 Step type = SharedProps & Partial<Options> & { content, target, ... }.
 * Properties like disableBeacon, showSkipButton, showProgress are NOT on Step -
 * they are on the top-level Props instead.
 */

type PageRoute = 'central-bank' | 'financial' | 'workforce' | 'claims' | 'production' | 'storage' | 'market' | 'ships';

/**
 * Get the steps for a given page in the tour.
 */
export function getStepsForPage(
    page: PageRoute,
    planetId: string,
    agentId: string,
    routerPush: (url: string) => void,
): JoyrideStep[] {
    const steps: JoyrideStep[] = [];

    switch (page) {
        case 'central-bank':
            steps.push({
                target: '[data-tour="starter-loan"]',
                content:
                    'This green button lets you take your first starter loan. It provides initial capital to build your company infrastructure and hire workers.',
                title: '\uD83C\uDFE6 Starter Loan',
                placement: 'bottom',
                hideOverlay: false,
                spotlightPadding: 8,
                locale: {
                    next: 'Next',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
            });
            steps.push({
                target: '[data-tour="bank-panel"]',
                content:
                    'This panel shows the central bank\u2019s key metrics \u2014 equity, policy rate, and money supply. Keep an eye on these as they affect loan conditions.',
                title: '\uD83C\uDFDB\uFE0F Central Bank Overview',
                placement: 'top',
                locale: {
                    next: 'Next',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content:
                    'Now let\u2019s head to your Financial Overview to see your deposits and cash flow after taking the loan.',
                title: '\u27A1\uFE0F Next: Financial Overview',
                placement: 'center',
                hideOverlay: false,
                locale: {
                    next: 'Go to Finances \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                after: () => {
                    routerPush(
                        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/financial`,
                    );
                },
                zIndex: 10000,
            });
            break;

        case 'financial':
            steps.push({
                target: '[data-tour="financial-overview"]',
                content:
                    'This is your Financial Overview. Here you can see your deposits, outstanding loans, and net position. Track your cash flow to ensure you stay profitable.',
                title: '\uD83D\uDCB0 Financial Overview',
                placement: 'bottom',
                zIndex: 10000,
            });
            steps.push({
                target: '[data-tour="financial-loan-panel"]',
                content:
                    'The loan panel lets you request additional loans or repay existing ones. Managing debt wisely is key to growing your company.',
                title: '\uD83D\uDCB3 Loan Management',
                placement: 'top',
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Now let\u2019s look at hiring workers. Your company needs a workforce to produce goods.',
                title: '\u27A1\uFE0F Next: Workforce',
                placement: 'center',
                hideOverlay: false,
                locale: {
                    next: 'Go to Workforce \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                after: () => {
                    routerPush(
                        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/workforce`,
                    );
                },
                zIndex: 10000,
            });
            break;

        case 'workforce':
            steps.push({
                target: '[data-tour="workforce-wages"]',
                content:
                    'Set wages for each education level to attract workers. Higher wages attract more skilled employees, but also increase your costs.',
                title: '\uD83D\uDC77 Wage Settings',
                placement: 'bottom',
                zIndex: 10000,
            });
            steps.push({
                target: '[data-tour="workforce-allocation"]',
                content:
                    'Allocate workers to your facilities. You can automate this process with the toggle above so workers are assigned where they are needed most.',
                title: '\uD83D\uDD04 Worker Allocation',
                placement: 'top',
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Before you can produce, you need land and resources. Let\u2019s go to Land Claims.',
                title: '\u27A1\uFE0F Next: Land Claims',
                placement: 'center',
                hideOverlay: false,
                locale: {
                    next: 'Go to Claims \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                after: () => {
                    routerPush(`/planets/${encodeURIComponent(planetId)}/claims`);
                },
                zIndex: 10000,
            });
            break;

        case 'claims':
            steps.push({
                target: '[data-tour="claims-grid"]',
                content:
                    'Lease land claims to access natural resources. Each claim provides raw materials needed for production. Select available resources and lease them to start extraction.',
                title: '\uD83C\uDF0D Land Claims',
                placement: 'top',
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content:
                    'Now that you have resources, let\u2019s set up production facilities to turn them into products.',
                title: '\u27A1\uFE0F Next: Production',
                placement: 'center',
                hideOverlay: false,
                locale: {
                    next: 'Go to Production \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                after: () => {
                    routerPush(
                        `/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/production`,
                    );
                },
                zIndex: 10000,
            });
            break;

        case 'production':
            steps.push({
                target: '[data-tour="production-facilities"]',
                content:
                    'Build production facilities to process raw materials into finished goods. Click on a facility card to expand it and see its inputs, outputs, and automation settings.',
                title: '\uD83C\uDFED Production Facilities',
                placement: 'top',
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Your products are stored in your warehouse. Let\u2019s check your storage.',
                title: '\u27A1\uFE0F Next: Storage',
                placement: 'center',
                hideOverlay: false,
                locale: {
                    next: 'Go to Storage \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                after: () => {
                    routerPush(`/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/storage`);
                },
                zIndex: 10000,
            });
            break;

        case 'storage':
            steps.push({
                target: '[data-tour="storage-overview"]',
                content:
                    'This is your storage facility. It shows all the goods you have accumulated \u2014 both raw materials and finished products. Keep an eye on capacity!',
                title: '\uD83D\uDCE6 Storage Overview',
                placement: 'top',
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Now let\u2019s see the Market where you can buy inputs and sell your finished goods.',
                title: '\u27A1\uFE0F Next: Market',
                placement: 'center',
                hideOverlay: false,
                locale: {
                    next: 'Go to Market \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                after: () => {
                    routerPush(`/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/market`);
                },
                zIndex: 10000,
            });
            break;

        case 'market':
            steps.push({
                target: '[data-tour="market-overview"]',
                content:
                    'The Market panel shows buy and sell orders for all resources. You can place orders to buy inputs for production or sell your products to earn revenue.',
                title: '\uD83C\uDFEA Market Overview',
                placement: 'top',
                zIndex: 10000,
            });
            steps.push({
                target: 'body',
                content: 'Finally, let\u2019s look at Ships \u2014 your gateway to interplanetary trade and expansion.',
                title: '\u27A1\uFE0F Next: Ships',
                placement: 'center',
                hideOverlay: false,
                locale: {
                    next: 'Go to Ships \u2192',
                    skip: 'Skip tour',
                    last: 'Finish',
                },
                after: () => {
                    routerPush(`/planets/${encodeURIComponent(planetId)}/agent/${encodeURIComponent(agentId)}/ships`);
                },
                zIndex: 10000,
            });
            break;

        case 'ships':
            steps.push({
                target: '[data-tour="ships-tabs"]',
                content:
                    'Ships allow you to trade with other planets and expand your business across the solar system. Build ships at shipyards, manage your fleet, and trade on the ship marketplace.',
                title: '\uD83D\uDE80 Ship Management',
                placement: 'top',
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
                locale: {
                    close: 'Finish Tour',
                    skip: 'Skip',
                    last: 'Finish',
                },
                zIndex: 10000,
            });
            break;
    }

    return steps;
}

export type { PageRoute };
