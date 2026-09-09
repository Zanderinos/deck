/** How deck identifies one pull request: "owner/name#number". */
export const prKey = (pr: { repo: string; number: number }): string => `${pr.repo}#${pr.number}`;
