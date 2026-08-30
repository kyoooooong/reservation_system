import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { PG_POOL } from "../../../infrastructure/db/tokens";
import { emailAlreadyExists } from "../domain/auth-errors";

export type UserRecord = {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
};

@Injectable()
export class UserRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: {
    email: string;
    passwordHash: string;
    name: string;
  }): Promise<UserRecord> {
    try {
      const result = await this.pool.query<{
        id: number;
        email: string;
        password_hash: string;
        name: string;
      }>(
        `
          INSERT INTO users (email, password_hash, name)
          VALUES ($1, $2, $3)
          RETURNING id, email, password_hash, name
        `,
        [input.email, input.passwordHash, input.name],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("user insert returned no rows");
      }
      return {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        name: row.name,
      };
    } catch (error) {
      if (pgCode(error) === "23505") {
        throw emailAlreadyExists();
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query<{
      id: number;
      email: string;
      password_hash: string;
      name: string;
    }>(
      `
        SELECT id, email, password_hash, name
          FROM users
         WHERE lower(email) = lower($1)
      `,
      [email],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash,
          name: row.name,
        }
      : null;
  }
}

const pgCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
