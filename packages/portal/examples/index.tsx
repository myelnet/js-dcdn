import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {useDropzone} from 'react-dropzone';
import {DialogOverlay, DialogContent} from '@reach/dialog';
import {
  Logo,
  LogoDropzone,
  Peer,
  usePeers,
  peerAddr,
  validateAddr,
} from '@dcdn/fs-portal';
import './styles.css';
import '@reach/dialog/styles.css';
import swfile from 'url:@dcdn/service-worker/dist/index.min.js';

function humanFileSize(bytes: number, si = false, dp = 1): string {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = si
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return bytes.toFixed(dp) + ' ' + units[u];
}

type SpinnerProps = {
  small?: boolean;
  xsmall?: boolean;
};

function Spinner({small, xsmall}: SpinnerProps) {
  return (
    <div
      data-dcdn-spinner={small ? 'small' : xsmall ? 'xsmall' : 'large'}
      role="progressbar"
    >
      <svg height="100%" viewBox="0 0 32 32" width="100%">
        <circle
          cx="16"
          cy="16"
          fill="none"
          r="14"
          strokeWidth="4"
          style={{
            stroke: '#000',
            opacity: 0.2,
          }}
        />
        <circle
          cx="16"
          cy="16"
          fill="none"
          r="14"
          strokeWidth="4"
          style={{
            stroke: '#000',
            strokeDasharray: 80,
            strokeDashoffset: 60,
          }}
        />
      </svg>
    </div>
  );
}

type ModalProps = {
  loading?: boolean;
  isOpen: boolean;
  actionTitle: string;
  onDismiss: () => void;
  dismissTitle?: string;
  children: React.ReactNode;
  center?: boolean;
  disableAction?: boolean;
  onlyDismiss?: boolean;
};

interface ModalMethods {
  dismiss: () => void;
}

const Modal = React.forwardRef(function Modal(
  {
    actionTitle,
    loading,
    isOpen,
    center,
    onDismiss,
    children,
    dismissTitle,
    disableAction,
    onlyDismiss,
  }: ModalProps,
  ref
) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => setVisible(isOpen), 10);
    }
  }, [isOpen]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(), 200);
  };

  React.useImperativeHandle(ref, () => ({
    dismiss,
  }));

  return (
    <DialogOverlay
      isOpen={isOpen}
      onDismiss={dismiss}
      style={{
        zIndex: 2994,
        background: visible ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0)',
        backdropFilter: 'blur(20px)',
        transition: 'background 300ms ease',
      }}
    >
      <DialogContent
        style={{
          width: 380,
          height: 380,
          borderRadius: 30,
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
          transform: visible ? 'translateY(25%)' : 'translateY(100%)',
          opacity: visible ? 1 : 0,
          transition: 'transform 300ms ease, opacity 300ms ease',
        }}
        aria-label={actionTitle}
      >
        <div data-dcdn-modal="">
          <div data-dcdn-modal-header="">
            <div data-dcdn-modal-header-title="">{actionTitle}</div>
            <Cross size={24} color="#000" onClick={dismiss} />
          </div>
          {children}
        </div>
      </DialogContent>
    </DialogOverlay>
  );
});

type ControlProps = {
  options: string[];
  value: string;
  onChange: (val: string) => void;
};

function SegmentedControl({options, value, onChange}: ControlProps) {
  const idx = options.indexOf(value);
  return (
    <div data-dcdn-segmented-control="">
      <span
        data-dcdn-segmented-control-highlight=""
        style={{
          transform: 'translateX(' + 94 * idx + 'px)',
        }}
      ></span>

      {options.map((opt, index) => (
        <div data-dcdn-segmented-control-option="" key={opt}>
          <input
            type="radio"
            id={opt}
            name="actions"
            value={opt}
            checked={value === opt}
            onChange={(evt) => onChange(opt)}
          />
          <label htmlFor={opt}>
            <span>{opt}</span>
          </label>
        </div>
      ))}
    </div>
  );
}

type TextInputProps = {
  name: string;
  value: string;
  invalid?: boolean;
  placeholder?: string;
  onChange: (val: string) => void;
};

