let storageSpaceClampEnabled = true;
let pidOutMaxDown: number | null = null;
let pidOutMaxUp: number | null = null;
let expansionIntegralThreshold: number | null = null;
let contractionIntegralThreshold: number | null = null;
let storageTargetMonths: number | null = null;
let storageTargetScaleAnchored: boolean | null = null;
let minScaleFraction: number | null = null;
let softMinScaleRange: number | null = null;
let serviceSellThroughTarget: number | null = null;
let serviceFillRateTarget: number | null = null;
let serviceFlowDecayTarget: number | null = null;
let serviceGoodsSellThroughTarget: number | null = null;
let serviceGoodsFillRateTarget: number | null = null;

export const setStorageSpaceClampEnabled = (enabled: boolean): void => {
    storageSpaceClampEnabled = enabled;
};

export const setPidOutMaxDown = (value: number | null): void => {
    pidOutMaxDown = value;
};

export const setPidOutMaxUp = (value: number | null): void => {
    pidOutMaxUp = value;
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

export const setStorageTargetScaleAnchored = (value: boolean | null): void => {
    storageTargetScaleAnchored = value;
};

export const setMinScaleFraction = (value: number | null): void => {
    minScaleFraction = value;
};

export const setSoftMinScaleRange = (value: number | null): void => {
    softMinScaleRange = value;
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

export const setServiceGoodsSellThroughTarget = (value: number | null): void => {
    serviceGoodsSellThroughTarget = value;
};

export const setServiceGoodsFillRateTarget = (value: number | null): void => {
    serviceGoodsFillRateTarget = value;
};

export const isStorageSpaceClampEnabled = (): boolean => storageSpaceClampEnabled;
export const getPidOutMaxDown = (): number | null => pidOutMaxDown;
export const getPidOutMaxUp = (): number | null => pidOutMaxUp;
export const getExpansionIntegralThreshold = (): number | null => expansionIntegralThreshold;
export const getContractionIntegralThreshold = (): number | null => contractionIntegralThreshold;
export const getStorageTargetMonths = (): number | null => storageTargetMonths;
export const getStorageTargetScaleAnchored = (): boolean | null => storageTargetScaleAnchored;
export const getMinScaleFraction = (): number | null => minScaleFraction;
export const getSoftMinScaleRange = (): number | null => softMinScaleRange;
export const getServiceSellThroughTarget = (): number | null => serviceSellThroughTarget;
export const getServiceFillRateTarget = (): number | null => serviceFillRateTarget;
export const getServiceFlowDecayTarget = (): number | null => serviceFlowDecayTarget;
export const getServiceGoodsSellThroughTarget = (): number | null => serviceGoodsSellThroughTarget;
export const getServiceGoodsFillRateTarget = (): number | null => serviceGoodsFillRateTarget;
