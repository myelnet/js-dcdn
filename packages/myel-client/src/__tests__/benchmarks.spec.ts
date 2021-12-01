import {benchmark, report, byteSeq} from '@stablelib/benchmark';
import {bytes} from 'multiformats';
import {Multiaddr} from 'multiaddr';
import {getPeerID} from '../utils';

const addrBytes = bytes.fromHex(
  '047f00000106a221dd03a503260024080112209c242e980fb24f18e0e7c7906bdf411eb1d441443413671be9ed4b90d1e37bbb'
);

describe('benchmark', () => {
  test.skip('getPeer', () => {
    report(
      'Multiaddr + getPeerID',
      benchmark(() => getPeerID(new Multiaddr(addrBytes)))
    );
  });
});
