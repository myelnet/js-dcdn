import {createChannel, Channel} from '../fsm';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {BN} from 'bn.js';
import {decodeFilAddress} from '../filaddress';

describe('fsm', () => {
  const responder = PeerId.createFromB58String(
    '12D3KooWJXBSMSn9FS1zsayZ6JK7b3HTaawNy7RKBqaWqiZbiqJb'
  );

  test('handles a new payment channel', () => {
    let service: Channel | null = null;
    service = createChannel(
      {id: 1, responder},
      {
        root: CID.parse(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
        ),
        received: 0,
        totalSize: 1234,
        allReceived: false,
        pricePerByte: new BN(1),
        paymentInterval: 0,
        paymentIntervalIncrease: 0,
        currentInterval: 0,
        fundsSpent: new BN(0),
        paidFor: 0,
      },
      {
        checkPayment: (ctx, evt) => {
          if (!ctx.paymentInfo || !ctx.paymentRequested) {
            return;
          }
          service?.send({
            type: 'PAYMENT_AUTHORIZED',
            amt: ctx.paymentRequested,
          });
        },
        processPayment: (ctx, evt) => {
          if (evt.type !== 'PAYMENT_AUTHORIZED') {
            return;
          }
          service?.send({type: 'PAYMENT_SENT', amt: evt.amt});
        },
      }
    );
    service.start();

    service.send('DEAL_PROPOSED');
    expect(service.state.value).toBe('waitForAcceptance');

    service.send('DEAL_ACCEPTED');
    expect(service.state.value).toBe('accepted');

    service.send({type: 'BLOCK_RECEIVED', received: 234});
    expect(service.state.value).toBe('ongoing');
    expect(service.state.context.received).toBe(234);

    service.send({type: 'PAYMENT_REQUESTED', owed: new BN(1234)});
    expect(service.state.value).toBe('validatePayment');
    expect(service.state.context.paymentRequested?.eq(new BN(1234))).toBe(true);

    service.send({type: 'BLOCK_RECEIVED', received: 1000});
    service.send({type: 'ALL_BLOCKS_RECEIVED'});
    expect(service.state.value).toBe('validatePayment');
    expect(service.state.context.received).toBe(1234);

    service.send({
      type: 'PAYCH_READY',
      paymentInfo: {
        chAddr: decodeFilAddress('f2s3tpuynlyzpdgiexvucmebrs2of4jrfepgtg76y'),
        lane: 0n,
      },
    });
    expect(service.state.value).toBe('ongoing');

    service.send('TRANSFER_COMPLETED');
    expect(service.state.value).toBe('completed');
    expect(service.state.context.fundsSpent.eq(new BN(1234))).toBe(true);
  });

  test('handles paych already ready', () => {
    let service: Channel | null = null;
    service = createChannel(
      {id: 1, responder},
      {
        root: CID.parse(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
        ),
        received: 0,
        totalSize: 1234,
        allReceived: false,
        pricePerByte: new BN(1),
        paymentInterval: 0,
        paymentIntervalIncrease: 0,
        currentInterval: 0,
        fundsSpent: new BN(0),
        paidFor: 0,
      },
      {
        checkPayment: (ctx, evt) => {
          if (!ctx.paymentInfo || !ctx.paymentRequested) {
            return;
          }
          service?.send({
            type: 'PAYMENT_AUTHORIZED',
            amt: ctx.paymentRequested,
          });
        },
        processPayment: (ctx, evt) => {
          if (evt.type !== 'PAYMENT_AUTHORIZED') {
            return;
          }
          service?.send({type: 'PAYMENT_SENT', amt: evt.amt});
        },
      }
    );
    service.start();

    service.send('DEAL_PROPOSED');
    expect(service.state.value).toBe('waitForAcceptance');

    service.send('DEAL_ACCEPTED');
    expect(service.state.value).toBe('accepted');

    service.send({type: 'BLOCK_RECEIVED', received: 234});
    expect(service.state.value).toBe('ongoing');
    expect(service.state.context.received).toBe(234);

    service.send({
      type: 'PAYCH_READY',
      paymentInfo: {
        chAddr: decodeFilAddress('f2s3tpuynlyzpdgiexvucmebrs2of4jrfepgtg76y'),
        lane: 0n,
      },
    });
    expect(service.state.value).toBe('ongoing');

    service.send({type: 'PAYMENT_REQUESTED', owed: new BN(1234)});
    // validatePayment -> sendPayment -> ongoing
    expect(service.state.value).toBe('ongoing');
    expect(service.state.context.paymentRequested?.eq(new BN(1234))).toBe(true);

    service.send({type: 'BLOCK_RECEIVED', received: 1000});
    expect(service.state.value).toBe('ongoing');
    expect(service.state.context.received).toBe(1234);

    service.send({type: 'ALL_BLOCKS_RECEIVED'});

    service.send('TRANSFER_COMPLETED');
    expect(service.state.value).toBe('completed');
    expect(service.state.context.fundsSpent.eq(new BN(1234))).toBe(true);
  });
});
