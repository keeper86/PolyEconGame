let storageSpaceClampEnabled = true;
let pidOutMaxDown: number | null = null;
let pidOutMaxUp: number | null = null;
let pidKp: number | null = null;
let pidKi: number | null = null;
let pidKd: number | null = null;
let expansionIntegralThreshold: number | null = null;
let contractionIntegralThreshold: number | null = null;
let storageTargetMonths: number | null = null;
let storageCapacityMonths: number | null = null;
let minScaleFraction: number | null = null;
let expansionAtCapacityFraction: number | null = null;
let serviceSellThroughTarget: number | null = null;
let serviceFillRateTarget: number | null = null;
let serviceFlowDecayTarget: number | null = null;
let productionSignalEmaAlpha: number | null = null;
let storageErrorZoomMonths: number | null = null;
let storageTrendHorizonMonths: number | null = null;

export const setStorageSpaceClampEnabled = (enabled: boolean): void => {
    storageSpaceClampEnabled = enabled;
};

export const setPidOutMaxDown = (value: number | null): void => {
    pidOutMaxDown = value;
};

export const setPidOutMaxUp = (value: number | null): void => {
    pidOutMaxUp = value;
};

export const setPidKp = (value: number | null): void => {
    pidKp = value;
};

export const setPidKi = (value: number | null): void => {
    pidKi = value;
};

export const setPidKd = (value: number | null): void => {
    pidKd = value;
};

export const setExpansionIntegralThreshold = (value: number | null): void => {
    expansionIntegralThreshold = value;
};

export const setContractionIntegralThreshold = (value: number | null): void => {
    contractionIntegralThreshold = value;
};

export const setStorageTargetMonths = (value: number | null): void => {
    storageTargetMonths = value;
};

export const setStorageCapacityMonths = (value: number | null): void => {
    storageCapacityMonths = value;
};

export const setMinScaleFraction = (value: number | null): void => {
    minScaleFraction = value;
};

export const setExpansionAtCapacityFraction = (value: number | null): void => {
    expansionAtCapacityFraction = value;
};

export const setServiceSellThroughTarget = (value: number | null): void => {
    serviceSellThroughTarget = value;
};

export const setServiceFillRateTarget = (value: number | null): void => {
    serviceFillRateTarget = value;
};

export const setServiceFlowDecayTarget = (value: number | null): void => {
    serviceFlowDecayTarget = value;
};

export const setProductionSignalEmaAlpha = (value: number | null): void => {
    productionSignalEmaAlpha = value;
};

export const setStorageErrorZoomMonths = (value: number | null): void => {
    storageErrorZoomMonths = value;
};

export const setStorageTrendHorizonMonths = (value: number | null): void => {
    storageTrendHorizonMonths = value;
};

export const isStorageSpaceClampEnabled = (): boolean => storageSpaceClampEnabled;
export const getPidOutMaxDown = (): number | null => pidOutMaxDown;
export const getPidOutMaxUp = (): number | null => pidOutMaxUp;
export const getPidKp = (): number | null => pidKp;
export const getPidKi = (): number | null => pidKi;
export const getPidKd = (): number | null => pidKd;
export const getExpansionIntegralThreshold = (): number | null => expansionIntegralThreshold;
export const getContractionIntegralThreshold = (): number | null => contractionIntegralThreshold;
export const getStorageTargetMonths = (): number | null => storageTargetMonths;
export const getStorageCapacityMonths = (): number | null => storageCapacityMonths;
export const getMinScaleFraction = (): number | null => minScaleFraction;
export const getExpansionAtCapacityFraction = (): number | null => expansionAtCapacityFraction;
export const getServiceSellThroughTarget = (): number | null => serviceSellThroughTarget;
export const getServiceFillRateTarget = (): number | null => serviceFillRateTarget;
export const getServiceFlowDecayTarget = (): number | null => serviceFlowDecayTarget;
export const getProductionSignalEmaAlpha = (): number | null => productionSignalEmaAlpha;
export const getStorageErrorZoomMonths = (): number | null => storageErrorZoomMonths;
export const getStorageTrendHorizonMonths = (): number | null => storageTrendHorizonMonths;
