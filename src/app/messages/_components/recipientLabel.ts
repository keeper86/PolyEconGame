export type RecipientCandidate = {
    userId: string;
    displayName: string | null;
    username: string | null;
    companyName: string | null;
};

export const recipientLabel = (recipient: RecipientCandidate): string => {
    const name = recipient.displayName ?? recipient.username ?? recipient.companyName ?? recipient.userId;
    if (recipient.companyName && recipient.companyName !== name) {
        return `${name} (${recipient.companyName})`;
    }
    return name;
};
