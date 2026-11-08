import { describe, expect, it } from 'vitest';
import { parseBbox } from '../../server/routes/flights';

describe('parseBbox', () => {
  it('accepts absent values and ordered in-range coordinates', () => {
    expect(parseBbox(undefined)).toEqual({ status: 'absent' });
    expect(parseBbox('-10,-5,20,45')).toEqual({ status: 'valid', bbox: [-5, -10, 45, 20] });
    expect(parseBbox(' -10 , -5 , 20 , 45 ')).toEqual({ status: 'valid', bbox: [-5, -10, 45, 20] });
    expect(parseBbox('-180,-90,180,90')).toEqual({ status: 'valid', bbox: [-90, -180, 90, 180] });
  });

  it('rejects malformed, out-of-range, and mis-ordered boxes', () => {
    expect(parseBbox('1,2,3')).toEqual({ status: 'invalid' });
    expect(parseBbox('1,2,3,4,5')).toEqual({ status: 'invalid' });
    expect(parseBbox('a,b,c,d')).toEqual({ status: 'invalid' });
    expect(parseBbox('1,,3,4')).toEqual({ status: 'invalid' });
    expect(parseBbox('10,91,20,45')).toEqual({ status: 'invalid' });
    expect(parseBbox('-181,-5,20,45')).toEqual({ status: 'invalid' });
    expect(parseBbox('20,-5,10,45')).toEqual({ status: 'invalid' });
    expect(parseBbox('10,45,20,-5')).toEqual({ status: 'invalid' });
  });
});
