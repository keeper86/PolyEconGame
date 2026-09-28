import { TRPCError } from '@trpc/server';

export type DomainErrorCode =
    | 'notLoggedIn'
    | 'notOwner'
    | 'workforceLicenseRequired'
    | 'commercialLicenseRequired'
    | 'unknownResource';

export type DomainErrorParams = Record<string, string | number>;

export type DomainErrorPacket = {
    code: DomainErrorCode;
    params: DomainErrorParams;
};

export const domainError = (
    code: TRPCError['code'],
    domain: DomainErrorCode,
    message: string,
    params: DomainErrorParams = {},
): TRPCError => new TRPCError({ code, message, cause: { domainError: { code: domain, params } } });