function TextInput({
  name,
  value,
  placeholder,
  invalid,
  onChange,
}: TextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  return (
    <input
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={handleChange}
      data-dcdn-textinput={invalid ? 'invalid' : ''}
    />
  );
}

export type Content = {
  hash: string;
  size: number;
  peers: Peer[];
};

type ContentNode = {
  name: string;
  hash: string;
  size: number;
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

type FileRowProps = {
  file: File;
};

function FileRow({file}: FileRowProps) {
  return (
    <li data-dcdn-peer-row="">
      <div data-dcdn-peer-row-heading="">{file.name}</div>
      <div data-dcdn-size-value="">{humanFileSize(file.size)}</div>
    </li>
  );
}

type CrossProps = {
  size: number;
  color?: string;
  onClick?: () => void;
};

function Cross({size, color, onClick}: CrossProps) {
  return (
    <svg
      aria-label="Remove"
      role="img"
      height={String(size)}
      viewBox="0 0 16 16"
      width={String(size)}
      fill={color ?? '#FFF'}
      onClick={onClick}
      data-dcdn-cross=""
    >
      <path
        fillRule="evenodd"
        d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
      ></path>
    </svg>
  );
}

type PillSelectorProps = {
  title: string;
  onClick: () => void;
};

function PillSelector({title, onClick}: PillSelectorProps) {
  return (
    <div
      data-dcdn-fs-portal-pill-btn=""
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div data-dcdn-fs-portal-pill-content="">
        <div>{title}</div>
        <div data-dcdn-fs-portal-pill-icon="">
          <Chevron />
        </div>
      </div>
    </div>
  );
}

type PillProps = {
  title?: string;
  onClick?: () => void;
  failed?: boolean;
  success?: boolean;
  pending?: boolean;
};

interface PillProgressMethods {
  progress: (value: number) => void;
}

const PillProgress = React.forwardRef(function Pill(
  {title, onClick, failed, success, pending}: PillProps,
  ref
) {
  const bg = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => ({
    progress: (value: number) => {
      if (bg.current) {
        bg.current.style.transform = `translateX(${value - 100}%)`;
      }
    },
  }));
  return (
    <div data-dcdn-fs-portal-pill="">
      <div
        ref={bg}
        data-dcdn-fs-portal-pill-bg=""
        style={
          failed
            ? {backgroundColor: '#ff0e0e', transform: 'translateX(0%)'}
            : {backgroundColor: '#00ff84', transform: 'translateX(-100%)'}
        }
      ></div>
      <div data-dcdn-fs-portal-pill-content="">
        <div data-dcdn-fs-portal-pill-label="">{title}</div>
        <div data-dcdn-fs-portal-pill-icon="" onClick={onClick}>
          {failed ? (
            <ArrowClockwise />
          ) : success ? (
            <Checkmark />
          ) : pending ? (
            <Spinner xsmall />
          ) : (
            <Cross size={16} />
          )}
        </div>
      </div>
    </div>
  );
});

const peerFromMaddr = (addr: string): Peer => {
  const parts = addr.split('/');
  return {
    id: parts[7],
    name: parts[2],
    location: 'Custom',
  };
};

type PeerSelecterProps = {
  isOpen: boolean;
  onDismiss: () => void;
  onImport: (peer: string) => void;
  onSelect: (id: string) => void;
  selected: {[key: string]: boolean};
  peers: Peer[];
};

