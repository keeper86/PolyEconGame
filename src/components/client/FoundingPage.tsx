'use client';

import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, useCarousel, type CarouselApi } from '@/components/ui/carousel';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useSimulationTick } from '@/hooks/useSimulationQuery';
import { PLANET_LARGE_IMAGES } from '@/lib/planetAssets';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit } from '@/lib/utils';
import { getLandboundRessourceByName } from '@/simulation/planet/landBoundResources';
import { bankEquity } from '@/simulation/planet/planet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTour } from '../tour/TourContext';
import { InteractivePaperworkProcess } from './FakePaperWorkProcess';
import { Page } from './Page';
import { ProductQuantity } from './ProductQuantity';
import { CompanyLogoChooser } from './CompanyLogoChooser';
import { useErrorMessage } from '@/i18n/errors';

function CarouselNav() {
    const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();
    const t = useTranslations('Planets');

    return (
        <div className='absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between p-3 sm:p-5 pointer-events-none rounded-b-xl'>
            <button
                type='button'
                onClick={scrollPrev}
                disabled={!canScrollPrev}
                className='pointer-events-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 w-8 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer'
            >
                <ChevronLeft className='h-4 w-4' />
                <span className='sr-only'>{t('previous')}</span>
            </button>

            <button
                type='button'
                onClick={scrollNext}
                disabled={!canScrollNext}
                className='pointer-events-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 w-8 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer'
            >
                <ChevronRight className='h-4 w-4' />
                <span className='sr-only'>{t('next')}</span>
            </button>
        </div>
    );
}

