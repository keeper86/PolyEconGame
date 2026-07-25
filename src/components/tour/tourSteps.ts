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
                        'Click the button above to take your starter loan. It provides initial capital ' +
                        'to build your company infrastructure and hire workers. The loan is credited after ' +
                        'the current day completes.',
                    title: '\uD83C\uDFE6 Take your starter loan',
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
                content:
                    'Your loan request has been queued! It will be credited after the current day completes. ' +
                    'Notice the "Pending" overlay — actions are queued and processed on the next day. ' +
                    'This is how the simulation works: you queue actions, they resolve when time advances.',
                title: '\u2705 Loan taken successfully!',
                placement: 'top',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-cash-flow"]',
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
                target: '[data-tour="financial-positions"]',
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
                target: '[data-tour="financial-expenses-revenue-chart"]',
                content:
                    'This chart breaks down your expenses and revenue over time. ' +
                    'Track how your operational costs compare to income — revenue should trend up ' +
                    'as your production grows.',
                title: '\uD83D\uDCC8 Expenses & Revenue Chart',
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-balance-flow-chart"]',
                content:
                    'The Balance Flow chart shows your net cash position over time. ' +
                    'A rising trend means you are building cash reserves. A falling trend signals ' +
                    'you may need to adjust your operations or take a loan.',
                title: '\uD83D\uDCC8 Balance Flow Chart',
                placement: 'bottom',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="financial-product-resolution"]',
                content:
                    'The Product Resolution panel breaks down your monthly profit and loss by product. ' +
                    'See which products make you money and which are costing you.',
                title: '\uD83D\uDCCA Product P&L',
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
                content:
                    'Now let\u2019s look at hiring workers. Your company needs a workforce to operate facilities. ' +
                    'We now navigate to the Workforce page. This may take a few seconds.',
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
                    'Workers run your facilities. They are hired from the planet\u2019s population pool. ' +
                    'This panel shows your current wages per education level compared to the planet average ' +
                    '(shown in parentheses). Wages are managed automatically by the AI.',
                title: '\uD83D\uDC77 Workforce Management',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-wages"]',
                content:
                    'Education levels: Uneducated (basic labor), Primary, Secondary (skilled), ' +
                    'and Tertiary (specialists). Different facilities need different skill mixes. ' +
                    'Higher pay attracts more skilled employees but increases your costs.',
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
                target: '[data-tour="workforce-age-distribution"]',
                content:
                    'The age distribution chart breaks down your workforce by age group. ' +
                    'A balanced age pyramid indicates healthy workforce renewal. ' +
                    'Too many older workers may signal future retirement waves.',
                title: '\uD83D\uDCC8 Age Distribution',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="workforce-tenure-chart"]',
                content:
                    'The tenure chart shows how long your workers have been employed. ' +
                    'High tenure means experienced staff, while new hires bring fresh skills. ' +
                    'Track retention and onboarding trends here.',
                title: '\uD83D\uDCC8 Tenure per Capita',
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
                    'Worker changes are processed each day, but transitions take time. Newly hired workers ' +
                    'enter an onboarding queue, and departing workers (fired, retired, or voluntarily leaving) ' +
                    'each have their own 3-month departure queue. Be patient \u2014 workforce changes are gradual!',
                title: '\u23F3 Patience pays off',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'We need construction services to build facilities. ' +
                    'Let\u2019s go to the market to buy some. ' +
                    'We now navigate to the Market page. This may take a few seconds.',
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
            // ── First visit: construction-services focus ──────────────
            steps.push({
                target: '[data-tour="market-overview"]',
                content:
                    'The Market is where you buy production inputs and sell finished goods. ' +
                    'Prices are determined by supply and demand \u2014 just like a real economy! ' +
                    'We\u2019re here to buy Construction Services, which are needed to build facilities.',
                title: '\uD83C\uDFEA Market Overview',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="market-tab-services"]',
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
                target: '[data-tour="market-accordion"]',
                content:
                    'Each resource row shows key data: clearing price, total supply, total demand, ' +
                    'production, and consumption. Click column headers to sort. ' +
                    'Click on the Construction Services row to expand it and see buy/sell options.',
                title: '\uD83D\uDCCA Market Data',
                placement: 'bottom',
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
                        'The AI will buy construction services each day to keep your stock filled when you require the resource. ' +
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
                target: '[data-tour="market-sell-switch"]',
                content:
                    'The Sell section lets you place offers to sell your products. ' +
                    'For now, we focus on buying \u2014 later you will sell your refined goods here.',
                title: '\uD83D\uDCE4 Sell & Auto-Sell',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="market-price-chart"]',
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
                content: 'This toggle filters the market to show only resources that you require or produce.',
                title: '\uD83D\uDD0D Relevant Resources',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'Now that we have construction services being bought automatically, ' +
                    'let\u2019s build a facility! ' +
                    'We now navigate to the Production page. This may take a few seconds.',
                title: '\u27A1\uFE0F Next: Production',
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
                    'Manufactured (assembly), and Services. The Oil Well is a Raw Extraction facility ' +
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
                        'We will build an Oil Well to extract crude oil.',
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
                        'This is the Oil Well. It extracts Crude Oil from a land claim (Oil Reservoir). ' +
                        'Click the "Build" button to order construction. ' +
                        'The build uses Construction Services which will be automatically ' +
                        'bought from the market. The build will take a few days to complete.',
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
                target: 'body',
                content:
                    'Your Oil Well build request has been sent! After a day, it will appear as "Under Construction". ' +
                    'Construction consumes Construction Services from your storage each day until complete. ' +
                    'You can track progress on the card \u2014 the bar fills up as construction progresses.',
                title: '\u23F3 Construction started',
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'Once construction finishes, the facility becomes active. The card shows: ' +
                    'inputs it consumes (left) and outputs it produces (right), worker efficiency bars, ' +
                    'and a revenue row showing revenue, input costs, wages, and net profit per day. ' +
                    'Keep an eye on input buffers \u2014 if they run out, production stops!',
                title: '\u2699\uFE0F Active Facility',
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'You can build multiple copies of each facility type to scale production. ' +
                    'Use the operating scale slider to set capacity from 0% to 100%. ' +
                    'Also consider upgrading to larger scales for better efficiency.',
                title: '\uD83D\uDCE1 Scaling Up',
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'The Oil Well needs an Oil Reservoir land claim to extract Crude Oil. ' +
                    'Let\u2019s lease one to supply it. ' +
                    'We now navigate to the Land Claims page. This may take a few seconds.',
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
                    'Your Oil Well needs access to an Oil Reservoir to extract Crude Oil. ' +
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
                        'Click the "Lease" button on the Oil Reservoir card to secure your first resource claim. ' +
                        'Select a capacity and confirm \u2014 a one-time flat cost will be charged based on the tier you choose. ' +
                        'This reservoir will supply your Oil Well!',
                    title: '\uD83D\uDD11 Lease Oil Reservoir',
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
                    'The extracted resource flows to your Oil Well, which produces Crude Oil for refining or sale. ' +
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
                    'Oil Reservoir (raw) \u27A1\uFE0F Oil Well (extraction) \u27A1\uFE0F Market. ' +
                    'Start with basic resources and work your way up the value chain!',
                title: '\uD83D\uDD17 Resource Chains',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: 'body',
                content:
                    'Your products are stored in your warehouse. Let\u2019s check your inventory. ' +
                    'We now navigate to the Storage page. This may take a few seconds.',
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
                target: '[data-tour="storage-inventory"]',
                content:
                    'This is your storage facility \u2014 the warehouse that holds all your goods. ' +
                    'Raw materials, intermediate goods, and finished products all live here.',
                title: '\uD83D\uDCE6 Storage Overview',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-inventory"]',
                content:
                    'The inventory shows quantities and values of everything you hold. ' +
                    'Keep an eye on what is accumulating and what is running low.',
                title: '\uD83D\uDCC6 Inventory',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-capacity"]',
                content:
                    'Storage has limited capacity. If full, your facilities stop producing! ' +
                    'Sell excess goods on the market or expand your storage to free up space.',
                title: '\uD83D\uDCC1 Capacity',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            steps.push({
                target: '[data-tour="storage-inventory"]',
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
                content:
                    'Now let\u2019s revisit the Market to see how things are going. ' +
                    'We now navigate to the Market page. This may take a few seconds.',
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
