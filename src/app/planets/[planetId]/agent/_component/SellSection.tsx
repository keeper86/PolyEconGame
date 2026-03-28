import React from 'react';
import { Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FOOD_PRICE_FLOOR } from '@/simulation/constants';
import { formatNumbers } from '@/lib/utils';
import type { SellSectionProps } from './marketTypes';
import { productionPerTick, sellFulfillmentClass, priceArrow } from './marketHelpers';

export default function SellSection({
    resourceName,
    offer,
    local,
    assets,
    overviewRow,
    onLocalChange,
    saving,
}: SellSectionProps): React.ReactElement {
    const inventoryQty = assets.storageFacility.currentInStorage[resourceName]?.quantity ?? 0;
    const producedPerTick = productionPerTick(assets.productionFacilities, resourceName);

    const isFacilityOutput = producedPerTick > 0;

    // Effective quantities derived from retainment / storage-target settings
    const effectiveSellQty =
        offer?.offerRetainment !== undefined ? Math.max(0, inventoryQty - offer.offerRetainment) : undefined;

    // Retainment presets for sell: 0 = sell all, or N ticks of production
    const retainmentPresets =
        isFacilityOutput && producedPerTick > 0
            ? ([
                  { label: '0', qty: 0 },
                  { label: '5 ticks', qty: Math.ceil(producedPerTick * 5) },
                  { label: '10 ticks', qty: Math.ceil(producedPerTick * 10) },
              ] as const)
            : inventoryQty > 0
              ? ([{ label: '0', qty: 0 }] as const)
              : null;

    // Sell section is only active when there's something to sell
    const canSell =
        inventoryQty > 0 || isFacilityOutput || offer?.offerPrice !== undefined || offer?.offerRetainment !== undefined;

    return (
        <div className={`space-y-3 ${!canSell ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className='flex items-center justify-between'>
                <span className='text-xs font-semibold flex items-center gap-1.5'>
                    <Tag className='h-3.5 w-3.5 text-muted-foreground' /> Sell
                    {!canSell && (
                        <span className='text-[10px] font-normal text-muted-foreground'>— nothing to sell</span>
                    )}
                </span>
                <div className='flex items-center gap-2'>
                    <Label
                        htmlFor={`offer-auto-${resourceName}`}
                        className='text-[11px] text-muted-foreground cursor-pointer'
                    >
                        Auto-manage
                    </Label>
                    <Switch
                        id={`offer-auto-${resourceName}`}
                        checked={local.offerAutomated}
                        disabled={saving || !canSell}
                        onCheckedChange={(v) => onLocalChange(resourceName, { offerAutomated: v })}
                    />
                </div>
            </div>

            {isFacilityOutput && (
                <div className='flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] tabular-nums text-muted-foreground'>
                    <span>
                        Max capacity production{' '}
                        <span className='font-semibold text-foreground'>{formatNumbers(producedPerTick)}/tick</span>
                    </span>
                </div>
            )}

            <div className='grid grid-cols-2 gap-3'>
                {/* Price / unit box */}
                <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                    <Label htmlFor={`offer-price-${resourceName}`} className='text-[11px] text-muted-foreground'>
                        Price / unit
                    </Label>
                    <Input
                        id={`offer-price-${resourceName}`}
                        type='number'
                        min={FOOD_PRICE_FLOOR}
                        step='any'
                        placeholder={offer?.offerPrice !== undefined ? offer.offerPrice.toFixed(2) : 'e.g. 1.50'}
                        value={local.offerPrice}
                        disabled={local.offerAutomated || saving}
                        onChange={(e) => onLocalChange(resourceName, { offerPrice: e.target.value })}
                        className='h-8 text-sm tabular-nums'
                    />
                    {overviewRow && !local.offerAutomated && (
                        <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                            <span>Clearing: {overviewRow.clearingPrice.toFixed(2)}</span>
                            <Button
                                variant='outline'
                                size='sm'
                                className='h-5 text-[10px] px-1.5 py-0'
                                disabled={saving}
                                onClick={() =>
                                    onLocalChange(resourceName, {
                                        offerPrice: overviewRow.clearingPrice.toFixed(2),
                                    })
                                }
                            >
                                Use
                            </Button>
                        </div>
                    )}
                </div>

                {/* Retainment box + presets */}
                <div className='rounded-md border bg-muted/30 p-2.5 space-y-1.5'>
                    <Label htmlFor={`offer-retainment-${resourceName}`} className='text-[11px] text-muted-foreground'>
                        Retainment (keep ≥)
                    </Label>
                    <Input
                        id={`offer-retainment-${resourceName}`}
                        type='number'
                        min={0}
                        step={1}
                        placeholder={
                            offer?.offerRetainment !== undefined ? String(Math.round(offer.offerRetainment)) : 'e.g. 0'
                        }
                        value={local.offerRetainment}
                        disabled={local.offerAutomated || saving}
                        onChange={(e) => onLocalChange(resourceName, { offerRetainment: e.target.value })}
                        className='h-8 text-sm tabular-nums'
                    />
                    {/* Effective sell qty with fulfillment colour */}
                    {offer?.offerRetainment !== undefined && effectiveSellQty !== undefined && (
                        <div
                            className={`text-[11px] tabular-nums font-medium ${sellFulfillmentClass(inventoryQty, offer.offerRetainment)}`}
                        >
                            {effectiveSellQty === 0
                                ? 'Nothing to sell — order inactive'
                                : `Sell ${formatNumbers(effectiveSellQty)} / tick`}
                        </div>
                    )}
                    {retainmentPresets && !local.offerAutomated && (
                        <div className='flex items-center gap-1 text-[11px] text-muted-foreground'>
                            <span className='shrink-0'>Keep:</span>
                            <div className='flex gap-1 ml-auto'>
                                {retainmentPresets.map(({ label, qty }) => (
                                    <Button
                                        key={label}
                                        variant='outline'
                                        size='sm'
                                        className='h-5 text-[10px] px-1.5 py-0'
                                        disabled={saving}
                                        onClick={() =>
                                            onLocalChange(resourceName, {
                                                offerRetainment: String(qty),
                                            })
                                        }
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {(offer?.lastSold !== undefined || offer?.lastRevenue !== undefined) && (
                <div className='text-[11px] text-muted-foreground tabular-nums flex gap-3'>
                    {offer.lastSold !== undefined && <span>Last sold: {formatNumbers(offer.lastSold)}</span>}
                    {offer.lastRevenue !== undefined && <span>Revenue: {formatNumbers(offer.lastRevenue)}</span>}
                    {offer.priceDirection !== undefined &&
                        (() => {
                            const a = priceArrow(offer.priceDirection);
                            return a.label ? <span className={a.className}>{a.label}</span> : null;
                        })()}
                </div>
            )}
        </div>
    );
}
