import { Injectable } from "@nestjs/common";
import { argon2id, hash, type HashOptions, verify } from "argon2";
import { PasswordHasherPort } from "../ports/password-hasher.port";

const options: HashOptions = {
  type: argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  private readonly dummyHash = hash(
    "dummy-password-that-is-never-valid",
    options,
  );

  async hash(password: string): Promise<string> {
    return hash(password, options);
  }

  async verify(encodedHash: string, password: string): Promise<boolean> {
    return verify(encodedHash, password);
  }

  async verifyDummy(password: string): Promise<void> {
    await verify(await this.dummyHash, password).catch(() => false);
  }
}
