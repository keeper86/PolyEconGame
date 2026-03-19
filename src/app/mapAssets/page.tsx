'use client';

import { Page } from '@/components/client/Page';
import { useState } from 'react';

const FACILITIES = [
    'Coal Mine',
    'Oil Well',
    'Natural Gas Well',
    'Logging Camp',
    'Stone Quarry',
    'Bauxite Mine',
    'Copper Mine',
    'Rare Earth Mine',
    'Sand Mine',
    'Limestone Quarry',
    'Clay Mine',
    'Iron Smelter',
    'Phosphate Mine',
    'Potash Mine',
    'Aluminum Smelter',
    'Copper Smelter',
    'Oil Refinery',
    'Sawmill',
    'Cement Plant',
    'Concrete Plant',
    'Brick Factory',
    'Glass Factory',
    'Fertilizer Plant',
    'Pesticide Plant',
    'Pharmaceutical Plant',
    'Food Processing Plant',
    'Beverage Plant',
    'Paper Mill',
    'Cotton Farm',
    'Textile Mill',
    'Clothing Factory',
    'Furniture Factory',
    'Electronics Component Factory',
    'Consumer Electronics Factory',
    'Machinery Factory',
    'Vehicle Factory',
    'Agricultural Facility',
    'Water Extraction Facility',
    'Iron Extraction Facility',
    'Coal Power Plant',
];

const PRODUCTS = [
    'Iron Ore',
    'Water',
    'Agricultural Product',
    'Coal',
    'Crude Oil',
    'Natural Gas',
    'Logs',
    'Stone',
    'Bauxite',
    'Copper Ore',
    'Rare Earth Ore',
    'Sand',
    'Limestone',
    'Clay',
    'Steel',
    'Aluminum',
    'Copper',
    'Plastic',
    'Chemical',
    'Gasoline',
    'Diesel',
    'Jet Fuel',
    'Lubricant',
    'Asphalt',
    'Lumber',
    'Cement',
    'Concrete',
    'Brick',
    'Glass',
    'Phosphate Rock',
    'Potash',
    'Fertilizer',
    'Pesticide',
    'Pharmaceutical',
    'Processed Food',
    'Beverage',
    'Paper',
    'Cotton',
    'Fabric',
    'Clothing',
    'Furniture',
    'Electronic Component',
    'Consumer Electronics',
    'Machinery',
    'Vehicle',
    'Coal Deposit',
    'Oil Reservoir',
    'Natural Gas Field',
    'Forest',
    'Stone Quarry',
    'Bauxite Deposit',
    'Copper Deposit',
    'Rare Earth Deposit',
    'Sand Deposit',
    'Limestone Deposit',
    'Clay Deposit',
    'Iron Ore Deposit',
    'Arable Land',
    'Water Source',
    'Phosphate Rock Deposit',
    'Potash Deposit',
];

const FACILITY_IMAGES = [
    'Gemini_Generated_Image_3ig36z3ig36z3ig3_00.png',
    'Gemini_Generated_Image_3ig36z3ig36z3ig3_01.png',
    'Gemini_Generated_Image_3ig36z3ig36z3ig3_02.png',
    'Gemini_Generated_Image_3ig36z3ig36z3ig3_03.png',
    'Gemini_Generated_Image_3vrvyo3vrvyo3vrv_00.png',
    'Gemini_Generated_Image_3vrvyo3vrvyo3vrv_01.png',
    'Gemini_Generated_Image_3vrvyo3vrvyo3vrv_02.png',
    'Gemini_Generated_Image_3vrvyo3vrvyo3vrv_03.png',
    'Gemini_Generated_Image_88f6oo88f6oo88f6_00.png',
    'Gemini_Generated_Image_88f6oo88f6oo88f6_01.png',
    'Gemini_Generated_Image_88f6oo88f6oo88f6_02.png',
    'Gemini_Generated_Image_88f6oo88f6oo88f6_03.png',
    'Gemini_Generated_Image_8z3dbn8z3dbn8z3d_00.png',
    'Gemini_Generated_Image_8z3dbn8z3dbn8z3d_01.png',
    'Gemini_Generated_Image_8z3dbn8z3dbn8z3d_02.png',
    'Gemini_Generated_Image_8z3dbn8z3dbn8z3d_03.png',
    'Gemini_Generated_Image_d07c51d07c51d07c_00.png',
    'Gemini_Generated_Image_d07c51d07c51d07c_01.png',
    'Gemini_Generated_Image_d07c51d07c51d07c_02.png',
    'Gemini_Generated_Image_d07c51d07c51d07c_03.png',
    'Gemini_Generated_Image_ngmq17ngmq17ngmq_00.png',
    'Gemini_Generated_Image_ngmq17ngmq17ngmq_01.png',
    'Gemini_Generated_Image_ngmq17ngmq17ngmq_02.png',
    'Gemini_Generated_Image_ngmq17ngmq17ngmq_03.png',
    'Gemini_Generated_Image_pn6hqxpn6hqxpn6h_00.png',
    'Gemini_Generated_Image_pn6hqxpn6hqxpn6h_01.png',
    'Gemini_Generated_Image_pn6hqxpn6hqxpn6h_02.png',
    'Gemini_Generated_Image_pn6hqxpn6hqxpn6h_03.png',
    'Gemini_Generated_Image_tci80itci80itci8_00.png',
    'Gemini_Generated_Image_tci80itci80itci8_01.png',
    'Gemini_Generated_Image_tci80itci80itci8_02.png',
    'Gemini_Generated_Image_tci80itci80itci8_03.png',
    'Gemini_Generated_Image_uem5x1uem5x1uem5_00.png',
    'Gemini_Generated_Image_uem5x1uem5x1uem5_01.png',
    'Gemini_Generated_Image_uem5x1uem5x1uem5_02.png',
    'Gemini_Generated_Image_uem5x1uem5x1uem5_03.png',
    'Gemini_Generated_Image_xwd0ynxwd0ynxwd0_00.png',
    'Gemini_Generated_Image_xwd0ynxwd0ynxwd0_01.png',
    'Gemini_Generated_Image_xwd0ynxwd0ynxwd0_02.png',
    'Gemini_Generated_Image_xwd0ynxwd0ynxwd0_03.png',
];

