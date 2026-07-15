import { toCsv } from './csv.util';

describe('toCsv', () => {
  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('writes a header row from the first row keys', () => {
    expect(toCsv([{ a: 1, b: 'x' }])).toBe('a,b\n1,x');
  });

  it('quotes fields containing commas', () => {
    expect(toCsv([{ name: 'Doe, John', amount: 100 }])).toBe('name,amount\n"Doe, John",100');
  });

  it('escapes embedded quotes by doubling them', () => {
    expect(toCsv([{ note: 'He said "hi"' }])).toBe('note\n"He said ""hi"""');
  });
});
