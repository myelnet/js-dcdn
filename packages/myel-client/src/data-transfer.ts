import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {Block} from 'multiformats/block';
import * as dagCBOR from '@ipld/dag-cbor';
import {SelectorNode, selToBlock, blockFromStore} from './selectors';
import {ProtocolDialer, ProtocolHandlerRegistrar} from './network';
import {ContentRoutingInterface, DealOffer} from './routing';
import {
  createChannel,
  Channel,
  ChannelID,
  DealContext,
  DealEvent,
  ChannelState,
  PaymentInfo,
} from './fsm';
import {encodeBigInt, encodeAsBigInt} from './utils';
import {Address} from './filaddress';
import {BN} from 'bn.js';
import BigInt from 'bn.js';
import {EventEmitter} from 'events';
import {PaychMgr} from './PaychMgr';
import {pipe} from 'it-pipe';
import {HandlerProps} from 'libp2p';
import BufferList from 'bl/BufferList';
import {Blockstore} from 'interface-blockstore';

export const PROTOCOL = '/fil/datatransfer/1.1.0';
const EXTENSION = 'fil/data-transfer/1.1';

interface Transport {
  blocks: Blockstore;
  request: (link: CID, sel: Block<SelectorNode>) => TransportRequest;
  ongoing: (
    link: CID,
    sel: Block<SelectorNode>
  ) => TransportRequest | undefined;
}

interface TransportRequest extends EventEmitter {
  id: number;
  open: (peer: PeerId, extensions?: {[key: string]: Uint8Array}) => void;
  load: (link: CID) => Promise<Block<any>>;
}

export type TransferMessage = {
  IsRq: boolean;
  Request?: TransferRequest;
  Response?: TransferResponse;
};

export type TransferRequest = {
  Type: number;
  XferID: number;
  BCid?: CID;
  Paus?: boolean;
  Part?: boolean;
  Pull?: boolean;
  Stor?: Uint8Array;
  Vouch?: any;
  VTyp?: string;
  RestartChannel?: ChannelID;
};

export type TransferResponse = {
  Type: number;
  Acpt: boolean;
  Paus: boolean;
  XferID: number;
  VRes: any;
  VTyp: string;
};

export enum DealStatus {
  New = 0,
  Unsealing,
  Unsealed,
  WaitForAcceptance,
  PaymentChannelCreating,
  PaymentChannelAddingFunds,
  Accepted,
  FundsNeededUnseal,
  Failing,
  Rejected,
  FundsNeeded,
  SendFunds,
  SendFundsLastPayment,
  Ongoing,
  FundsNeededLastPayment,
  Completed,
  DealNotFound,
  Errored,
  BlocksComplete,
  Finalizing,
  Completing,
  CheckComplete,
  CheckFunds,
  InsufficientFunds,
  PaymentChannelAllocatingLane,
  Cancelling,
  Cancelled,
  WaitingForLastBlocks,
  PaymentChannelAddingInitialFunds,
}

export type DealResponse = {
  ID: number;
  Status: DealStatus;
  PaymentOwed: Uint8Array;
  Message: string;
};

type DataTransferConfig = {
  network: ProtocolDialer & ProtocolHandlerRegistrar;
  transport: Transport;
  routing: ContentRoutingInterface;
  paychMgr: PaychMgr;
  defaultAddress?: Address;
};

export class DataTransfer extends EventEmitter {
  network: ProtocolDialer & ProtocolHandlerRegistrar;
  transport: Transport;
  routing: ContentRoutingInterface;
  paychMgr: PaychMgr;
  defaultAddress?: Address;

  started = false;
  _dealId: number = Date.now();
  _channels: Map<number, Channel> = new Map();

  constructor({
    network,
    transport,
    routing,
    paychMgr,
    defaultAddress,
  }: DataTransferConfig) {
    super();
    this.network = network;
    this.transport = transport;
    this.routing = routing;
    this.paychMgr = paychMgr;
    this.defaultAddress = defaultAddress;
  }

  start() {
    if (!this.started) {
      this.network.handle(PROTOCOL, this._handler.bind(this));
      this.started = true;
    }
  }