const PRODUCT_IMAGES = [
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_00.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_01.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_02.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_03.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_04.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_05.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_06.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_07.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_08.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_09.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_10.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_11.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_12.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_13.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_14.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_15.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_16.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_17.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_18.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_19.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_20.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_21.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_22.png',
    'Gemini_Generated_Image_4gdzxl4gdzxl4gdz_23.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_00.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_01.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_02.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_03.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_04.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_05.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_06.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_07.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_08.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_09.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_10.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_11.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_12.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_13.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_14.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_15.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_16.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_17.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_18.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_19.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_20.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_21.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_22.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_23.png',
    'Gemini_Generated_Image_eldnqneldnqneldn_24.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_00.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_01.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_02.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_03.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_04.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_05.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_06.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_07.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_08.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_09.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_10.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_11.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_12.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_13.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_14.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_15.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_16.png',
    'Gemini_Generated_Image_g4tqvng4tqvng4tq_17.png',
];

type Section = 'facilities' | 'products';

const SECTIONS = {
    facilities: { names: FACILITIES, images: FACILITY_IMAGES, dir: '/images/facilities' },
    products: { names: PRODUCTS, images: PRODUCT_IMAGES, dir: '/images/products' },
} as const;

export default function MapAssetsPage() {
    const [section, setSection] = useState<Section>('facilities');
    const [mappings, setMappings] = useState<Record<Section, Record<string, string>>>({
        facilities: {},
        products: {},
    });
    const [draggedName, setDraggedName] = useState<string | null>(null);

    const { names, images, dir } = SECTIONS[section];
    const assigned = Object.values(mappings[section]);

    function assign(image: string, name: string) {
        setMappings((prev) => {
            const next = { ...prev[section] };
            for (const k of Object.keys(next)) {
                if (next[k] === name) {
                    delete next[k];
                }
            }
            next[image] = name;
            return { ...prev, [section]: next };
        });
    }

    function unassign(image: string) {
        setMappings((prev) => {
            const next = { ...prev[section] };
            delete next[image];
            return { ...prev, [section]: next };
        });
    }

    const json = JSON.stringify(mappings, null, 2);

    const mapped = Object.keys(mappings[section]).length;

    return (
        <Page title='Map Assets'>
            <div className='flex h-[calc(100vh-120px)] gap-4 p-4'>
                {/* Sidebar */}
                <div className='flex w-56 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg bg-muted p-3'>
                    <div className='flex gap-2'>
                        {(['facilities', 'products'] as Section[]).map((s) => (
                            <button
                                key={s}
                                onClick={() => setSection(s)}
                                className={`flex-1 rounded px-2 py-1 text-xs font-bold capitalize ${section === s ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                        {mapped} / {images.length} mapped
                    </div>
                    {names.map((name) => (
                        <div
                            key={name}
                            draggable
                            onDragStart={() => setDraggedName(name)}
                            onDragEnd={() => setDraggedName(null)}
                            className={`cursor-grab rounded px-2 py-1.5 text-xs select-none ${
                                assigned.includes(name)
                                    ? 'bg-green-900/40 text-muted-foreground line-through'
                                    : 'bg-accent hover:bg-accent/80'
                            }`}
                        >
                            {name}
                        </div>
                    ))}
                </div>

                {/* Grid */}
                <div className='flex flex-1 flex-col gap-4 overflow-hidden'>
                    <div className='flex-1 overflow-y-auto'>
                        <div className='grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3'>
                            {images.map((img) => {
                                const name = mappings[section][img];
                                return (
                                    <div
                                        key={img}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => draggedName && assign(img, draggedName)}
                                        className={`flex flex-col overflow-hidden rounded-lg border-2 transition-colors ${
                                            name ? 'border-green-500' : 'border-border hover:border-primary'
                                        }`}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`${dir}/${img}`} alt={img} className='w-full object-contain' />
                                        <div className='flex items-center justify-between bg-muted px-2 py-1'>
                                            <span
                                                className={`text-xs font-semibold ${name ? 'text-green-400' : 'text-muted-foreground'}`}
                                            >
                                                {name ?? 'drop name here'}
                                            </span>
                                            {name && (
                                                <button
                                                    onClick={() => unassign(img)}
                                                    className='text-xs text-destructive hover:text-destructive/80'
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* JSON output */}
                    <pre className='max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs text-green-400'>{json}</pre>
                </div>
            </div>
        </Page>
    );
}
