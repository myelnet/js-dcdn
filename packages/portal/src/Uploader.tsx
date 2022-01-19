import * as React from 'react';
import {useDropzone} from 'react-dropzone';
import type {Peer} from './peers';
import PeerSelecter from './PeerSelecter';
import {humanFileSize} from './utils';
import {ArrowClockwise, Checkmark, Cross, ArrowUp} from './icons';
import Spinner from './Spinner';
import LogoDropzone from './LogoDropzone';
import PillSelector from './PillSelector';

export type Content = {
  hash: string;
  size: number;
  peers: Peer[];
};

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

type UploaderProps = {
  peers: Peer[];
  selectPeer: (id: string) => void;
  selected: {[key: string]: boolean};
  selectedPeers: Peer[];
  importPeer: (addr: string) => void;
  onUploaded: (content: Content) => void;
};

export default function Uploader({
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
