import {CID} from 'multiformats';
import {
  interpret,
  createMachine,
  StateMachine,
  assign,
  EventObject,
} from '@xstate/fsm';
import BN from 'bn.js';
import PeerId from 'peer-id';
import {Address} from '@glif/filecoin-address';

export type Selector = Object;

type PaymentInfo = {
  chAddr: Address;
  lane: number;
};

export type ChannelID = {
  id: number;
  initiator: PeerId;
  responder: PeerId;
};

export interface DealContext {
  root: CID;
  selector: Selector;
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
  paymentInfo?: PaymentInfo;
}

export type DealEvent =
  | {type: 'DEAL_PROPOSED'}
  | {type: 'DEAL_REjECTED'}
  | {type: 'DEAL_ACCEPTED'}
  | {type: 'PAYCH_READY'; paymentInfo: PaymentInfo}
  | {type: 'PAYCH_FAILED'; error: string}
  | {type: 'PAYMENT_REQUESTED'; owed: BN}
  | {type: 'BLOCK_RECEIVED'; received: number}
  | {type: 'ALL_BLOCKS_RECEIVED'; received: number}
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
  | {value: 'completed'; context: DealContext};

export type Channel = StateMachine.Service<DealContext, DealEvent, DealState>;

export type ChannelState = StateMachine.State<
  DealContext,
  DealEvent,
  DealState
>;

const receiveBlock = assign<
  DealContext,
  | {type: 'BLOCK_RECEIVED'; received: number}
  | {type: 'ALL_BLOCKS_RECEIVED'; received: number}
>({
  received: (ctx, evt) => ctx.received + evt.received,
});
const receiveAllBlocks = assign({allReceived: true});

export function createChannel(
  id: ChannelID,
  context: DealContext,
  actions?: StateMachine.ActionMap<DealContext, DealEvent>
): Channel {
  return interpret(
    createMachine<DealContext, DealEvent, DealState>(
      {
        id:
          id.initiator.toString() + '-' + id.responder.toString() + '-' + id.id,
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
              DEAL_REjECTED: 'rejected',
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
                actions: [receiveBlock, receiveAllBlocks],
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
                actions: [receiveBlock, receiveAllBlocks],
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
                  fundsSpent: (ctx, evt) => ctx.fundsSpent.add(evt.amt),
                }),
              },
              PAYMENT_FAILED: 'failure',
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
                actions: [receiveBlock, receiveAllBlocks],
              },
              TRANSFER_COMPLETED: 'completed',
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