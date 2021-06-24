export type StatucCopy = {
  [key: string]: string;
};

const statusCopy: StatucCopy = {
  DealStatusNew: 'Starting new deal',
  DealStatusUnsealing: 'Unsealing data',
  DealStatusUnsealed: 'Unsealed data',
  DealStatusWaitForAcceptance: 'Waiting for decision',
  DealStatusPaymentChannelCreating: 'Creating payment channel',
  DealStatusPaymentChannelAddingFunds: 'Adding funds',
  DealStatusAccepted: 'Deal accepted',
  DealStatusFundsNeededUnseal: 'Need funds to undeal',
  DealStatusFailing: 'Failing',
  DealStatusRejected: 'Rejected',
  DealStatusFundsNeeded: 'Need more funds',
  DealStatusSendFunds: 'Sending funds',
  DealStatusSendFundsLastPayment: 'Sending last payment',
  DealStatusOngoing: 'Transfering blocks',
  DealStatusFundsNeededLastPayment: 'Need funds for last payment',
  DealStatusCompleted: 'Completed',
  DealStatusDealNotFound: 'Deal not found',
  DealStatusErrored: 'Something went wrong',
  DealStatusBlocksComplete: 'All blocks transferred',
  DealStatusFinalizing: 'Finalizing',
  DealStatusCompleting: 'Completing',
  DealStatusCheckComplete: 'Checking all is good',
  DealStatusCheckFunds: 'Checking funds',
  DealStatusInsufficientFunds: 'Unsufficient funds',
  DealStatusPaymentChannelAllocatingLane: 'Allocating payment lane',
  DealStatusCancelling: 'Cancelling deal',
  DealStatusCancelled: 'Deal cancelled',
  DealStatusWaitingForLastBlocks: 'Waiting for last blocks',
  DealStatusPaymentChannelAddingInitialFunds: 'Adding funds',
};

export default statusCopy;
