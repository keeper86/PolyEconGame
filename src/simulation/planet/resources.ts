import type { Resource } from './claims';

export const ironOreResourceType: Resource = {
    name: 'Iron Ore',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.3, // 1 ton of iron takes up 0.3 cubic meters
    massPerQuantity: 1, // 1 ton of iron has a mass of 1 ton
};

export const waterResourceType: Resource = {
    name: 'Water',
    form: 'liquid',
    level: 'raw',
    volumePerQuantity: 1, // 1 ton of water takes up 1 cubic meters
    massPerQuantity: 1, // 1 ton of water takes up 1 cubic meters
};

export const agriculturalProductResourceType: Resource = {
    name: 'Agricultural Product',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.5, // 1 ton of agricultural product takes up 0.5 cubic meters
    massPerQuantity: 1, // 1 ton of agricultural product has a mass of 1 ton
};

export const coalResourceType: Resource = {
    name: 'Coal',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.7, // m³ per ton (approx)
    massPerQuantity: 1,
};

export const crudeOilResourceType: Resource = {
    name: 'Crude Oil',
    form: 'liquid',
    level: 'raw',
    volumePerQuantity: 1.2, // m³ per ton (approx)
    massPerQuantity: 1,
};

export const naturalGasResourceType: Resource = {
    name: 'Natural Gas',
    form: 'gas',
    level: 'raw',
    volumePerQuantity: 1.5, // m³ per ton at STP (very rough)
    massPerQuantity: 1,
};

export const logsResourceType: Resource = {
    name: 'Logs',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 2.0, // m³ per ton (wood)
    massPerQuantity: 1,
};

export const stoneResourceType: Resource = {
    name: 'Stone',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.4, // m³ per ton
    massPerQuantity: 1,
};

export const copperOreResourceType: Resource = {
    name: 'Copper Ore',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.3,
    massPerQuantity: 1,
};

export const sandResourceType: Resource = {
    name: 'Sand',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.6,
    massPerQuantity: 1,
};

export const limestoneResourceType: Resource = {
    name: 'Limestone',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.4,
    massPerQuantity: 1,
};

export const clayResourceType: Resource = {
    name: 'Clay',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 0.5,
    massPerQuantity: 1,
};

export const steelResourceType: Resource = {
    name: 'Steel',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 0.3,
    massPerQuantity: 1,
};

export const copperResourceType: Resource = {
    name: 'Copper',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 0.3,
    massPerQuantity: 1,
};

export const plasticResourceType: Resource = {
    name: 'Plastic',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 1.0,
    massPerQuantity: 1,
};

export const chemicalResourceType: Resource = {
    name: 'Chemical',
    form: 'liquid',
    level: 'refined',
    volumePerQuantity: 1.0,
    massPerQuantity: 1,
};

export const fuelResourceType: Resource = {
    name: 'Fuel',
    form: 'liquid',
    level: 'refined',
    volumePerQuantity: 1.3,
    massPerQuantity: 1,
};

export const lumberResourceType: Resource = {
    name: 'Lumber',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 1.5,
    massPerQuantity: 1,
};

export const cementResourceType: Resource = {
    name: 'Cement',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 0.6,
    massPerQuantity: 1,
};

export const concreteResourceType: Resource = {
    name: 'Concrete',
    form: 'solid',
    level: 'manufactured',
    volumePerQuantity: 0.5,
    massPerQuantity: 1,
};

export const glassResourceType: Resource = {
    name: 'Glass',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 0.4,
    massPerQuantity: 1,
};

export const pesticideResourceType: Resource = {
    name: 'Pesticide',
    form: 'liquid',
    level: 'refined',
    volumePerQuantity: 1.0,
    massPerQuantity: 1,
};

export const pharmaceuticalResourceType: Resource = {
    name: 'Pharmaceutical',
    form: 'pieces',
    level: 'manufactured',
    volumePerQuantity: 10.0,
    massPerQuantity: 1,
};

export const processedFoodResourceType: Resource = {
    name: 'Processed Food',
    form: 'frozenGoods',
    level: 'manufactured',
    volumePerQuantity: 0.6,
    massPerQuantity: 1,
};

export const beverageResourceType: Resource = {
    name: 'Beverage',
    form: 'liquid',
    level: 'manufactured',
    volumePerQuantity: 1.0,
    massPerQuantity: 1,
};

export const paperResourceType: Resource = {
    name: 'Paper',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 1.2,
    massPerQuantity: 1,
};

export const cottonResourceType: Resource = {
    name: 'Cotton',
    form: 'solid',
    level: 'raw',
    volumePerQuantity: 2.5,
    massPerQuantity: 1,
};

export const fabricResourceType: Resource = {
    name: 'Fabric',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 1.8,
    massPerQuantity: 1,
};

export const clothingResourceType: Resource = {
    name: 'Clothing',
    form: 'pieces',
    level: 'manufactured',
    volumePerQuantity: 50.0,
    massPerQuantity: 1,
};

export const furnitureResourceType: Resource = {
    name: 'Furniture',
    form: 'pieces',
    level: 'manufactured',
    volumePerQuantity: 20.0,
    massPerQuantity: 1,
};

export const siliconWaferResourceType: Resource = {
    name: 'Silicon Wafer',
    form: 'pieces',
    level: 'refined',
    volumePerQuantity: 0.5,
    massPerQuantity: 1,
};

export const electronicComponentResourceType: Resource = {
    name: 'Electronic Component',
    form: 'pieces',
    level: 'refined',
    volumePerQuantity: 5.0,
    massPerQuantity: 1,
};

export const consumerElectronicsResourceType: Resource = {
    name: 'Consumer Electronics',
    form: 'pieces',
    level: 'manufactured',
    volumePerQuantity: 5.0,
    massPerQuantity: 1,
};

export const machineryResourceType: Resource = {
    name: 'Machinery',
    form: 'pieces',
    level: 'manufactured',
    volumePerQuantity: 5.0,
    massPerQuantity: 1.0,
};

export const vehicleResourceType: Resource = {
    name: 'Vehicle',
    form: 'pieces',
    level: 'manufactured',
    volumePerQuantity: 6.67,
    massPerQuantity: 1,
};

export const packagingResourceType: Resource = {
    name: 'Packaging Material',
    form: 'solid',
    level: 'manufactured',
    volumePerQuantity: 1,
    massPerQuantity: 1,
};
