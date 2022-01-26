import * as React from 'react';
import type {Content} from './Uploader';
import PeerSelecter from './PeerSelecter';
import {Peer, peerAddr} from './peers';
import {Chevron, CloudDown} from './icons';
import Spinner from './Spinner';
import {humanFileSize} from './utils';
import PillSelector from './PillSelector';

type ContentNode = {
  name: string;
  hash: string;
  size: number;
};

type ContentRowProps = Content & {
  onClick: () => void;
  onImport: (peer: string) => void;
  workerUrl: string;
};

function ContentRow({hash, size, peers, onImport, workerUrl}: ContentRowProps) {
  const [peer, setPeer] = React.useState(peers[0]);
  const [pOpen, setPOpen] = React.useState(false);
  const [tOpen, setTOpen] = React.useState(false);
  const [children, setChildren] = React.useState<ContentNode[]>([
    // {
    //   name: 'my file',
    //   hash: 'bafyreifcwkoxdrf23degfpmytina2255wvcdxxnojjredcfjatqthltm5u',
    //   size: 300000,
    // },
  ]);
  const [pending, setPending] = React.useState(false);
  const openSelector = () => {
    setPOpen(true);
  };
  const formatUrl = (path?: string, peer?: Peer): string => {
    let base = workerUrl + '/' + hash;
    if (path) {
      base += '/' + path;
    }
    if (peer) {
      base += '?peer=' + peerAddr(peer);
    }
    return base;
  };

  const toggleTree = () => {
    if (!tOpen && children.length === 0) {
      setPending(true);
      fetch(formatUrl(undefined, peer), {
        headers: {
          Accept: 'application/json',
        },
      })
        .then((res) => res.json())
        .then((res) => {
          setChildren(res);
          setPending(false);
        });
    }
    setTOpen(!tOpen);
  };
  return (
    <li data-dcdn-content-row="" onClick={toggleTree}>
      <div data-dcdn-content-item-row="">
        <Chevron direction={tOpen ? 'down' : 'right'} size="small" />
        <div data-dcdn-content-row-heading="">
          <div>
            {hash.slice(0, 8)}...{hash.slice(-8)}
          </div>
        </div>
        <PillSelector title={peer.name.split('.')[0]} onClick={openSelector} />
      </div>
      {tOpen && (
        <ul data-dcdn-content-item-list="">
          {pending ? (
            <li data-dcdn-placeholder-row="">
              <Spinner small />
            </li>
          ) : (
            children.map((child, i) => (
              <li data-dcdn-content-row="" key={child.hash + i}>
                <a
                  data-dcdn-content-item-row=""
                  href={formatUrl(child.name, peer)}
                  download
                >
                  <div data-dcdn-content-row-heading="">
                    <div>
                      {child.name.slice(0, 24)}
                      {child.name.length > 24 ? '...' : ''}{' '}
                      <span data-dcdn-fineprint="">
                        ({humanFileSize(child.size)})
                      </span>
                    </div>
                  </div>
                  <div data-dcdn-content-row-load="">
                    <CloudDown />
                  </div>
                </a>
              </li>
            ))
          )}
        </ul>
      )}
      <PeerSelecter
        isOpen={pOpen}
        onDismiss={() => setPOpen(false)}
        onSelect={(id) => setPeer(peers.find((p) => p.id === id)!)}
        onImport={onImport}
        selected={{[peer.id]: true}}
        peers={peers}
      />
    </li>
  );
}

type RetrieverProps = {
  content: Content[];
  onImportPeer: (peer: string) => void;
  workerUrl: string;
};

export default function Retriever({
  content,
  onImportPeer,
  workerUrl,
}: RetrieverProps) {
  const retrieve = (item: Content) => {};
  return (
    <>
      <div data-dcdn-fs-portal-framescroll="">
        <ul data-dcdn-content-list="">
          {content.map((item, i) => (
            <ContentRow
              key={item.hash + i}
              {...item}
              onClick={() => retrieve(item)}
              onImport={onImportPeer}
              workerUrl={workerUrl}
            />
          ))}
        </ul>
      </div>
      <div data-dcdn-fs-portal-framebottom="">
        <p data-dcdn-fineprint="">Your file will download automatically.</p>
      </div>
    </>
  );
}