function PeerSelecter({
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

type UploaderProps = {
  peers: Peer[];
  selectPeer: (id: string) => void;
  selected: {[key: string]: boolean};
  selectedPeers: Peer[];
  importPeer: (addr: string) => void;
  onUploaded: (content: Content) => void;
};

function Uploader({
  peers,
  selectPeer,
  selected,
  selectedPeers,
  importPeer,
  onUploaded,
}: UploaderProps) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [pOpen, setPOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [states, setStates] = React.useState<{
    [key: string]: 'pending' | 'success' | 'error';
  }>({});

  const progress = React.useRef<{
    [key: string]: PillProgressMethods;
  }>({});
  const onDrop = (fls: File[]) => {
    setFiles(files.concat(fls));
  };
  const {getRootProps, getInputProps, isDragActive} = useDropzone({
    onDrop,
  });

  const upload = (
    p: Peer
  ): Promise<{hash?: string; status: number; peer: Peer}> => {
    setStates({...states, [p.id]: 'pending'});
    return new Promise((resolve, reject) => {
      const url = 'https://' + p.name;
      const body = new FormData();
      files.forEach((file) => {
        body.append('file', file, file.name);
      });

      const req = new XMLHttpRequest();
      req.upload.onprogress = (evt) => {
        const ref = progress.current[p.id];
        if (ref) {
          window.requestAnimationFrame(() => {
            ref.progress((evt.loaded / evt.total) * 100);
          });
        }
      };
      req.onreadystatechange = function () {
        if (this.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
          let result: 'success' | 'pending' | 'error' = 'success';
          if (![200, 201].includes(this.status)) {
            result = 'error';
          }
          setStates({...states, [p.id]: result});
          const headers = this.getAllResponseHeaders();
          const headerMap: {[key: string]: string} = {};
          if (headers) {
            const arr = headers.trim().split(/[\r\n]+/);
            arr.forEach((line: string) => {
              const parts = line.split(': ');
              headerMap[parts[0]] = parts[1];
            });
          }

          resolve({status: this.status, hash: headerMap['ipfs-hash'], peer: p});
        }
      };
      req.onerror = function () {
        setStates({...states, [p.id]: 'error'});
        reject();
      };
      req.open('post', url);
      req.send(body);
    });
  };

  const uploadAll = () => {
    setPending(true);
    Promise.all(selectedPeers.map(upload)).then((results) => {
      const hash = results[0].hash;
      setPending(false);
      if (results.every((res) => [200, 201].includes(res.status)) && hash) {
        setTimeout(
          () => onUploaded({hash, size: 0, peers: results.map((r) => r.peer)}),
          300
        );
      }
    });
  };

  return (
    <>
      <>
        <div data-dcdn-fs-portal-pill-row="">
          {selectedPeers.map((p) => (
            <PillProgress
              key={p.id}
              title={p.location}
              onClick={
                states[p.id] === 'error'
                  ? () => upload(p)
                  : states[p.id] === 'success'
                  ? () => {}
                  : () => selectPeer(p.id)
              }
              ref={(ref: PillProgressMethods) => (progress.current[p.id] = ref)}
              success={states[p.id] === 'success'}
              failed={states[p.id] === 'error'}
              pending={states[p.id] === 'pending'}
            />
          ))}
          {selectedPeers.length !== peers.length && (
            <PillSelector title="Add region" onClick={() => setPOpen(true)} />
          )}
        </div>
        <div data-dcdn-fs-portal-divider="">
          <div data-dcdn-fs-portal-divider-arrow="">
            <ArrowUp />
          </div>
        </div>
      </>
      <div data-dcdn-fs-portal-framescroll="" {...getRootProps()}>
        <input {...getInputProps()} />
        {files.length > 0 && (
          <ul data-dcdn-fs-portal-framescroller="">
            {files.map((f, i) => (
              <FileRow key={f.name + '-' + i} file={f} />
            ))}
          </ul>
        )}
        {(files.length === 0 || isDragActive) && (
          <div data-dcdn-dropzone="">
            <LogoDropzone />
            <div data-dcdn-dropzone-title="">Drag or click to add files</div>
          </div>
        )}
      </div>
      <div data-dcdn-fs-portal-framebottom="">
        <button
          data-dcdn-btn=""
          onClick={uploadAll}
          disabled={files.length === 0 || selectedPeers.length === 0 || pending}
        >
          upload
        </button>
        <p data-dcdn-fineprint="">Uploaded files will be public</p>
      </div>
      <PeerSelecter
        peers={peers}
        selected={selected}
        onDismiss={() => setPOpen(false)}
        isOpen={pOpen}
        onImport={importPeer}
        onSelect={selectPeer}
      />
    </>
  );
}

const WORKER_URL = 'https://client.myel.workers.dev/';

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
  const toggleTree = () => {
    if (!tOpen && children.length === 0) {
      setPending(true);
      fetch(workerUrl + hash + '?peer=' + peerAddr(peer), {
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
                  href={
                    workerUrl +
                    '/' +
                    hash +
                    '/' +
                    child.name +
                    '?peer=' +
                    peerAddr(peer)
                  }
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

function Retriever({content, onImportPeer, workerUrl}: RetrieverProps) {
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

function FsPortal() {
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
        .register(swfile)
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

  const workerUrl = type === 'service-worker' ? '/' : WORKER_URL;
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

const app = document.getElementById('app');
ReactDOM.render(<FsPortal />, app);

function ArrowUp() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
    >
      <path
        d="M14 22.0039C14.5713 22.0039 14.9756 21.5996 14.9756 21.0195V10.165L14.9053 8.2666L17.1816 10.8066L19.1855 12.793C19.3613 12.9688 19.6074 13.083 19.8799 13.083C20.416 13.083 20.8203 12.6787 20.8203 12.125C20.8203 11.8701 20.7236 11.6328 20.5127 11.4219L14.7207 5.62109C14.5273 5.41895 14.2637 5.31348 14 5.31348C13.7275 5.31348 13.4639 5.41895 13.2705 5.62109L7.4873 11.4219C7.27637 11.6328 7.17969 11.8701 7.17969 12.125C7.17969 12.6787 7.5752 13.083 8.11133 13.083C8.39258 13.083 8.63867 12.9688 8.81445 12.793L10.8096 10.8066L13.0947 8.25781L13.0156 10.165V21.0195C13.0156 21.5996 13.4199 22.0039 14 22.0039Z"
        fill="#B2B1AD"
      />
    </svg>
  );
}

type ChevronProps = {
  direction?: string;
  size?: string;
};

function Chevron({direction, size}: ChevronProps) {
  const width = size === 'small' ? '12' : '14';
  const height = size === 'small' ? '6' : '8';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 16 10"
      fill="none"
      transform={direction === 'right' ? 'rotate(-90)' : ''}
    >
      <path
        d="M8 9.48828C8.30762 9.47949 8.58887 9.36523 8.81738 9.11914L15.4971 2.28125C15.6904 2.08789 15.7959 1.8418 15.7959 1.55176C15.7959 0.97168 15.3389 0.505859 14.7588 0.505859C14.4775 0.505859 14.2051 0.620117 14.0029 0.822266L8.00879 6.9834L1.99707 0.822266C1.79492 0.628906 1.53125 0.505859 1.24121 0.505859C0.661133 0.505859 0.204102 0.97168 0.204102 1.55176C0.204102 1.8418 0.30957 2.08789 0.50293 2.28125L7.19141 9.11914C7.42871 9.36523 7.69238 9.48828 8 9.48828Z"
        fill="#1C1C1E"
      />
    </svg>
  );
}

function ArrowClockwise() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="26"
      viewBox="0 0 16 20"
      fill="none"
    >
      <path
        d="M7.74512 9.09863C8 9.09863 8.20215 9.01953 8.36035 8.85254L11.9639 5.22266C12.1572 5.0293 12.2451 4.81836 12.2451 4.57227C12.2451 4.33496 12.1484 4.10645 11.9639 3.93066L8.36035 0.265625C8.20215 0.0898438 8 0.00195312 7.74512 0.00195312C7.27051 0.00195312 6.89258 0.397461 6.89258 0.880859C6.89258 1.11816 6.98047 1.31152 7.12988 1.47852L9.23047 3.53516C8.81738 3.47363 8.39551 3.43848 7.97363 3.43848C3.62305 3.43848 0.142578 6.91895 0.142578 11.2783C0.142578 15.6377 3.64941 19.1445 8 19.1445C12.3594 19.1445 15.8574 15.6377 15.8574 11.2783C15.8574 10.751 15.4883 10.373 14.9609 10.373C14.4512 10.373 14.1084 10.751 14.1084 11.2783C14.1084 14.6709 11.3926 17.3955 8 17.3955C4.61621 17.3955 1.8916 14.6709 1.8916 11.2783C1.8916 7.85938 4.58984 5.15234 7.97363 5.15234C8.54492 5.15234 9.07227 5.19629 9.53809 5.27539L7.13867 7.64844C6.98047 7.80664 6.89258 8 6.89258 8.2373C6.89258 8.7207 7.27051 9.09863 7.74512 9.09863Z"
        fill="#FFF"
      />
    </svg>
  );
}

function Checkmark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="11"
      viewBox="0 0 68 67"
      fill="none"
    >
      <path
        d="M26.1748 66.1211C28.0628 66.1211 29.5602 65.291 30.667 63.6309L66.2627 7.33202C66.6859 6.68102 66.9788 6.09508 67.1416 5.57421C67.3044 5.05341 67.3858 4.53258 67.3858 4.01171C67.3858 2.80731 67.0195 1.83888 66.2871 1.10641C65.5547 0.374015 64.5863 0.0078125 63.3819 0.0078125C62.5029 0.0078125 61.7868 0.178715 61.2334 0.520515C60.68 0.862315 60.1266 1.45638 59.5733 2.30271L25.9795 56.209L8.30368 32.3809C7.26201 30.9486 5.99248 30.2324 4.49508 30.2324C3.25814 30.2324 2.24904 30.6149 1.46778 31.3799C0.686525 32.1449 0.295898 33.1458 0.295898 34.3828C0.295898 34.9037 0.401692 35.4326 0.613278 35.9697C0.824878 36.5068 1.14228 37.0521 1.56548 37.6055L21.5362 63.5332C22.8708 65.2585 24.417 66.1211 26.1748 66.1211Z"
        fill="#FFF"
      />
    </svg>
  );
}

function Gearshape() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 84 84"
      fill="none"
    >
      <path
        d="M37.9673 83.0059H45.6822C47.2446 83.0059 48.5955 82.5664 49.7349 81.6875C50.8742 80.8086 51.6229 79.6368 51.981 78.1719L53.5923 71.1406L54.4712 70.8477L60.5259 74.6075C61.8279 75.4213 63.2033 75.7305 64.6519 75.5352C66.1004 75.3399 67.3618 74.6888 68.4361 73.5821L73.8072 68.2598C74.9139 67.153 75.5568 65.8835 75.7359 64.4512C75.9149 63.0189 75.5975 61.668 74.7837 60.3984L70.9751 54.2949L71.2681 53.5625L78.2993 51.9512C79.7641 51.5606 80.9442 50.7956 81.8394 49.6562C82.7346 48.517 83.1822 47.1823 83.1822 45.6523V38.1328C83.1822 36.6029 82.7427 35.2601 81.8638 34.1045C80.9848 32.9489 79.7967 32.1921 78.2993 31.834L71.3657 30.125L71.024 29.3438L74.8325 23.2402C75.6463 21.9707 75.9637 20.6198 75.7847 19.1875C75.6056 17.7553 74.9627 16.4695 73.856 15.3301L68.4849 10.0078C67.4107 8.90109 66.1574 8.2582 64.7251 8.07913C63.2928 7.90007 61.9256 8.20116 60.6236 8.98243L54.52 12.6934L53.5923 12.3516L51.981 5.32033C51.6229 3.85546 50.8742 2.6836 49.7349 1.80473C48.5955 0.9258 47.2446 0.486328 45.6822 0.486328H37.9673C36.4048 0.486328 35.062 0.9258 33.939 1.80473C32.8159 2.6836 32.0753 3.85546 31.7173 5.32033L30.106 12.3516L29.1294 12.6934L23.0259 8.98243C21.7238 8.20116 20.3648 7.90007 18.9488 8.07913C17.5327 8.2582 16.2713 8.90109 15.1646 10.0078L9.84227 15.3301C8.73554 16.4695 8.09264 17.7553 7.91357 19.1875C7.73451 20.6198 8.05187 21.9707 8.86567 23.2402L12.6255 29.3438L12.2837 30.125L5.35007 31.834C3.88525 32.1921 2.71338 32.9489 1.83447 34.1045C0.955566 35.2601 0.516113 36.6029 0.516113 38.1328V45.6523C0.516113 47.1823 0.963703 48.517 1.85888 49.6562C2.75406 50.7956 3.91779 51.5606 5.35007 51.9512L12.3814 53.5625L12.6743 54.2949L8.91457 60.3984C8.06817 61.668 7.74264 63.0189 7.93797 64.4512C8.13331 65.8835 8.78434 67.153 9.89107 68.2598L15.2134 73.5821C16.3202 74.6888 17.5897 75.3399 19.022 75.5352C20.4542 75.7305 21.8214 75.4213 23.1236 74.6075L29.2271 70.8477L30.106 71.1406L31.7173 78.1719C32.0753 79.6368 32.8159 80.8086 33.939 81.6875C35.062 82.5664 36.4048 83.0059 37.9673 83.0059ZM38.6509 76.2188C38.1951 76.2188 37.9347 76.0072 37.8697 75.584L35.4771 66.0137C34.2401 65.6882 33.0682 65.2976 31.9614 64.8418C30.8546 64.3861 29.8781 63.8653 29.0318 63.2793L20.5845 68.5039C20.2589 68.7318 19.9171 68.683 19.5591 68.3575L15.1646 63.9141C14.839 63.6537 14.8065 63.3119 15.0669 62.8887L20.1939 54.4902C19.7381 53.6764 19.2661 52.7162 18.7779 51.6094C18.2895 50.5026 17.8826 49.3308 17.5572 48.0938L7.93797 45.75C7.51477 45.7175 7.30317 45.4571 7.30317 44.9688V38.7188C7.30317 38.2631 7.51477 37.9864 7.93797 37.8887L17.5083 35.5938C17.8338 34.2592 18.257 33.0222 18.7779 31.8828C19.2987 30.7435 19.7381 29.8158 20.0962 29.0996L15.0181 20.75C14.7577 20.3268 14.7739 19.9525 15.0669 19.627L19.5103 15.2812C19.8358 14.9883 20.1939 14.9395 20.5845 15.1348L28.9341 20.2129C29.7804 19.6921 30.7895 19.1875 31.9614 18.6992C33.1333 18.211 34.3215 17.8041 35.5259 17.4785L37.8697 7.90823C37.9347 7.48503 38.1951 7.27343 38.6509 7.27343H45.0474C45.5031 7.27343 45.7635 7.48503 45.8286 7.90823L48.1724 17.5762C49.4419 17.9018 50.6219 18.3005 51.7124 18.7725C52.8029 19.2445 53.7876 19.7409 54.6665 20.2617L63.1138 15.1348C63.5044 14.9395 63.8624 14.9883 64.188 15.2812L68.6314 19.627C68.9243 19.9525 68.9406 20.3268 68.6802 20.75L63.5532 29.0996C63.9113 29.8158 64.3589 30.7435 64.896 31.8828C65.4331 33.0222 65.8481 34.2592 66.1411 35.5938L75.7603 37.8887C76.1509 37.9864 76.3462 38.2631 76.3462 38.7188V44.9688C76.3462 45.4571 76.1509 45.7175 75.7603 45.75L66.0923 48.0938C65.7993 49.3308 65.4087 50.5026 64.9204 51.6094C64.4321 52.7162 63.9438 53.6764 63.4556 54.4902L68.6314 62.8887C68.8592 63.3119 68.8267 63.6537 68.5337 63.9141L64.1392 68.3575C63.7811 68.683 63.4393 68.7318 63.1138 68.5039L54.6177 63.2793C53.7713 63.8653 52.8029 64.3861 51.7124 64.8418C50.6219 65.2976 49.4419 65.6882 48.1724 66.0137L45.8286 75.584C45.7635 76.0072 45.5031 76.2188 45.0474 76.2188H38.6509ZM41.8247 56.3457C44.4939 56.3457 46.9354 55.6866 49.149 54.3682C51.3625 53.0498 53.1284 51.2839 54.4468 49.0703C55.7651 46.8568 56.4243 44.4154 56.4243 41.7461C56.4243 39.0769 55.7651 36.6517 54.4468 34.4707C53.1284 32.2897 51.3625 30.5401 49.149 29.2217C46.9354 27.9033 44.4939 27.2441 41.8247 27.2441C39.1554 27.2441 36.7221 27.9033 34.5249 29.2217C32.3276 30.5401 30.5617 32.2897 29.2271 34.4707C27.8924 36.6517 27.2251 39.0769 27.2251 41.7461C27.2251 44.4154 27.8924 46.8568 29.2271 49.0703C30.5617 51.2839 32.3276 53.0498 34.5249 54.3682C36.7221 55.6866 39.1554 56.3457 41.8247 56.3457ZM41.8247 49.6074C40.3924 49.6074 39.0903 49.2494 37.9185 48.5332C36.7466 47.8171 35.8107 46.865 35.1109 45.6768C34.411 44.4886 34.0611 43.1784 34.0611 41.7461C34.0611 40.3464 34.411 39.0525 35.1109 37.8643C35.8107 36.6761 36.7466 35.7321 37.9185 35.0322C39.0903 34.3324 40.3924 33.9824 41.8247 33.9824C43.2244 33.9824 44.5102 34.3324 45.6822 35.0322C46.854 35.7321 47.7899 36.6761 48.4898 37.8643C49.1896 39.0525 49.5396 40.3464 49.5396 41.7461C49.5396 43.1784 49.1896 44.4886 48.4898 45.6768C47.7899 46.865 46.854 47.8171 45.6822 48.5332C44.5102 49.2494 43.2244 49.6074 41.8247 49.6074Z"
        fill="black"
      />
    </svg>
  );
}

function CloudDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="21"
      viewBox="0 0 24 21"
      fill="none"
    >
      <path
        d="M14.6631 13.4424V15.2002H18.7852C21.5449 15.2002 23.2324 13.5654 23.2324 11.333C23.2324 9.46973 22.1689 7.9668 20.4199 7.27246C20.4287 3.2998 17.5635 0.43457 13.8809 0.43457C11.543 0.43457 9.78516 1.63867 8.68652 3.22949C6.58594 2.71094 4.10742 4.30176 4.01953 6.78027C2.00684 7.12305 0.767578 8.79297 0.767578 10.9199C0.767578 13.2842 2.56934 15.2002 5.49609 15.2002H9.30176V13.4424H5.49609C3.58008 13.4424 2.54297 12.2998 2.54297 10.8848C2.54297 9.24121 3.62402 8.08984 5.41699 8.08984C5.54883 8.08984 5.60156 8.01953 5.59277 7.89648C5.54004 5.27734 7.41211 4.43359 9.30176 4.9873C9.41602 5.01367 9.48633 4.99609 9.53906 4.89941C10.3828 3.36133 11.6924 2.18359 13.8721 2.18359C16.6318 2.18359 18.6006 4.37207 18.7324 6.92969C18.7588 7.39551 18.7236 7.91406 18.6885 8.33594C18.6709 8.45898 18.7236 8.5293 18.8379 8.54688C20.4463 8.85449 21.457 9.78613 21.457 11.2539C21.457 12.5371 20.5605 13.4424 18.75 13.4424H14.6631ZM11.9824 20.5791C12.2021 20.5791 12.3867 20.5 12.6064 20.2979L15.5596 17.5205C15.7178 17.3799 15.7969 17.2129 15.7969 17.002C15.7969 16.5889 15.4629 16.29 15.0586 16.29C14.8564 16.29 14.6543 16.3779 14.5049 16.5361L13.2832 17.7666L12.7207 18.417L12.8086 17.1162V9.5752C12.8086 9.14453 12.4395 8.7666 11.9824 8.7666C11.5342 8.7666 11.1562 9.14453 11.1562 9.5752V17.1162L11.2529 18.417L10.6816 17.7666L9.45996 16.5361C9.31055 16.3779 9.1084 16.29 8.90625 16.29C8.50195 16.29 8.17676 16.5889 8.17676 17.002C8.17676 17.2129 8.24707 17.3799 8.40527 17.5205L11.3584 20.2979C11.5781 20.5 11.7715 20.5791 11.9824 20.5791Z"
        fill="#1C1C1E"
      />
    </svg>
  );
}
