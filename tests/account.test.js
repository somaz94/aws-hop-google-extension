import { describe, test, expect } from '@jest/globals';
import { formatAccountId, isAccountAlias, normalizeAccount, normalizeAccountId, parseRoleArn } from '../src/lib/account.js';

describe('normalizeAccountId', () => {
  test.each([
    ['123456789012', '123456789012'],
    ['1234-5678-9012', '123456789012'],
    [' 1234 5678 9012 ', '123456789012'],
  ])('%p → %p', (input, expected) => {
    expect(normalizeAccountId(input)).toBe(expected);
  });

  test.each(['12345', '1234567890123', 'abc', '', null, undefined])('rejects %p', (input) => {
    expect(normalizeAccountId(input)).toBeNull();
  });
});

describe('isAccountAlias', () => {
  test.each(['my-org', 'abc', 'org123'])('accepts %p', (alias) => {
    expect(isAccountAlias(alias)).toBe(true);
  });

  test.each(['ab', '-org', 'org-', 'My-Org', 'my_org', '123456789012', 'a'.repeat(64)])('rejects %p', (alias) => {
    expect(isAccountAlias(alias)).toBe(false);
  });
});

describe('normalizeAccount', () => {
  test('prefers the account ID form', () => {
    expect(normalizeAccount('1111-2222-3333')).toBe('111122223333');
  });

  test('lowercases an alias', () => {
    expect(normalizeAccount(' My-Org ')).toBe('my-org');
  });

  test('returns null for anything else', () => {
    expect(normalizeAccount('not an account')).toBeNull();
    expect(normalizeAccount(undefined)).toBeNull();
  });
});

describe('formatAccountId', () => {
  test('groups an ID in fours', () => {
    expect(formatAccountId('111122223333')).toBe('1111-2222-3333');
  });

  test('leaves aliases and empty values as text', () => {
    expect(formatAccountId('my-org')).toBe('my-org');
    expect(formatAccountId(null)).toBe('');
  });
});

describe('parseRoleArn', () => {
  test('keeps the role path', () => {
    expect(parseRoleArn('arn:aws:iam::111122223333:role/division/Admin')).toEqual({
      partition: 'aws',
      accountId: '111122223333',
      roleName: 'division/Admin',
    });
  });

  test('accepts other partitions', () => {
    expect(parseRoleArn('arn:aws-cn:iam::111122223333:role/Admin').partition).toBe('aws-cn');
  });

  test.each(['arn:aws:iam::111122223333:user/jane', 'Admin', '', null])('rejects %p', (input) => {
    expect(parseRoleArn(input)).toBeNull();
  });
});
