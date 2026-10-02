import { customAlphabet } from 'nanoid';

/**
 * Generates the ids used across the app: nedb `_id`s (boards, lists, cards,
 * sessions), db file names in test mode and transient UI keys.
 *
 * This replaces `shortid`, which is unmaintained and -- since 2.2.17 --
 * depends on nanoid's ESM-only `browser` entry, which broke every jest suite.
 *
 * The shape stays close to the shortid ids already stored in the user's nedb
 * files: 9 characters out of the same URL-safe alphabet, so old and new ids
 * mix freely -- ids are opaque strings everywhere (nedb keys, redux map keys,
 * React keys). The first character is always a letter on purpose: `Badge`
 * interpolates an id into `clipPath="url(#id)"`, and an XML id may not start
 * with a digit.
 */
const FIRST_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const REST_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

/** 1 letter + 8 URL-safe characters = 9 characters, ~53.7 bits of entropy. */
const firstChar = customAlphabet(FIRST_ALPHABET, 1);
const restChars = customAlphabet(REST_ALPHABET, 8);

export function uid(): string {
    return firstChar() + restChars();
}
