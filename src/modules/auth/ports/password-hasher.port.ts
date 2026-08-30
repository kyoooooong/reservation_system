export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
