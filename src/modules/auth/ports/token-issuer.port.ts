export interface TokenIssuerPort {
  issue(input: { userId: number; email: string }): Promise<string>;
}

export const TOKEN_ISSUER = Symbol("TOKEN_ISSUER");
