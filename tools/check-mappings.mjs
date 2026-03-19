import { readFileSync } from 'fs';

const src = readFileSync('src/lib/mapResource.ts', 'utf8');
const json = src.match(/const mappings = (\{[\s\S]+?\n\};)/)?.[1].replace(/;$/, '');
const mappings = eval('(' + json + ')');

const facilityNames = Object.values(mappings.facilities);
const productNames = Object.values(mappings.products);

const allFacilities = ['Coal Mine','Oil Well','Natural Gas Well','Logging Camp','Stone Quarry','Bauxite Mine','Copper Mine','Rare Earth Mine','Sand Mine','Limestone Quarry','Clay Mine','Iron Smelter','Phosphate Mine','Potash Mine','Aluminum Smelter','Copper Smelter','Oil Refinery','Sawmill','Cement Plant','Concrete Plant','Brick Factory','Glass Factory','Fertilizer Plant','Pesticide Plant','Pharmaceutical Plant','Food Processing Plant','Beverage Plant','Paper Mill','Cotton Farm','Textile Mill','Clothing Factory','Furniture Factory','Electronics Component Factory','Consumer Electronics Factory','Machinery Factory','Vehicle Factory','Agricultural Facility','Water Extraction Facility','Iron Extraction Facility','Coal Power Plant'];
const allProducts = ['Iron Ore','Water','Agricultural Product','Coal','Crude Oil','Natural Gas','Logs','Stone','Bauxite','Copper Ore','Rare Earth Ore','Sand','Limestone','Clay','Steel','Aluminum','Copper','Plastic','Chemical','Gasoline','Diesel','Jet Fuel','Lubricant','Asphalt','Lumber','Cement','Concrete','Brick','Glass','Phosphate Rock','Potash','Fertilizer','Pesticide','Pharmaceutical','Processed Food','Beverage','Paper','Cotton','Fabric','Clothing','Furniture','Electronic Component','Consumer Electronics','Machinery','Vehicle','Coal Deposit','Oil Reservoir','Natural Gas Field','Forest','Stone Quarry','Bauxite Deposit','Copper Deposit','Rare Earth Deposit','Sand Deposit','Limestone Deposit','Clay Deposit','Iron Ore Deposit','Arable Land','Water Source','Phosphate Rock Deposit','Potash Deposit'];

console.log('Missing facilities:', allFacilities.filter(n => !facilityNames.includes(n)));
console.log('Missing products:', allProducts.filter(n => !productNames.includes(n)));
console.log('Duplicate products:', productNames.filter((n, i) => productNames.indexOf(n) !== i));
