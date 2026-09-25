import { describe, expect, it } from 'vitest';
import { isValidKzIdNumber } from './validators.js';

describe('isValidKzIdNumber', () => {
  it('accepts a number with a valid control digit', () => {
    expect(isValidKzIdNumber('990940000036')).toBe(true);
  });
  it('rejects a wrong control digit', () => {
    expect(isValidKzIdNumber('990940000037')).toBe(false);
  });
  it('rejects wrong length and non-digits', () => {
    expect(isValidKzIdNumber('12345')).toBe(false);
    expect(isValidKzIdNumber('99094000003a')).toBe(false);
  });
});