export function FoundingPage() {
    const locale = useLocale();
    const t = useTranslations('Toasts');
    const tf = useTranslations('Founding');
    const tp = useTranslations('Planets');
    const showError = useErrorMessage();
    const trpc = useTRPC();
    const router = useRouter();
    const { setTourActive } = useTour();
    const { update: updateSession } = useSession();
    const queryClient = useQueryClient();
    const [agentName, setAgentName] = useState('');
    const [planetId, setPlanetId] = useState('');
    const [logo, setLogo] = useState('unknown');
    const [foundedAtTick, setFoundedAtTick] = useState<number | null>(null);
    const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
    const [enableTour, setEnableTour] = useState(true);
    const [agentNameError, setAgentNameError] = useState<string | null>(null);
    const [showLogoPrompt, setShowLogoPrompt] = useState(false);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);

    const planetsQuery = useQuery(trpc.simulation.getLatestPlanetSummaries.queryOptions());
    const usedLogosQuery = useQuery(trpc.simulation.getUsedLogos.queryOptions());
    const usedLogos = usedLogosQuery.data?.usedLogos ?? [];
    const { data: agentDetail } = useQuery(
        trpc.simulation.getAgentDetail.queryOptions({ agentId: createdAgentId ?? '' }, { enabled: !!createdAgentId }),
    );

    const onCarouselSelect = useCallback(
        (api: CarouselApi) => {
            if (!api || !planetsQuery.data) {
                return;
            }
            const index = api.selectedScrollSnap();
            const planet = planetsQuery.data.planets[index];
            if (planet) {
                setPlanetId(planet.planetId);
            }
        },
        [planetsQuery.data],
    );

    useEffect(() => {
        if (!carouselApi || !planetsQuery.data) {
            return;
        }
        carouselApi.on('select', onCarouselSelect);
        return () => {
            carouselApi.off('select', onCarouselSelect);
        };
    }, [carouselApi, onCarouselSelect, planetsQuery.data]);

    useEffect(() => {
        if (!planetId && planetsQuery.data?.planets.length) {
            setPlanetId(planetsQuery.data.planets[0].planetId);
        }
    }, [planetId, planetsQuery.data]);

    const tick = useSimulationTick();

    const createAgentMutation = useMutation(
        trpc.createAgent.mutationOptions({
            onSuccess: async (data) => {
                await updateSession({ agentId: data.agentId, planetId: data.planetId });
                void queryClient.invalidateQueries(trpc.getUser.queryFilter());
                setFoundedAtTick(Math.max(tick, data.tick));
                setCreatedAgentId(data.agentId);
                toast.success(t('companyRegistered'));
            },
            onError: (err: unknown) => {
                const message = showError(err);
                setAgentNameError(message);
                toast.error(message);
            },
        }),
    );

    // Immediate redirect as soon as the agent details are successfully fetched from the server
    useEffect(() => {
        if (agentDetail?.agent) {
            router.push(
                `/planets/${encodeURIComponent(agentDetail.agent.associatedPlanetId)}/agent/${encodeURIComponent(agentDetail.agent.agentId)}/financial` as unknown as '/',
            );
        }
    }, [agentDetail, router]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setAgentNameError(null);
        if (!planetId) {
            return;
        }
        if (!logo || logo === 'unknown') {
            setShowLogoPrompt(true);
            toast.error(t('selectLogo'));
            return;
        }
        setTourActive(enableTour);
        createAgentMutation.mutate({ agentName: agentName.trim(), planetId, logo });
    };

    if (foundedAtTick !== null) {
        return (
            <Page title={tf('title')}>
                <InteractivePaperworkProcess />
            </Page>
        );
    }

    const planets = planetsQuery.data?.planets ?? [];

    return (
        <Page title={tf('title')}>
            <form onSubmit={handleSubmit} className='grid gap-6 max-w-lg'>
                <div className='flex flex-row gap-4'>
                    <Input
                        placeholder={tf('companyNamePlaceholder')}
                        value={agentName}
                        onChange={(e) => {
                            setAgentName(e.target.value);
                            if (agentNameError) {
                                setAgentNameError(null);
                            }
                        }}
                        maxLength={64}
                        required
                        disabled={createAgentMutation.isPending}
                        name='company-name'
                        autoComplete='organization'
                        aria-invalid={agentNameError ? 'true' : undefined}
                        className='flex-grow'
                    />
                    <CompanyLogoChooser
                        selectedLogo={logo}
                        onSelect={(key) => {
                            setLogo(key);
                            setShowLogoPrompt(false);
                        }}
                        showPrompt={showLogoPrompt}
                        usedLogos={usedLogos}
                    />
                </div>

                <div className='grid gap-2'>
                    {planetsQuery.isLoading ? (
                        <div className='flex items-center gap-2 text-muted-foreground'>
                            <Spinner className='h-4 w-4' />
                            <span className='text-sm'>{tf('loadingPlanets')}</span>
                        </div>
                    ) : (
                        <Carousel setApi={setCarouselApi}>
                            <CarouselContent>
                                {planets.map((p) => {
                                    const isSelected = p.planetId === planetId;
                                    const watermarkSrc = PLANET_LARGE_IMAGES[p.planetId];

                                    const minWage = Math.min(p.wageEdu0, p.wageEdu1, p.wageEdu2, p.wageEdu3);
                                    const maxWage = Math.max(p.wageEdu0, p.wageEdu1, p.wageEdu2, p.wageEdu3);

                                    return (
                                        <CarouselItem key={p.planetId} className='basis-full'>
                                            <button
                                                type='button'
                                                onClick={() => setPlanetId(p.planetId)}
                                                aria-label={tf('selectPlanet', { planetName: p.name })}
                                                className={`relative isolate overflow-hidden rounded-xl border text-left w-full transition-all ${
                                                    isSelected
                                                        ? 'ring-2 ring-primary border-primary shadow-lg'
                                                        : 'border-border hover:border-muted-foreground/50'
                                                }`}
                                            >
                                                {watermarkSrc && (
                                                    <Image
                                                        src={watermarkSrc}
                                                        alt=''
                                                        width={720}
                                                        height={720}
                                                        className='absolute -top-8 -right-8 -z-10 pointer-events-none select-none w-86 h-86 object-contain opacity-40'
                                                        priority
                                                        unoptimized
                                                        aria-hidden='true'
                                                    />
                                                )}

                                                <div className='p-3 sm:p-5 pb-16 space-y-3 min-h-[500px]'>
                                                    <h3 className='text-xl font-semibold'>{p.name}</h3>

                                                    <div className='grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-outline-strong'>
                                                        <span className='text-muted-foreground'>
                                                            {tp('population')}
                                                        </span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                p.populationTotal,
                                                                'persons',
                                                                undefined,
                                                                locale,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>{tp('gdp')}</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                p.gdp,
                                                                'currency',
                                                                p.planetId,
                                                                locale,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>
                                                            {tp('moneySupply')}
                                                        </span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                p.moneySupply,
                                                                'currency',
                                                                p.planetId,
                                                                locale,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>
                                                            {tp('bankEquity')}
                                                        </span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                bankEquity(p.bank),
                                                                'currency',
                                                                p.planetId,
                                                                locale,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>
                                                            {tp('interestRate')}
                                                        </span>
                                                        <span className='text-right font-medium tabular-nums'>
                                                            {(p.policyRate * 100).toFixed(2)} %
                                                        </span>

                                                        <span className='text-muted-foreground'>
                                                            {tp('costOfLiving')}
                                                        </span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                p.costOfLiving,
                                                                'currency',
                                                                p.planetId,
                                                                locale,
                                                            )}
                                                            {' – '}
                                                            {formatNumberWithUnit(
                                                                p.costOfLivingRich,
                                                                'currency',
                                                                p.planetId,
                                                                locale,
                                                            )}
                                                        </span>

                                                        <span className='text-muted-foreground'>{tp('wages')}</span>
                                                        <span className='text-right font-medium'>
                                                            {formatNumberWithUnit(
                                                                minWage,
                                                                'currency',
                                                                p.planetId,
                                                                locale,
                                                            )}
                                                            {' – '}
                                                            {formatNumberWithUnit(
                                                                maxWage,
                                                                'currency',
                                                                p.planetId,
                                                                locale,
                                                            )}
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <p className='text-xs text-muted-foreground mb-1.5'>
                                                            {tp('availableResources')}
                                                        </p>
                                                        {p.claims.length > 0 ? (
                                                            <div className='flex flex-wrap gap-1.5'>
                                                                {p.claims.map((claim) => {
                                                                    const resource = getLandboundRessourceByName(
                                                                        claim.name,
                                                                    );
                                                                    if (!resource) {
                                                                        console.warn(
                                                                            `Resource not found: ${claim.name}`,
                                                                        );
                                                                        return null;
                                                                    }
                                                                    return (
                                                                        <ProductQuantity
                                                                            key={claim.name}
                                                                            resource={resource}
                                                                            quantity={claim.freeCapacity}
                                                                            planetId={null}
                                                                            agentId={null}
                                                                            efficiency={1}
                                                                            isLimiting={false}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className='flex flex-wrap gap-1.5' aria-hidden='true'>
                                                                <span className='opacity-0 select-none pointer-events-none text-xs border border-transparent px-2 py-0.5 rounded-md'>
                                                                    &nbsp;
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        </CarouselItem>
                                    );
                                })}
                            </CarouselContent>
                            <CarouselNav />
                        </Carousel>
                    )}
                </div>

                <div className='flex items-center gap-2'>
                    <Checkbox
                        id='enable-tour'
                        checked={enableTour}
                        onCheckedChange={(checked) => setEnableTour(checked === true)}
                    />
                    <Label htmlFor='enable-tour' className='text-sm text-muted-foreground cursor-pointer'>
                        {tf('showGuidedTour')}
                    </Label>
                </div>

                <Button type='submit' disabled={createAgentMutation.isPending}>
                    {createAgentMutation.isPending ? (
                        <>
                            <Spinner className='mr-2 h-4 w-4' />
                            {tf('registering')}
                        </>
                    ) : (
                        tf('register')
                    )}
                </Button>
            </form>
        </Page>
    );
}
