import * as React from 'react';
import Logo from './Logo';
import {usePeers} from './peers';
import Uploader, {Content} from './Uploader';
import Modal, {ModalMethods} from './Modal';
import SegmentedControl from './SegmentedControl';
import {Gearshape} from './icons';
import Retriever from './Retriever';
import TextInput from './TextInput';

type FsPortalProps = {
  swUrl: string;
  cfwUrl: string;
};

function FsPortal({swUrl, cfwUrl}: FsPortalProps) {
  const [mode, setMode] = React.useState('upload');
  const {peers, selectPeer, selected, selectedPeers, importPeer} = usePeers({
    ping: false,
  });
  const [content, setContent] = React.useState<Content[]>([
    // {
    //   hash: 'bafyreid7i5p6naw3d334jvsav3hob4jd4qyfbphiimvvhjcfn5nw3xcw3m',
    //   size: 300000,
    //   peers: [
    //     {
    //       id: '12D3KooWRYAvLLvBcLSGUeUzvtEJgexHuahoC3tVGSGEq81G5gJK',
    //       location: 'CDMX, MX',
    //       name: 'tdot.sa.ngrok.io',
    //     },
    //   ],
    // },
  ]);
  const [settings, setSettings] = React.useState(false);
  const [type, setType] = React.useState('service-worker');

  const [p2pSeed, setP2pSeed] = React.useState('');
  const [filSeed, setFilSeed] = React.useState('');
  const settingsModal = React.useRef<ModalMethods>(null);

  async function setClientType() {
    if (p2pSeed || filSeed) {
      const cache = await caches.open('dcdn');
      await cache.put(
        'dcdn-config',
        new Response(
          JSON.stringify({
            peerIdKey: p2pSeed,
            filSeed: filSeed,
          })
        )
      );
    }
    if (type === 'service-worker') {
      navigator.serviceWorker
        .register(swUrl)
        .then(function (reg) {
          reg.onupdatefound = function () {
            const installingWorker = reg.installing;
            if (installingWorker == null) {
              return;
            }
            installingWorker.onstatechange = function () {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // At this point, the updated precached content has been fetched,
                  // but the previous service worker will still serve the older
                  // content until all client tabs are closed.
                  console.log(
                    'New content is available and will be used when all ' +
                      'tabs for this page are closed'
                  );
                } else {
                  console.log('Content is cached for offline use.');
                }
              }
              if (installingWorker.state === 'activated') {
                console.log(installingWorker.state);
              }
            };
          };
        })
        .catch(function (error) {
          // registration failed
          console.log('Registration failed with ' + error);
        });
    } else {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.unregister());
    }
  }

  React.useEffect(() => {
    setClientType();
  }, [type]);

  const workerUrl = type === 'service-worker' ? '/' : cfwUrl;
  return (
    <div data-dcdn-fs-portal="">
      <div data-dcdn-fs-portal-frametop="">
        <div data-dcdn-fs-portal-frametop-head="">
          <div data-dcdn-fs-portal-frametop-head-corner="">
            <Logo />
          </div>
          <div data-dcdn-fs-portal-frametop-head-center="">
            <SegmentedControl
              options={['upload', 'retrieve']}
              value={mode}
              onChange={setMode}
            />
          </div>
          <div
            data-dcdn-fs-portal-frametop-head-corner="right"
            onClick={() => setSettings(true)}
          >
            <Gearshape />
          </div>
        </div>
        <div data-dcdn-fs-portal-frametop-title="">
          connected to {peers.length} {peers.length > 1 ? 'peers' : 'peer'}
        </div>
      </div>
      {mode === 'upload' ? (
        <Uploader
          peers={peers}
          selected={selected}
          importPeer={importPeer}
          selectPeer={selectPeer}
          selectedPeers={selectedPeers}
          onUploaded={(result) => {
            console.log(result);
            setContent([result, ...content]);
            setMode('retrieve');
          }}
        />
      ) : (
        <Retriever
          content={content}
          onImportPeer={importPeer}
          workerUrl={workerUrl}
        />
      )}
      <Modal
        isOpen={settings}
        onDismiss={() => setSettings(false)}
        actionTitle="Settings"
        ref={settingsModal}
      >
        <div data-dcdn-settings="">
          <div data-dcdn-options-label="">Client env</div>
          <div data-dcdn-options-row="">
            <div
              data-dcdn-options-btn={
                type === 'service-worker' ? 'active' : 'default'
              }
              onClick={() => setType('service-worker')}
            >
              Service Worker
            </div>
            <div
              data-dcdn-options-btn={
                type === 'cloudflare-worker' ? 'active' : 'default'
              }
              onClick={() => setType('cloudflare-worker')}
            >
              Cloudflare Worker
            </div>
          </div>
          <div data-dcdn-options-label="">Peer identity seed</div>
          <div data-dcdn-options-row="">
            <TextInput
              name="p2pSeed"
              value={p2pSeed}
              onChange={setP2pSeed}
              placeholder="base64 encoded libp2p private key"
            />
          </div>
          <div data-dcdn-options-label="">Filecoin private key</div>
          <div data-dcdn-options-row="">
            <TextInput
              name="filSeed"
              value={filSeed}
              onChange={setFilSeed}
              placeholder="base64 encoded Filecoin private key"
            />
          </div>
          <button
            data-dcdn-btn=""
            onClick={() => settingsModal.current?.dismiss()}
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default FsPortal;
