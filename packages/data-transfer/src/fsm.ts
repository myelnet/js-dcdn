import type {CID} from 'multiformats';
import {interpret, createMachine, StateMachine, assign} from '@xstate/fsm';
import type BN from 'bn.js';
import type PeerId from 'peer-id';
import type {Address} from '@dcdn/fil-address';

export type PaymentInfo = {
  chAddr: Address;
  lane: bigint;
};

export type ChannelID = {
  id: number;
  responder: PeerId;
};

export interface DealContext {
  root: CID;
  received: number;
  totalSize: number;
  allReceived: boolean;
  pricePerByte: BN;
  paymentInterval: number;
  paymentIntervalIncrease: number;
  currentInterval: number;
  fundsSpent: BN;
  paidFor: number;
  // last fields won't be available if pricePerByte.isZero()
  paymentRequested?: BN;
  providerPaymentAddress?: Address;
  initialChannelAddr?: Address; // will be superceded by the paymentInfo field
  paymentInfo?: PaymentInfo;
}

export type DealEvent =
  | {type: 'DEAL_PROPOSED'}
  | {type: 'DEAL_REJECTED'; error: string}
  | {type: 'DEAL_ACCEPTED'}
  | {type: 'PAYCH_READY'; paymentInfo: PaymentInfo}
  | {type: 'PAYCH_FAILED'; error: string}
  | {type: 'PAYMENT_REQUESTED'; owed: BN}
  | {type: 'BLOCK_RECEIVED'; received: number}
  | {type: 'ALL_BLOCKS_RECEIVED'}
  | {type: 'PAYMENT_AUTHORIZED'; amt: BN}
  | {type: 'PAYMENT_SENT'; amt: BN}
  | {type: 'PAYMENT_FAILED'; error: string}
  | {type: 'TRANSFER_COMPLETED'};

export type DealState =
  | {value: 'new'; context: DealContext}
  | {value: 'waitForAcceptance'; context: DealContext}
  | {value: 'accepted'; context: DealContext}
  | {value: 'rejected'; context: DealContext}
  | {value: 'ongoing'; context: DealContext}
  | {value: 'failure'; context: DealContext & {error: string}}
  | {value: 'validatePayment'; context: DealContext}
  | {value: 'sendPayment'; context: DealContext}
  | {value: 'pendingLastBlocks'; context: DealContext}
  | {value: 'completed'; context: DealContext};

export type Channel = StateMachine.Service<DealContext, DealEvent, DealState>;

export type ChannelState = StateMachine.State<
  DealContext,
  DealEvent,
  DealState
>;

const receiveBlock = assign<
  DealContext,
  {type: 'BLOCK_RECEIVED'; received: number}
>({
  received: (ctx, evt) => ctx.received + evt.received,
});
const receiveAllBlocks = assign({allReceived: true});

const allBlocksReceived = (context: DealContext, evt: DealEvent) => {
  return context.allReceived;
};

export function createChannel(
  id: ChannelID,
  context: DealContext,
  actions?: StateMachine.ActionMap<DealContext, DealEvent>
): Channel {
  return interpret(
    createMachine<DealContext, DealEvent, DealState>(
      {
        id: id.responder.toString() + '-' + id.id,
        initial: 'new',
        context,
        states: {
          new: {
            on: {
              DEAL_PROPOSED: 'waitForAcceptance',
            },
          },
          // We have sent a transfer request with our terms in a voucher
          // the responder can either accept of reject.
          waitForAcceptance: {
            on: {
              DEAL_ACCEPTED: 'accepted',
              DEAL_REJECTED: 'rejected',
              BLOCK_RECEIVED: {
                target: 'accepted',
                actions: receiveBlock,
              },
              ALL_BLOCKS_RECEIVED: {
                target: 'accepted',
                actions: receiveAllBlocks,
              },
              // may happen in the case of a free transfer and a single block
              TRANSFER_COMPLETED: 'pendingLastBlocks',
            },
          },
          // Once accepted if the transfer requires payment we load a payment channel with the funds
          // if no payment is needed we'll just start receiving blocks and wait for completion event.
          accepted: {
            on: {
              PAYMENT_REQUESTED: {
                target: 'validatePayment',
                actions: assign({paymentRequested: (_, evt) => evt.owed}),
              },
              PAYCH_READY: {
                target: 'ongoing',
                actions: assign({paymentInfo: (_, evt) => evt.paymentInfo}),
              },
              BLOCK_RECEIVED: {
                target: 'ongoing',
                actions: receiveBlock,
              },
              ALL_BLOCKS_RECEIVED: {
                target: 'ongoing',
                actions: receiveAllBlocks,
              },
              TRANSFER_COMPLETED: {
                target: 'pendingLastBlocks',
              },
            },
          },
          // Payment validation state is entered when a responder sends a request for payment. In this case we must
          // validate the request and stay in it until the conditions for payment are valid. This might mean waiting
          // for a payment channel to be ready or for more blocks to come in so we've reached the right interval.
          validatePayment: {
            entry: ['checkPayment'],
            on: {
              PAYCH_READY: {
                target: 'validatePayment',
                actions: assign({paymentInfo: (_, evt) => evt.paymentInfo}),
              },
              PAYMENT_AUTHORIZED: 'sendPayment',
              BLOCK_RECEIVED: {
                target: 'validatePayment',
                actions: receiveBlock,
              },
              ALL_BLOCKS_RECEIVED: {
                target: 'validatePayment',
                actions: receiveAllBlocks,
              },
            },
          },
          // Send payment prepares and sends a payment voucher, if it fails we have no choice but to end the deal.
          sendPayment: {
            entry: ['processPayment'],
            on: {
              PAYMENT_SENT: {
                target: 'ongoing',
                actions: assign({
                  fundsSpent: (ctx, evt) => evt.amt,
                }),
              },
              PAYMENT_FAILED: 'failure',
              BLOCK_RECEIVED: {
                target: 'sendPayment',
                actions: receiveBlock,
              },
              ALL_BLOCKS_RECEIVED: {
                target: 'sendPayment',
                actions: receiveAllBlocks,
              },
            },
          },
          // In the ongoing state we don't need to do anything, just wait for the next event to unfold.
          ongoing: {
            on: {
              PAYCH_READY: {
                target: 'ongoing',
                actions: assign({paymentInfo: (_, evt) => evt.paymentInfo}),
              },
              PAYMENT_REQUESTED: {
                target: 'validatePayment',
                actions: assign({paymentRequested: (_, evt) => evt.owed}),
              },
              BLOCK_RECEIVED: {
                target: 'ongoing',
                actions: receiveBlock,
              },
              ALL_BLOCKS_RECEIVED: {
                target: 'ongoing',
                actions: receiveAllBlocks,
              },
              TRANSFER_COMPLETED: [
                {target: 'completed', cond: allBlocksReceived},
                {target: 'pendingLastBlocks'},
              ],
            },
          },
          // pendingLastBlocks is entered when the responder has sent a completion message confirming
          // they are all done on their end though we still need to validate the last blocks
          pendingLastBlocks: {
            on: {
              BLOCK_RECEIVED: {
                target: 'pendingLastBlocks',
                actions: receiveBlock,
              },
              ALL_BLOCKS_RECEIVED: {
                target: 'completed',
                actions: receiveAllBlocks,
              },
            },
          },
          // rejected transfers didn't even start and we may get a reason so we can try again.
          rejected: {},
          // failure is bad
          failure: {},
          // all went successfully and we should have all the content we wanted.
          completed: {},
        },
      },
      {actions}
    )
  );
}
