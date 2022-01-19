import * as React from 'react';
import {Peer, validateAddr} from './peers';
import Modal from './Modal';
import TextInput from './TextInput';

const peerFromMaddr = (addr: string): Peer => {
  const parts = addr.split('/');
  return {
    id: parts[7],
    name: parts[2],
    location: 'Custom',
  };
};

type PeerRowProps = Peer & {
  selected?: boolean;
  onSelect?: (id: string) => void;
};

function PeerRow({
  id,
  name,
  location,
  latency,
  selected,
  onSelect,
}: PeerRowProps) {
  return (
    <li data-dcdn-peer-row="" onClick={() => onSelect?.(id)}>
      <div data-dcdn-peer-row-heading="">
        <div>{id.slice(-16)}</div>
        <div>
          {location} <span data-dcdn-fineprint="">({latency ?? 0}s)</span>
        </div>
      </div>
      {/* onSelect && (
        <div data-dcdn-empty-check="" onClick={() => onSelect(id)}>
          {selected && <span data-dcdn-fill-check="">✅</span>}
        </div>
	)  */}
    </li>
  );
}

type PeerSelecterProps = {
  isOpen: boolean;
  onDismiss: () => void;
  onImport: (peer: string) => void;
  onSelect: (id: string) => void;
  selected: {[key: string]: boolean};
  peers: Peer[];
};

export default function PeerSelecter({
  peers,
  isOpen,
  onDismiss,
  onImport,
  onSelect,
  selected,
}: PeerSelecterProps) {
  const [peer, setPeer] = React.useState('');
  const dismissModal = () => {
    onDismiss();
    setPeer('');
  };
  const addrValid = validateAddr(peer);
  const peerInput = addrValid === '' ? peerFromMaddr(peer) : null;

  const filteredPeers = peers.filter((p) => !selected[p.id]);

  return (
    <Modal isOpen={isOpen} onDismiss={dismissModal} actionTitle="Select a peer">
      <div data-dcdn-maddr-input="">
        <TextInput
          name="peerAddr"
          value={peer}
          onChange={setPeer}
          invalid={peer.length > 0 && addrValid !== ''}
          placeholder="paste multi address"
        />
      </div>
      <ul data-dcdn-peer-list="">
        {peerInput ? (
          <PeerRow
            {...peerInput}
            onSelect={(id) => {
              onImport(peer);
              onSelect(id);
              dismissModal();
            }}
          />
        ) : filteredPeers.length === 0 ? (
          <li data-dcdn-placeholder-row="">
            <div data-dcdn-fineprint="">No peers available</div>
          </li>
        ) : (
          filteredPeers.map((p) => (
            <PeerRow
              key={p.id}
              {...p}
              onSelect={(id) => {
                onSelect(id);
                dismissModal();
              }}
            />
          ))
        )}
      </ul>
    </Modal>
  );
}
