/**
 * Terminal colouring for debug output, backed by node:util's styleText.
 *
 * This replaces chalk. chalk v5+ is ESM-only, so a CommonJS build cannot
 * require() it - the same trap that broke the memory provider via quick-lru in
 * #128. Rather than carry a dependency that can only move forward by breaking
 * us, use the built-in.
 *
 * styleText already does the detection chalk did: it honours NO_COLOR,
 * FORCE_COLOR, TERM and whether stdout is a TTY, and returns the string
 * untouched when colour is not appropriate. That matters here, because these
 * strings go through `debug` into logs that are frequently not a terminal.
 */

import { styleText } from 'node:util';

/** The format names node:util accepts, so a typo is a compile error. */
type StyleFormat = Parameters<typeof styleText>[0];

const style = (format: StyleFormat) => (text: unknown) => styleText(format, String(text));

/** chalk called this `grey`; node:util calls it `gray`. */
export const grey = style('gray');

export const blueBright = style('blueBright');
export const cyan = style('cyan');
export const green = style('green');
export const magenta = style('magenta');
export const magentaBright = style('magentaBright');
export const redBright = style('redBright');
export const yellow = style('yellow');

export default {
  blueBright,
  cyan,
  green,
  grey,
  magenta,
  magentaBright,
  redBright,
  yellow,
};
