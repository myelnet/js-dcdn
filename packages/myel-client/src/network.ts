import {MuxedStream, HandlerProps} from 'libp2p';
import PeerId from 'peer-id';

export interface ProtocolDialer {
  dialProtocol: (
    peer: PeerId,
    protocols: string[] | string,
    options?: any
  ) => Promise<{stream: MuxedStream; protocol: string}>;
}

export interface ProtocolHandlerRegistrar {
  handle: (protocol: string, handler: (props: HandlerProps) => void) => void;
  unhandle: (protocol: string | string[]) => void;
}
