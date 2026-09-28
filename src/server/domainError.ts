import { TRPCError } from '@trpc/server';

export const DOMAIN_ERROR_CODES = [
    'notLoggedIn',
    'notOwner',
    'workforceLicenseRequired',
    'commercialLicenseRequired',
    'unknownResource',
    'userNotFound',
    'agentNotFound',
    'messageNotFound',
    'recipientNotFound',
    'cannotMessageSelf',
    'messageRateLimited',
    'userAlreadyHasAgent',
    'agentNameEmpty',
    'agentNameTooLong',
    'agentNameInvalid',
    'invalidLogo',
    'logoTaken',
    'invalidAvatarData',
    'avatarPngOnly',
    'noCompanyToAcknowledge',
    'noBankruptcyRecord',
    'agentHasNoAssets',
    'commercialBuyLicenseRequired',
    'workforceBuildLicenseRequired',
    'workforceExpandLicenseRequired',
    'invalidResourceName',
    'invalidResourceNameInCargoGoal',
    'invalidBuyBid',
    'invalidSellOffer',
    'priceInvalid',
    'priceNotPositive',
    'priceBelowFloor',
    'priceAboveCeiling',
    'quantityInvalid',
    'quantityNegative',
    'quantityBelowMinimum',
    'quantityExceedsStorage',
    'insufficientDeposits',
    'sellThroughAboveLimit',
    'fillRateAboveLimit',
    'noAccountOnIssuingPlanet',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type DomainErrorParams = Record<string, string | number>;

export type DomainErrorPacket = {
    code: DomainErrorCode;
    params: DomainErrorParams;
};

const CODE_BY_MESSAGE: Record<string, DomainErrorCode> = {
    'You must be logged in to access this resource or provide a valid PAT.': 'notLoggedIn',
    'You do not own this agent': 'notOwner',
    'An active workforce license is required to set worker allocation targets on this planet':
        'workforceLicenseRequired',
    'An active commercial license is required to place sell offers on this planet': 'commercialLicenseRequired',
    'User not found': 'userNotFound',
    'Agent not found': 'agentNotFound',
    'Message not found': 'messageNotFound',
    'Recipient not found': 'recipientNotFound',
    'Cannot send a message to yourself': 'cannotMessageSelf',
    'Too many messages sent. Please wait a moment before trying again.': 'messageRateLimited',
    'User already has an agent': 'userAlreadyHasAgent',
    'Agent name cannot be empty': 'agentNameEmpty',
    'Agent name cannot exceed 64 characters': 'agentNameTooLong',
    'Agent name must contain at least one letter or digit': 'agentNameInvalid',
    'Invalid company logo': 'invalidLogo',
    'This logo is already taken by another company': 'logoTaken',
    'Invalid base64 image data': 'invalidAvatarData',
    'Only PNG images are supported for avatar': 'avatarPngOnly',
    'No company to acknowledge': 'noCompanyToAcknowledge',
    'No bankruptcy record found': 'noBankruptcyRecord',
    'Agent has no assets on this planet': 'agentHasNoAssets',
    'A active commercial license is required to place buy bids on this planet': 'commercialBuyLicenseRequired',
    'An active workforce license is required to build facilities on this planet': 'workforceBuildLicenseRequired',
    'An active workforce license is required to expand facilities on this planet': 'workforceExpandLicenseRequired',
    'Invalid resource name': 'invalidResourceName',
    'Invalid resource name in cargo goal': 'invalidResourceNameInCargoGoal',
    'No account on the issuing planet. Visit that planet first to open an account.': 'noAccountOnIssuingPlanet',
};

export const domainCodeForMessage = (message: string): DomainErrorCode | null => CODE_BY_MESSAGE[message] ?? null;

export const domainError = (
    code: TRPCError['code'],
    domain: DomainErrorCode,
    message: string,
    params: DomainErrorParams = {},
): TRPCError => new TRPCError({ code, message, cause: { domainError: { code: domain, params } } });
