import type { Step as JoyrideStep } from 'react-joyride';

/**
 * Tour steps grouped by page route.
 * Each page returns the steps relevant to that page.
 * Navigation to the next page is handled externally via goToNextPage.
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
            // Step 0: Welcome intro
            steps.push({
                target: 'body',
                content:
                    'Welcome to Game (name is work in progress)! This is a living, breathing macro-economic simulation. ' +
                    'You run a company on a dynamic planet. Every action — loans, hiring, production, trades — ' +
                    'is queued up and processed each simulation tick (30 days per month). ',
                title: '\uD83C\uDF0D Welcome to PolyEconGame!',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 1: Blocking — user must click the starter loan button to proceed.
            if (!completed.has('starter-loan')) {
                steps.push({
                    target: '[data-tour="starter-loan"]',
                    content:
                        'Click the green button above to take your starter loan. It provides initial capital ' +
                        'to build your company infrastructure and hire workers. The loan is credited after ' +
                        'the current tick completes.',
                    title: '\uD83C\uDFE6 Take your starter loan',
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

            // Step 2: Loan confirmed
            steps.push({
                target: 'body',
                content:
                    'Your loan has been credited to your account! Notice the "Pending" overlay — actions ' +
                    'are queued and processed on the next tick. This is how the simulation works: you queue actions, ' +
                    'they resolve when time advances.',
                title: '\u2705 Loan taken successfully!',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 3: Financial Overview
            steps.push({
                target: 'body',
                content:
                    'Below is your Financial Overview. The left column shows your monthly cash flow: ' +
                    'revenue, wages, purchases, and claim payments. The right column shows your positions: ' +
                    'deposits, loans, and net position. The Net Cash Flow is your most important metric ' +
                    '\u2014 green means profit, red means burning cash!',
                title: '\uD83D\uDCC8 Financial Overview',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 4: Collateral values
            steps.push({
                target: 'body',
                content:
                    'Your facilities, ships, and storage have collateral value, which determines how much ' +
                    'you can borrow. The more assets you build, the more credit you unlock.',
                title: '\uD83C\uDFED Collateral',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 5: Financial charts & product resolution
            steps.push({
                target: 'body',
                content:
                    'The charts below show your financial history over time. Below that, the Product Resolution ' +
                    'panel breaks down your monthly profit and loss by product. These help you spot trends ' +
                    'and see which products make you money.',
                title: '\uD83D\uDCCA Charts & Product P&L',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 6: Loan panel
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

            // Step 7: Navigate to Workforce
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
            // Step 0: Workforce intro
            steps.push({
                target: '[data-tour="workforce-wages"]',
                content:
                    'Workers run your facilities. To attract them, you need to set competitive wages. ' +
                    'Workers are hired from the planet\u2019s population pool at the end of each month.',
                title: '\uD83D\uDC77 Workforce Management',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 1: Wage settings
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

            // Step 2: Education levels
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

            // Step 3: Blocking — enable automation
            if (!completed.has('enable-automation')) {
                steps.push({
                    target: '[data-tour="workforce-automation"]',
                    content:
                        'Expand the Automation Controls panel and toggle on "Automatic worker allocation". ' +
                        'The AI will then compute optimal headcount targets each tick based on your facility ' +
                        'requirements. This is the recommended approach — manual allocation is tedious!',
                    title: '\uD83E\uDD16 Enable automation',
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
                    data: { blocking: true, actionKey: 'enable-automation' },
                });
            }

            // Step 4: Worker allocation (with automation context)
            steps.push({
                target: '[data-tour="workforce-allocation"]',
                content:
                    'This panel shows worker allocation targets per education level. ' +
                    'With automation on, the AI sets these for you each tick. Without automation, ' +
                    'you would set them manually here.',
                title: '\uD83D\uDD04 Worker Allocation',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 5: Demographics
            steps.push({
                target: '[data-tour="workforce-demographics"]',
                content:
                    'The Workforce Demography section shows your workforce composition: ' +
                    'headcount by education, age distribution, and tenure. Track how your workforce evolves.',
                title: '\uD83D\uDCCA Workforce Demographics',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 6: Workforce charts
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

            // Step 7: Hint about timing
            steps.push({
                target: 'body',
                content:
                    'Workers are hired/fired at the end of each month tick. Changes take time to take effect ' +
                    '\u2014 be patient! If you just set wages, workers will arrive on the next month rollover.',
                title: '\u23F3 Patience pays off',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 8: Navigate to Claims
            steps.push({
                target: 'body',
                content:
                    'Before you can produce, you need raw resources. Let\u2019s go to Land Claims ' +
                    'to lease resource extraction rights.',
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
            // Step 0: Claims intro
            steps.push({
                target: '[data-tour="claims-grid"]',
                content:
                    'Land Claims give you access to natural resources on the planet. ' +
                    'Resources are the raw inputs for your production chain. Without them, ' +
                    'your facilities have nothing to process!',
                title: '\uD83C\uDF0D Land Claims',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 1: Available resources
            steps.push({
                target: '[data-tour="claims-grid"]',
                content:
                    'Cards with a green "Lease" button show resources you can rent. ' +
                    'Each card shows available capacity and total capacity. Click to expand ' +
                    'and see pricing tiers.',
                title: '\uD83D\uDCCB Available Resources',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 2: Lease a claim
            steps.push({
                target: '[data-tour="claims-lease"]',
                content:
                    'To lease a resource, select how much capacity you want and confirm. ' +
                    'You will pay a monthly fee based on the tier you choose. ' +
                    'Make sure you have enough cash flow to cover the costs!',
                title: '\uD83D\uDD11 Leasing a Claim',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 3: Active claims
            steps.push({
                target: '[data-tour="claims-active"]',
                content:
                    'Once leased, you have an active claim. Resources are extracted automatically ' +
                    'each tick. The card shows stock levels, extraction rate, and depletion estimate. ' +
                    'Renewable resources (e.g., farms, water) regenerate over time.',
                title: '\u2699\uFE0F Active Claims',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 4: Scaling
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

            // Step 5: Resource chains
            steps.push({
                target: '[data-tour="claims-grid"]',
                content:
                    'Resources form a chain: raw materials (level 0) feed refineries (level 1), ' +
                    'which feed manufacturers (level 2), and so on. Start with basic resources ' +
                    'and work your way up the value chain!',
                title: '\uD83D\uDD17 Resource Chains',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 6: Navigate to Production
            steps.push({
                target: 'body',
                content:
                    'Now that you have resources flowing, let\u2019s set up production facilities ' +
                    'to turn them into valuable products.',
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
            // Step 0: Production intro
            steps.push({
                target: '[data-tour="production-facilities"]',
                content:
                    'Production facilities are where raw materials are transformed into refined goods, ' +
                    'manufactured products, and services. This is how value is created \u2014 and how you make profit!',
                title: '\uD83C\uDFED Production Facilities',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 1: Facility level tabs
            steps.push({
                target: '[data-tour="production-tabs"]',
                content:
                    'Facilities are organized by level: Raw (extraction), Refined (processing), ' +
                    'Manufactured (assembly), and Services. Work your way up the chain for higher margins. ' +
                    'The badge count shows how many of each type you own.',
                title: '\uD83D\uDCC2 Facility Levels',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 2: Building a facility
            steps.push({
                target: '[data-tour="production-build"]',
                content:
                    'Click the "+ Build facility" card to start constructing a new facility. ' +
                    'You will need construction services (bought on the market) and sufficient funds.',
                title: '\uD83D\uDEE0\uFE0F Building a Facility',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 3: Construction time
            steps.push({
                target: '[data-tour="production-build"]',
                content:
                    'Construction takes multiple ticks \u2014 you will see progress on the build card. ' +
                    'Once complete, the facility becomes active and starts producing.',
                title: '\u23F3 Construction Timeline',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 4: Active facility
            steps.push({
                target: '[data-tour="production-active"]',
                content:
                    'An active facility shows its inputs (what it consumes) and outputs (what it produces). ' +
                    'Worker efficiency bars show how well staffed it is. ' +
                    'The bottom row shows revenue, input costs, wages, and net profit per day.',
                title: '\u2699\uFE0F Active Facility',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 5: Input/Output buffers
            steps.push({
                target: '[data-tour="production-active"]',
                content:
                    'Facilities pull inputs from your storage and push outputs back. ' +
                    'Keep an eye on buffer levels \u2014 if inputs run out, production stops. ' +
                    'If outputs fill up, production also stalls!',
                title: '\uD83D\uDCE6 Input/Output Buffers',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 6: Automation
            steps.push({
                target: '[data-tour="production-active"]',
                content:
                    'Facility automation lets you set auto-sell thresholds and production targets. ' +
                    'Configure these to keep production running smoothly without constant manual intervention.',
                title: '\uD83E\uDD16 Facility Automation',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 7: Efficiency
            steps.push({
                target: '[data-tour="production-active"]',
                content:
                    'Facility efficiency depends on worker allocation, input availability, ' +
                    'and technology level. The bar chart shows which resources are limiting production.',
                title: '\uD83D\uDCC8 Efficiency',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 8: Scaling up
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

            // Step 9: Construction services
            steps.push({
                target: '[data-tour="production-facilities"]',
                content:
                    'Building facilities requires construction services, which you buy on the market. ' +
                    'If the price is too high, check the market for cheaper alternatives or build ' +
                    'when prices are lower.',
                title: '\uD83D\uDD27 Construction Services',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 10: Navigate to Storage
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
            // Step 0: Storage intro
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

            // Step 1: Inventory
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

            // Step 2: Capacity
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

            // Step 3: Storage value
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

            // Step 4: Navigate to Market
            steps.push({
                target: 'body',
                content: 'Now let\u2019s see the Market, where you can buy inputs and sell your finished goods.',
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
            // Step 0: Market intro
            steps.push({
                target: '[data-tour="market-overview"]',
                content:
                    'The Market is the heart of the planet\u2019s economy. Here you buy production inputs ' +
                    'and sell your finished goods. Prices are determined by supply and demand \u2014 ' +
                    'just like a real economy!',
                title: '\uD83C\uDFEA Market Overview',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 1: Resource level tabs
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

            // Step 2: Market columns
            steps.push({
                target: '[data-tour="market-overview"]',
                content:
                    'Each resource row shows key data: clearing price (the current market price), ' +
                    'total supply, total demand, production, and consumption. Click column headers to sort.',
                title: '\uD83D\uDCCA Market Data',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 3: Expand a resource
            steps.push({
                target: '[data-tour="market-accordion"]',
                content:
                    'Click any resource row to expand it. This reveals the buy and sell sections ' +
                    'where you can configure your trading strategy for that resource.',
                title: '\uD83D\uDD0D Expand a Resource',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 4: Buy section (described via accordion target)
            steps.push({
                target: '[data-tour="market-accordion"]',
                content:
                    'The Buy section lets you place bids to purchase resources. ' +
                    'Set a price and quantity, or enable the automation toggle to let the AI manage buying. ' +
                    'Auto-buy keeps your input buffers filled automatically.',
                title: '\uD83D\uDED2 Buy & Auto-Buy',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 5: Sell section (described via accordion target)
            steps.push({
                target: '[data-tour="market-accordion"]',
                content:
                    'The Sell section lets you place offers to sell your products. ' +
                    'Set your asking price, or enable auto-sell to let the AI manage pricing. ' +
                    'Configure volume and pricing strategies with the built-in presets.',
                title: '\uD83D\uDCE4 Sell & Auto-Sell',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 6: Price chart (described via accordion target)
            steps.push({
                target: '[data-tour="market-accordion"]',
                content:
                    'Every resource has a price history chart showing average, min, and max prices over time. ' +
                    'Use this to spot trends and time your trades. The red line is estimated production cost.',
                title: '\uD83D\uDCC8 Price History',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 7: Forex / Currency
            steps.push({
                target: '[data-tour="market-tabs"]',
                content:
                    'The "Currency" tab shows foreign exchange markets. ' +
                    'These let you trade between planetary currencies \u2014 essential for interplanetary commerce. ' +
                    'As you expand to other planets, you will need their local currency to trade there.',
                title: '\uD83D\uDCB1 Currency Markets',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 8: Relevant resources toggle
            steps.push({
                target: '[data-tour="market-relevant-toggle"]',
                content:
                    'This toggle filters the market to show only resources you can actually trade ' +
                    '\u2014 those you produce, consume, or have storage for. Turn it off to see everything.',
                title: '\uD83D\uDD0D Relevant Resources',
                placement: 'bottom',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 9: Pending actions
            steps.push({
                target: '[data-tour="market-overview"]',
                content:
                    'Like everything else, market orders are processed on the next simulation tick. ' +
                    'You will see pending overlays while waiting for your orders to fill.',
                title: '\u23F3 Pending Orders',
                placement: 'top',
                skipBeacon: true,
                zIndex: 10000,
            });

            // Step 10: Navigate to Ships
            steps.push({
                target: 'body',
                content: 'Finally, let\u2019s look at Ships \u2014 your gateway to interplanetary trade and expansion!',
                title: '\u27A1\uFE0F Next: Ships',
                placement: 'center',
                hideOverlay: false,
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }

        case 'ships': {
            // Step 0: Ships intro
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

            // Step 1: Shipyards
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

            // Step 2: My Ships
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

            // Step 3: Marketplace
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

            // Step 4: Transport contracts
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

            // Step 5: Multi-planet expansion
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

            // Step 6: Gameplay loop summary
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

            // Step 7: Congratulations!
            steps.push({
                target: 'body',
                content:
                    '\uD83C\uDF89 Congratulations! You have completed the guided tour. ' +
                    'You now understand the core mechanics of PolyEconGame. ' +
                    'Explore each section in detail, experiment with strategies, ' +
                    'and build your interplanetary economic empire. Good luck, CEO!',
                title: '\u2705 Tour Complete',
                placement: 'center',
                skipBeacon: true,
                zIndex: 10000,
                data: { navStep: true },
            });
            break;
        }
    }

    return steps;
}

export type { PageRoute };
