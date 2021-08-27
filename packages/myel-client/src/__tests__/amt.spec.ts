import {BN} from 'bn.js';
import {AMT} from '../amt';
import {CompactLaneState} from '../PaychMgr';

describe('amt', () => {
  test('handles an empty array', () => {
    const amt = AMT.loadFromBase64('hAMAAINBAICA');

    expect(amt.count.toString()).toBe('0');
    expect(amt.height.toString()).toEqual('0');
    expect(amt.bitWidth).toBe(3);
  });

  it('handles multiple lanes', async () => {
    const amt = AMT.loadFromBase64<CompactLaneState>(
      'hAMABYNBH4CFgkIAAQGCQgACAoJCAAMDgkIABASCQgAFBQ=='
    );

    expect(amt.count.toString()).toBe('5');
    expect(amt.height.toString()).toEqual('0');
    expect(amt.bitWidth).toBe(3);

    let i = 0;
    for await (const value of amt) {
      // check redeemed amount
      const redeemed = new BN(value[0]);
      expect(redeemed.toNumber()).toBe(i + 1);
      // check nonces
      expect(value[1]).toBe(i + 1);
      i++;
    }
    expect(i).toBe(5);
  });
});
