import * as React from 'react';
import {useDropzone} from 'react-dropzone';
import Logo from './Logo';
import LogoDropzone from './LogoDropzone';
import {Peer, usePeers} from './peers';

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

export type Content = {
  hash: string;
  size: number;
  peer: string;
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
    <li data-dcdn-peer-row="">
      <div data-dcdn-peer-row-heading="">
        <div>Peer {id.slice(-16)}</div>
        <div>
          {location} <span data-dcdn-fineprint="">({latency ?? 0}s)</span>
        </div>
      </div>
      {onSelect && (
        <div data-dcdn-empty-check="" onClick={() => onSelect(id)}>
          {selected && <span data-dcdn-full-check="">✅</span>}
        </div>
      )}
    </li>
  );
}

type UploaderProps = {};

function Uploader(props: UploaderProps) {
  const {peers, selectPeer, selected} = usePeers({ping: false});

  const onDrop = (files: File[]) => {};
  const {open, getRootProps, getInputProps, isDragActive} = useDropzone({
    onDrop,
  });

  return (
    <>
      <div data-dcdn-fs-portal-framescroll="" {...getRootProps()}>
        <input {...getInputProps()} />
        <ul data-dcdn-fs-portal-framescroller="">
          {peers.map((p: Peer) => (
            <PeerRow
              key={p.id}
              {...p}
              selected={selected[p.id]}
              onSelect={selectPeer}
            />
          ))}
        </ul>
        {isDragActive && (
          <div data-dcdn-dropzone="">
            <LogoDropzone />
          </div>
        )}
      </div>
      <button data-dcdn-btn="" onClick={open}>
        upload a file
      </button>
      <p data-dcdn-fineprint="">Uploaded files will be public</p>
    </>
  );
}

function Retriever() {
  return null;
}

function FsPortal() {
  const [mode, setMode] = React.useState('upload');
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
          <div data-dcdn-fs-portal-frametop-head-corner=""></div>
        </div>
      </div>
      {mode === 'upload' ? <Uploader /> : <Retriever />}
    </div>
  );
}

export default FsPortal;
