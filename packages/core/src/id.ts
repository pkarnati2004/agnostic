import { randomBytes } from "node:crypto";
import { z } from "zod";

// 32 symbols, no 0/1/l/o, so an id survives being read aloud or retyped; 10 chars = 50 bits.
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const ID_LENGTH = 10;

export const IdSchema = z
  .string()
  .regex(/^[a-km-np-z2-9]{10}$/, "expected a 10-character agnostic id");

export function newId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let id = "";
  for (const byte of bytes) {
    // 256 is a multiple of 32, so the modulo is unbiased.
    id += ID_ALPHABET[byte % ID_ALPHABET.length];
  }
  return id;
}