  stop() {
    this.started = false;
    this.network.unhandle(PROTOCOL);
  }

  _handler({stream, connection}: HandlerProps) {
    return pipe(stream, async (source: AsyncIterable<BufferList>) => {
      const bl = new BufferList();
      for await (const chunk of source) {
        bl.append(chunk);
      }
      this._receiveMessage(bl.slice());
    });
  }

  _newRequest(offer: DealOffer, sel: Block<SelectorNode>): TransferRequest {
    const id = this._dealId++;
    const voucher = {
      ID: id,
      PayloadCID: offer.cid,
      Params: {
        Selector: sel.bytes,
        PieceCID: null,
        PricePerByte: encodeBigInt(offer.minPricePerByte),
        PaymentInterval: offer.maxPaymentInterval,
        PaymentIntervalIncrease: offer.maxPaymentIntervalIncrease,
        UnsealPrice: offer.unsealPrice
          ? encodeBigInt(offer.unsealPrice)
          : encodeAsBigInt('0'),
      },
    };
    return {
      BCid: offer.cid,
      Type: 0,
      Pull: true,
      Paus: false,
      Part: false,
      Stor: sel.bytes,
      Vouch: voucher,
      VTyp: 'RetrievalDealProposal/1',
      XferID: id,
    };
  }

  _createChannel(dealId: number, offer: DealOffer): Channel {
    const chid = {
      id: dealId,
      responder: offer.id,
    };
    const ch = createChannel(
      chid,
      {
        root: offer.cid,
        received: 0,
        totalSize: offer.size,
        paidFor: 0,
        allReceived: false,
        fundsSpent: new BN(0),
        pricePerByte: offer.minPricePerByte,
        paymentInterval: offer.maxPaymentInterval,
        paymentIntervalIncrease: offer.maxPaymentIntervalIncrease,
        currentInterval: offer.maxPaymentInterval,
        providerPaymentAddress: offer.paymentAddress,
        initialChannelAddr: offer.paymentChannel,
      },
      {
        checkPayment: (ctx) => {
          if (this._validatePayment(ctx)) {
            ch.send({type: 'PAYMENT_AUTHORIZED', amt: ctx.paymentRequested!});
          }
        },
        processPayment: (ctx, evt) => {
          if (evt.type !== 'PAYMENT_AUTHORIZED') {
            return;
          }
          this._processPayment(dealId, evt.amt, offer.id, ctx)
            .then(() => {
              ch.send({type: 'PAYMENT_SENT', amt: evt.amt});
            })
            .catch((e) => ch.send({type: 'PAYMENT_FAILED', error: e.message}));
        },
      }
    );
    ch.subscribe((state) => {
      this.emit(state.value, state.context);
    });
    ch.start();
    return ch;
  }

  _receiveMessage = (data: Uint8Array) => {
    const dtres: TransferMessage = dagCBOR.decode(data);

    const res = dtres.Response;
    if (!res) {
      return;
    }

    const ch = this.getChannel(res.XferID);
    if (res.Acpt && res.VRes && res.VTyp === 'RetrievalDealResponse/1') {
      const response: DealResponse = res.VRes;

      switch (response.Status) {
        case DealStatus.Accepted:
          ch.send('DEAL_ACCEPTED');
          if (ch.state.context.pricePerByte.gt(new BN(0))) {
            this._loadFunds(ch.state.context).then((info) => {
              ch.send({type: 'PAYCH_READY', paymentInfo: info});
            });
          }
          break;

        case DealStatus.Completed:
          ch.send('TRANSFER_COMPLETED');
          break;

        case DealStatus.FundsNeeded:
        case DealStatus.FundsNeededLastPayment:
          ch.send({
            type: 'PAYMENT_REQUESTED',
            owed: new BN(response.PaymentOwed),
          });
          break;
        default:
        // handle as an error?
      }
    }
    // if response is not accepted, voucher revalidation failed
    if (!res.Acpt) {
      const err = res.VRes?.Message ?? 'Voucher invalid';
      // TODO
      ch.send('DEAL_REjECTED');
    }
  };

