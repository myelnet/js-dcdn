import type BigInt from 'bn.js';
import type {Multiaddr} from 'multiaddr';
import type PeerId from 'peer-id';
import type {Address} from '@dcdn/fil-address';
import type {CID} from 'multiformats';

export type DealOffer = {
  id: PeerId;
  multiaddrs: Multiaddr[];
  cid: CID;
  size: number;
  minPricePerByte: BigInt;
  maxPaymentInterval: number;
  maxPaymentIntervalIncrease: number;
  paymentAddress?: Address;
  unsealPrice?: BigInt;
  paymentChannel?: Address;
};
