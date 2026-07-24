import type { Step as JoyrideStep } from 'react-joyride';

/**
 * Tour steps grouped by page route.
 * Each page returns the steps relevant to that page.
 * Navigation to the next page is handled externally via goToNextPage.
 *
 * PAGE_ORDER: financial → workforce → market → production → claims → storage → ships
 */

type PageRoute = 'financial' | 'workforce' | 'claims' | 'production' | 'storage' | 'market' | 'ships';

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
        case 'financial': {
            steps.push({
                target: 'body',
                content:
                    'Welcome to Game (name is work in progress)! This is a living, breathing macro-economic simulation. ' +
                    'You run a company on a dynamic planet. Every action — loans, hiring, production, trades — ' +
                    'is queued up and processed each  day. ',
                title: '\uD83C\uDF0D Welcome to Game!',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('starter-loan')) {
                steps.push({
                    target: '[data-tour="starter-loan"]',
                    content:
                        'Click the green button above to take your starter loan. It provides initial capital ' +
                        'to build your company infrastructure and hire workers. The loan is credited after ' +
                        'the current day completes.',
                    title: '\uD83C\uDFE6 Take your starter loan',
                    placement: 'bottom',
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
                content:
                    'Your loan has been credited to your account! Notice the "Pending" overlay — actions ' +
                    'are queued and processed on the next day. This is how the simulation works: you queue actions, ' +
                    'they resolve when time advances.',
                title: '\u2705 Loan taken successfully!',
                placement: 'top',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-overview"]',
                content:
                    'This is your Financial Overview. The left column shows your monthly cash flow: ' +
                    'revenue, wages, purchases, and claim payments. The right column shows your positions: ' +
                    'deposits, loans, and net position. The Net Cash Flow is your most important metric ' +
                    '\u2014 green means profit, red means burning cash!',
                title: '\uD83D\uDCC8 Financial Overview',
                placement: 'top',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-overview"]',
                content:
                    'Your facilities, ships, and storage have collateral value, which determines how much ' +
                    'you can borrow. The more assets you build, the more credit you unlock.',
                title: '\uD83C\uDFED Collateral',
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-charts"]',
                content:
                    'The charts below show your financial history over time. Below that, the Product Resolution ' +
                    'panel breaks down your monthly profit and loss by product. These help you spot trends ' +
                    'and see which products make you money.',
                title: '\uD83D\uDCCA Charts & Product P&L',
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-loan-panel"]',
                content:
                    'The Loan Management panel lets you request additional loans or repay existing ones early. ' +
                    'Loan amounts depend on your cash flow and collateral. ' +
                    'Improve your revenue and assets to unlock larger loans at better rates.',
                title: '\uD83C\uDFE6 Loan Management & Conditions',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: 'Now let\u2019s look at hiring workers. Your company needs a workforce to operate facilities.',
                title: '\u27A1\uFE0F Next: Workforce',
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
                content:
                    'Workers run your facilities. To attract them, you need to set competitive wages. ' +
                    'Workers are hired from the planet\u2019s population pool. If there are no unemployed ' +
                    'workers, increase wages to motivate foreign employees to quit.',
                title: '\uD83D\uDC77 Workforce Management',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-wages"]',
                content:
                    'Set wages for each education level. Higher wages attract more skilled employees, ' +
                    'but also increase your costs. Compare your wages against the global average (shown in parentheses).',
                title: '\uD83D\uDCB0 Wage Settings',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-wages"]',
                content:
                    'Education levels: Uneducated (basic labor), Primary, Secondary (skilled), ' +
                    'and Tertiary (specialists). Different facilities need different mixes. ' +
                    'Pay competitive wages or workers will go to your competitors!',
                title: '\uD83C\uDFEB Education Levels',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('enable-automation')) {
                steps.push({
                    target: '[data-tour="workforce-automation"]',
                    content:
                        'Expand the Automation Controls panel and toggle on "Automatic worker allocation". ' +
                        'The AI will then compute optimal headcount targets each day based on your facility ' +
                        'requirements. This is the recommended approach — manual allocation is tedious!',
                    title: '\uD83E\uDD16 Enable automation',
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
                content:
                    'Automation is now enabled! The AI will compute optimal headcount ' +
                    'targets each day based on your facility requirements.',
                title: '\u2705 Automation enabled successfully!',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-allocation"]',
                content:
                    'This panel shows worker allocation targets per education level. ' +
                    'With automation on, the AI sets these for you each day. Without automation, ' +
                    'you would set them manually here.',
                title: '\uD83D\uDD04 Worker Allocation',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-demographics-title"]',
                content:
                    'The Workforce Demography section shows your workforce composition: ' +
                    'headcount by education, age distribution, and tenure. Track how your workforce evolves.',
                title: '\uD83D\uDCCA Workforce Demographics',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-charts"]',
                content:
                    'These charts track total workers and wage costs over time. ' +
                    'Monitor your workforce growth and ensure wages stay competitive.',
                title: '\uD83D\uDCC8 Workforce Charts',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'Workers are hired/fired at each day. But newly hired, fired, retired and volutarily ' +
                    'leaving workers take 3 months to fully join/leave. Newly hired workers enter the onboarding ' +
                    'queue and workers leaving have all their own 3-month queues. ',
                title: '\u23F3 Patience pays off',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'We need construction services to build facilities. ' + 'Let\u2019s go to the market to buy some.',
                title: '\u27A1\uFE0F Next: Market',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }

        case 'market': {
            const isFirstMarketVisit = !completed.has('enable-buy-construction');

            if (isFirstMarketVisit) {
                // ── First visit: construction-services focus ──────────────
                steps.push({
                    target: '[data-tour="market-overview"]',
                    content:
                        'The Market is where you buy production inputs and sell finished goods. ' +
                        'Prices are determined by supply and demand \u2014 just like a real economy! ' +
                        'We\u2019re here to buy Construction Services, which are needed to build facilities.',
                    title: '\uD83C\uDFEA Market Overview',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-tabs"]',
                    content:
                        'Resources are grouped by level: Raw, Refined, Manufactured, Services, ' +
                        'and Currency (foreign exchange). Construction Services are in the Services tab. ' +
                        'Click the Services tab to find them.',
                    title: '\uD83D\uDCC2 Resource Levels',
                    placement: 'bottom',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-overview"]',
                    content:
                        'Each resource row shows key data: clearing price, total supply, total demand, ' +
                        'production, and consumption. Click column headers to sort. ' +
                        'Click on the Construction Services row to expand it and see buy/sell options.',
                    title: '\uD83D\uDCCA Market Data',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                if (!completed.has('expand-construction-accordion')) {
                    steps.push({
                        target: '[data-tour="market-accordion-construction"]',
                        content: 'Click on the Construction Services row to expand it and see buy/sell options.',
                        title: '\uD83D\uDD0D Expand Construction',
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
                        content:
                            'Toggle this switch to enable automated purchasing. ' +
                            'The AI will buy construction services each day to keep your stock filled. ' +
                            'You can configure pricing and volume strategies below.',
                        title: '\uD83D\uDED2 Enable Buy for Construction Services',
                        placement: 'auto',
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
                    content:
                        'Automated buying is now enabled! The AI will manage purchases for you. ' +
                        'Your facility will always have the construction services it needs.',
                    title: '\u2705 Buy enabled!',
                    placement: 'center',
                    hideOverlay: false,
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-accordion"]',
                    content:
                        'The Sell section lets you place offers to sell your products. ' +
                        'For now, we focus on buying \u2014 later you will sell your refined goods here.',
                    title: '\uD83D\uDCE4 Sell & Auto-Sell',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-accordion"]',
                    content:
                        'Every resource has a price history chart. Use this to spot trends and time your trades. ' +
                        'The red line is estimated production cost.',
                    title: '\uD83D\uDCC8 Price History',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-relevant-toggle"]',
                    content: 'This toggle filters the market to show only resources you can actually trade.',
                    title: '\uD83D\uDD0D Relevant Resources',
                    placement: 'bottom',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-overview"]',
                    content:
                        'Market orders are processed on the next day. ' +
                        'You will see pending overlays while waiting for your orders to fill.',
                    title: '\u23F3 Pending Orders',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: 'body',
                    content:
                        'Now that we have construction services being bought automatically, ' +
                        'let\u2019s build a facility!',
                    title: '\u27A1\uFE0F Next: Production',
                    placement: 'center',
                    hideOverlay: false,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { navStep: true },
                });
            } else {
                // ── Second visit: full market tour ────────────────────────
                steps.push({
                    target: '[data-tour="market-overview"]',
                    content:
                        'Welcome back to the Market! Now that you have production running, ' +
                        'you can sell your Crude Oil here and buy other inputs you need.',
                    title: '\uD83C\uDFEA Market Overview',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-tabs"]',
                    content:
                        'Resources are grouped by level: Raw, Refined, Manufactured, Services, ' +
                        'and Currency (foreign exchange). Use these tabs to filter what you see.',
                    title: '\uD83D\uDCC2 Resource Levels',
                    placement: 'bottom',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-overview"]',
                    content:
                        'Each resource row shows key data: clearing price, total supply, total demand, ' +
                        'production, and consumption. Click column headers to sort.',
                    title: '\uD83D\uDCCA Market Data',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-accordion"]',
                    content: 'Click any resource row to expand it. This reveals the buy and sell sections.',
                    title: '\uD83D\uDD0D Expand a Resource',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-accordion"]',
                    content:
                        'The Buy section lets you place bids to purchase resources. ' +
                        'Set a price and quantity, or enable the automation toggle to let the AI manage buying.',
                    title: '\uD83D\uDED2 Buy & Auto-Buy',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-accordion"]',
                    content:
                        'The Sell section lets you place offers to sell your products. ' +
                        'Set your asking price, or enable auto-sell to let the AI manage pricing.',
                    title: '\uD83D\uDCE4 Sell & Auto-Sell',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-accordion"]',
                    content: 'Every resource has a price history chart. Use this to spot trends and time your trades.',
                    title: '\uD83D\uDCC8 Price History',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-tabs"]',
                    content: 'The "Currency" tab shows foreign exchange markets for interplanetary commerce.',
                    title: '\uD83D\uDCB1 Currency Markets',
                    placement: 'bottom',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-relevant-toggle"]',
                    content: 'This toggle filters the market to show only resources you can actually trade.',
                    title: '\uD83D\uDD0D Relevant Resources',
                    placement: 'bottom',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: '[data-tour="market-overview"]',
                    content:
                        'Market orders are processed on the next day. ' +
                        'You will see pending overlays while waiting for your orders to fill.',
                    title: '\u23F3 Pending Orders',
                    placement: 'top',
                    skipBeacon: true,
                    zIndex: 10000,
                });

                steps.push({
                    target: 'body',
                    content: 'Finally, let\u2019s look at Ships \u2014 your gateway to interplanetary trade!',
                    title: '\u27A1\uFE0F Next: Ships',
                    placement: 'center',
                    hideOverlay: false,
                    skipBeacon: true,
                    zIndex: 10000,
                    data: { navStep: true },
                });
            }
            break;
        }

        case 'production': {
            steps.push({
                target: '[data-tour="production-facilities"]',
                content:
                    'Production facilities transform raw materials into refined goods, ' +
                    'manufactured products, and services. This is how value is created \u2014 and how you make profit! ' +
                    'We have construction services ready, so let\u2019s build an Oil Well.',
                title: '\uD83C\uDFED Production Facilities',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="production-tabs"]',
                content:
                    'Facilities are organized by level: Raw (extraction), Refined (processing), ' +
                    'Manufactured (assembly), and Services. The Oil Well is a Refined facility ' +
                    '\u2014 the badge count shows how many of each type you own.',
                title: '\uD83D\uDCC2 Facility Levels',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('click-plus-build')) {
                steps.push({
                    target: '[data-tour="production-build"]',
                    content:
                        'Click the "+ Build facility" card to start constructing a new facility. ' +
                        'We will build an Oil Well to process crude oil.',
                    title: '\uD83D\uDEE0\uFE0F Click to build',
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
                    content:
                        'This is the Oil Well. It consumes Crude Oil from a reservoir and produces... Crude Oil! ' +
                        'Click the "Build" button below to order construction. ' +
                        'The build uses Construction Services from your storage.',
                    title: '\uD83D\uDEE0\uFE0F Build Oil Well',
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
                target: '[data-tour="production-facilities"]',
                content:
                    'Your Oil Well build request has been sent! After a tick, it will appear as "Under Construction". ' +
                    'Construction consumes Construction Services from your storage each day until complete. ' +
                    'You can track progress on the card \u2014 the bar fills up as construction progresses.',
                title: '\u23F3 Construction started',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="production-facilities"]',
                content:
                    'Once construction finishes, the facility becomes active. The card shows: ' +
                    'inputs it consumes (left) and outputs it produces (right), worker efficiency bars, ' +
                    'and a revenue row showing revenue, input costs, wages, and net profit per day. ' +
                    'Keep an eye on input buffers \u2014 if they run out, production stops!',
                title: '\u2699\uFE0F Active Facility',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="production-facilities"]',
                content:
                    'You can build multiple copies of each facility type to scale production. ' +
                    'Use the operating scale slider to set capacity from 0% to 100%. ' +
                    'Also consider upgrading to larger scales for better efficiency.',
                title: '\uD83D\uDCE1 Scaling Up',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'The Oil Well needs Crude Oil from a reservoir. ' +
                    'Let\u2019s lease an Oil Reservoir to supply it.',
                title: '\u27A1\uFE0F Next: Land Claims',
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
                content:
                    'Land Claims give you access to natural resources on the planet. ' +
                    'Your Oil Well needs Crude Oil from an Oil Reservoir. ' +
                    'Without a claim, the well has nothing to extract!',
                title: '\uD83C\uDF0D Land Claims',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            if (!completed.has('lease-oil')) {
                steps.push({
                    target: '[data-tour="claims-oil"]',
                    content:
                        'Click the "Lease" button on the Oil reservoir card to secure your first resource claim. ' +
                        'Select a capacity and confirm \u2014 a monthly fee will be charged based on the tier you choose. ' +
                        'This oil will feed your Oil Well!',
                    title: '\uD83D\uDD11 Lease Oil reservoir',
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
                content:
                    'Your oil claim has been leased! Resources are extracted automatically each day. ' +
                    'The oil will flow to your Oil Well, which turns it into Crude Oil for refining or sale. ' +
                    'Notice the active claim card now shows stock levels, extraction rate, and depletion estimate.',
                title: '\u2705 Oil claim leased successfully!',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="claims-active"]',
                content:
                    'Once leased, you have an active claim. Resources are extracted automatically ' +
                    'each day. The card shows stock levels, extraction rate, and depletion estimate. ' +
                    'Renewable resources (e.g., farms, water) regenerate over time.',
                title: '\u2699\uFE0F Active Claims',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="claims-active"]',
                content:
                    'You can expand a claim to increase extraction capacity. ' +
                    'Non-renewable resources will eventually deplete, so plan accordingly!',
                title: '\uD83D\uDD0D Scaling Claims',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'Resources form a chain: raw materials (level 0) feed refineries (level 1), ' +
                    'which feed manufacturers (level 2), and so on. You now have: ' +
                    'Oil Reservoir (raw) \u27A1\uFE0F Oil Well (refined) \u27A1\uFE0F Market. ' +
                    'Start with basic resources and work your way up the value chain!',
                title: '\uD83D\uDD17 Resource Chains',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: 'Your products are stored in your warehouse. Let\u2019s check your inventory.',
                title: '\u27A1\uFE0F Next: Storage',
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
                content:
                    'This is your storage facility \u2014 the warehouse that holds all your goods. ' +
                    'Raw materials, intermediate goods, and finished products all live here.',
                title: '\uD83D\uDCE6 Storage Overview',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-overview"]',
                content:
                    'The inventory shows quantities and values of everything you hold. ' +
                    'Keep an eye on what is accumulating and what is running low.',
                title: '\uD83D\uDCC6 Inventory',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-overview"]',
                content:
                    'Storage has limited capacity. If full, your facilities stop producing! ' +
                    'Sell excess goods on the market or expand your storage to free up space.',
                title: '\uD83D\uDCC1 Capacity',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-overview"]',
                content:
                    'Your stored goods count as collateral for loans. The more valuable your ' +
                    'inventory, the more credit you can access.',
                title: '\uD83D\uDCB0 Storage as Collateral',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content: 'Now let\u2019s revisit the Market to see how things are going.',
                title: '\u27A1\uFE0F Next: Market',
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
                content:
                    'Ships enable interplanetary trade. With a fleet, you can transport goods between planets, ' +
                    'access foreign markets, and build a truly galactic supply chain!',
                title: '\uD83D\uDE80 Ship Management',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-shipyards"]',
                content:
                    'The Shipyards tab is where you build new ships. Select a ship type, pay the construction ' +
                    'cost, and wait for it to be built \u2014 just like building facilities.',
                title: '\uD83D\uDEE0\uFE0F Shipyards',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-my-ships"]',
                content:
                    'My Ships shows your fleet. Ships can be idle, traveling, or actively trading. ' +
                    'Manage routes, view cargo, and track earnings.',
                title: '\uD83D\uDEA2 My Ships',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-marketplace"]',
                content:
                    'The Ship Marketplace lets you buy and sell ships with other companies. ' +
                    'A great way to get started without building from scratch!',
                title: '\uD83D\uDED2 Ship Marketplace',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-tabs"]',
                content:
                    'Ships earn revenue by fulfilling transport contracts between planets. ' +
                    'The more trade routes you establish, the more your fleet generates income.',
                title: '\uD83D\uDCE6 Transport Contracts',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="ships-tabs"]',
                content:
                    'The ultimate goal: establish production on multiple planets, trade between them ' +
                    'using your fleet, and build an interplanetary supply chain. Buy low on one planet, ' +
                    'sell high on another!',
                title: '\uD83C\uDF0D Multi-Planet Strategy',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'Here\u2019s the core gameplay loop: ' +
                    '\uD83D\uDC4D Lease land claims to get resources ' +
                    '\u27A1\uFE0F Build production facilities ' +
                    '\u27A1\uFE0F Hire workers (with automation!) ' +
                    '\u27A1\uFE0F Produce goods ' +
                    '\u27A1\uFE0F Sell on the market for profit ' +
                    '\u27A1\uFE0F Reinvest to grow ' +
                    '\u27A1\uFE0F Build ships and expand to other planets!',
                title: '\uD83D\uDD04 The Gameplay Loop',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    '\uD83C\uDF89 Congratulations! You have completed the guided tour. ' +
                    'You now understand the core mechanics of Game. ' +
                    'Explore each section in detail, experiment with strategies, ' +
                    'and build your interplanetary economic empire. Good luck, CEO!',
                title: '\u2705 Tour Complete',
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