  _loadFunds(context: DealContext): Promise<PaymentInfo> {
    if (!context.providerPaymentAddress) {
      throw new Error('no payment address for the provider');
    }
    if (!this.defaultAddress) {
      throw new Error('no local payment address');
    }

    const funds = context.pricePerByte.mul(new BN(context.totalSize));
    return this.paychMgr
      .getChannel(
        this.defaultAddress,
        context.providerPaymentAddress,
        funds,
        context.initialChannelAddr
      )
      .then((chAddr) => {
        // will allocate a new lane if the channel was just created or loaded from chain
        const lane = this.paychMgr.getLane(chAddr);
        return {
          chAddr,
          lane,
        };
      });
  }

  _validatePayment(context: DealContext): boolean {
    if (!context.paymentRequested || !context.paymentInfo) {
      return false;
    }
    // validate we've received all the bytes we're getting charged for
    const total = context.pricePerByte.mul(new BN(context.received));
    return context.paymentRequested.lte(total.sub(context.fundsSpent));
  }

  _processPayment(
    id: number,
    amt: BigInt,
    responder: PeerId,
    {paymentInfo}: DealContext
  ): Promise<void> {
    if (!paymentInfo) {
      throw new Error('could not process payment: no payment info');
    }
    return this.paychMgr
      .createVoucher(paymentInfo.chAddr, amt, paymentInfo.lane)
      .then(({voucher, shortfall}) => {
        if (shortfall.gt(new BN(0))) {
          // TODO: recover
          throw new Error('not enough funds in channel');
        }
        return this._sendMessage(responder, {
          Type: 4,
          Vouch: {
            ID: id,
            PaymentChannel: paymentInfo.chAddr.str,
            PaymentVoucher: voucher.toEncodable(false),
          },
          VTyp: 'RetrievalDealPayment/1',
          XferID: id,
        });
      });
  }

  _sendMessage(to: PeerId, msg: TransferRequest) {
    return this.network
      .dialProtocol(to, PROTOCOL)
      .then(({stream}) =>
        pipe([dagCBOR.encode({IsRq: true, Request: msg})], stream)
      );
  }

  getChannel(id: number): Channel {
    const ch = this._channels.get(id);
    if (!ch) {
      throw new Error('channel not found');
    }
    return ch;
  }

  // returns a new loader for a given traversal
  // this means a new traversal will be started
  // then any block from that traversal can be loaded with that loader once they're available
  newLoader(root: CID, link: CID, sel: SelectorNode) {
    let channel: Channel;
    return {
      load: async (blk: CID): Promise<Block<any>> => {
        try {
          const block = await blockFromStore(blk, this.transport.blocks);
          return block;
        } catch (e) {}
        const selblk = await selToBlock(sel);
        // load checks if we can find the block either in the local blockstore
        // or with an ongoing request
        let request = this.transport.ongoing(link, selblk);
        if (!request) {
          if (!this.started) {
            throw new Error('data transfer is not listening');
          }

          const offers = this.routing
            .findProviders(root, {selector: sel})
            [Symbol.asyncIterator]();

          try {
            const {value: offer} = await offers.next();
            // this is the actual data transfer request containing the request voucher
            // attached as an extension to the transport request
            const dataRequest = this._newRequest(offer, selblk);
            channel = this._createChannel(dataRequest.XferID, offer);
            this._channels.set(dataRequest.XferID, channel);

            request = this.transport.request(link, selblk);
            request.on('incomingBlock', ({size}) => {
              channel.send({
                type: 'BLOCK_RECEIVED',
                received: size,
              });
            });
            request.on('incomingResponse', ({extensions}) => {
              const msg = extensions[EXTENSION];
              if (msg) {
                this._receiveMessage(msg);
              }
            });

            request.open(offer.id, {
              [EXTENSION]: dagCBOR.encode({
                IsRq: true,
                Request: dataRequest,
              }),
            });
            channel.send('DEAL_PROPOSED');
          } catch (e) {
            throw new Error('routing: not found');
          }
        }
        return request.load(blk);
      },
      close: () => {
        if (channel) {
          channel.send('ALL_BLOCKS_RECEIVED');
        }
      },
    };
  }
}
