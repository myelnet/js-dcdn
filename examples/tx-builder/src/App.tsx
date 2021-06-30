import React, {
  useState,
  Suspense,
  useRef,
  memo,
  useImperativeHandle,
} from 'react';
import {atom, selectorFamily, useRecoilState, useRecoilValue} from 'recoil';
import {useDropzone} from 'react-dropzone';
import {useDrag} from 'react-use-gesture';
import styles from './App.module.css';
import MyelIcon from './MyelIcon';
import Caret from './Caret';
import Clipboard from './Clipboard';
import Download from './Download';
import Spinner from './Spinner';
import {Tx, Entry, LoadResult} from 'myel-http-client';
import {ErrorBoundary, FallbackProps} from 'react-error-boundary';
import statusCopy from './statusCopy';

// eslint-disable-next-line
const imageReg = /[\/.](gif|jpg|jpeg|tiff|png)$/i;

type Input = {
  type: string;
  id: string;
  value: string | File;
};

const stagedInputs = atom<Input[]>({
  key: 'StagedInputs',
  default: [],
});

const keyName = atom({
  key: 'KeyName',
  default: '',
});

const inputType = atom({
  key: 'InputType',
  default: 'string',
});

const gatewayEndpoint = atom({
  key: 'GatewayEndpoint',
  default: 'https://myel.cloud',
});

type DeleteProps = {
  onDelete: () => void;
};

// Delete is a simple CSS based cross delete button
function Delete({onDelete}: DeleteProps) {
  return <div className={styles.delete} onClick={onDelete} />;
}

type RowProps = {
  id: string;
  isFirst: boolean;
  isLast: boolean;
  children?: React.ReactNode;
};

type StringRowProps = RowProps &
  DeleteProps & {
    value: string;
    onChange: (val: string) => void;
    deletable?: boolean;
  };

// Row associates a label with some children in a horizontal fashion
function Row({id, isFirst, isLast, children}: RowProps) {
  return (
    <div
      className={[
        styles.ctrlRow,
        isFirst ? styles.topCtrlRow : '',
        isLast ? styles.bottomCtrlRow : '',
        styles.middleCtrlRow,
      ].join(' ')}>
      <div className={styles.label}>
        <label htmlFor={id}>{id}</label>
      </div>
      {children}
    </div>
  );
}

// StringRow is horizontal string input, which features a delete action
// the delete action can be disabled with the deletable prop
// `id` is used as the label of the field and `isFirst` and `isLast` props
// determine the spacing at the top and bottom when groupped with other fields.
function StringRow({
  id,
  isFirst,
  isLast,
  value,
  onChange,
  onDelete,
  deletable,
}: StringRowProps) {
  return (
    <Row id={id} isFirst={isFirst} isLast={isLast}>
      <div
        className={[
          styles.stringItems,
          deletable ? styles.stringItemsDeletable : '',
        ].join(' ')}>
        <div className={styles.input}>
          <input
            id={id}
            type="text"
            value={value}
            autoComplete="off"
            spellCheck="false"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {deletable && <Delete onDelete={onDelete} />}
      </div>
    </Row>
  );
}

type FileRowProps = RowProps &
  DeleteProps & {
    value: File;
    onChange: (val: File) => void;
  };

// FileRow is a horizontal file input featuring a preview for image files
// as well as a delete action. `id` is the label prop and `isFirst` and `isLast` can
// be used to tune the spacing when groupping with other row fields.
const FileRow = memo(function ({
  id,
  isFirst,
  isLast,
  value,
  onChange,
  onDelete,
}: FileRowProps) {
  const onDrop = (files: File[]) => {
    if (files.length) onChange(files[0]);
  };
  const {getRootProps, getInputProps} = useDropzone({
    maxFiles: 1,
    onDrop,
  });
  const getUrl = (f: File): string | undefined => {
    try {
      return URL.createObjectURL(f);
    } catch (e) {
      return '/FileIcon.svg';
    }
  };
  return (
    <Row id={id} isFirst={isFirst} isLast={isLast}>
      <div className={styles.fileItems}>
        <div
          className={styles.imgPreview}
          style={
            value
              ? imageReg.test(value.name)
                ? {backgroundImage: `url(${getUrl(value)})`}
                : {backgroundColor: '#dbdbdb'}
              : undefined
          }
        />
        <div {...(getRootProps({className: styles.input}) as any)}>
          <input {...getInputProps()} />
          <div className={styles.instructions}>
            {value ? value.name : 'click or drop'}
          </div>
        </div>
        <Delete onDelete={onDelete} />
      </div>
    </Row>
  );
});

const range = (v: number, min: number, max: number) => {
  if (max === min) return 0;
  return (v - min) / (max - min);
};
const invertedRange = (p: number, min: number, max: number) =>
  p * (max - min) + min;

const sanitizeStep = (
  v: number,
  {step, initialValue}: {step: number; initialValue: number}
) => {
  const steps = Math.round((v - initialValue) / step);
  return initialValue + steps * step!;
};

type SliderRowProps = RowProps & {
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  unit: string;
};

// SliderRow allows for chosing a numeric value either by setting it in the text input
// or by sliding a range input controller.
function SliderRow({
  id,
  isLast,
  isFirst,
  value,
  onChange,
  min,
  max,
  unit,
}: SliderRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const rangeWidth = useRef<number>(0);
  const scrubberWidth = '8px';
  const bind = useDrag(({event, first, xy: [x], movement: [mx], memo}) => {
    if (first) {
      // rangeWidth is the width of the slider el minus the width of the scrubber el itself
      const {width, left} = ref.current!.getBoundingClientRect();
      rangeWidth.current = width - parseFloat(scrubberWidth);

      const targetIsScrub = event?.target === scrubberRef.current;
      // memo is the value where the user clicked on
      memo = targetIsScrub
        ? value
        : invertedRange((x - left) / width, min, max);
    }
    const newValue =
      memo + invertedRange(mx / rangeWidth.current, 0, max - min);
    onChange(sanitizeStep(newValue, {step: 1, initialValue: 0}));
    return memo;
  });
  const pos = range(value, min, max);
  return (
    <Row id={id} isFirst={isFirst} isLast={isLast}>
      <div className={styles.sliderItems}>
        <div className={styles.rangeWrapper} ref={ref} {...bind()}>
          <div className={styles.range}>
            <div
              className={styles.indicator}
              style={{left: 0, right: `${(1 - pos) * 100}%`}}
            />
          </div>
          <div
            className={styles.scrubber}
            ref={scrubberRef}
            style={{left: `calc(${pos} * (100% - ${scrubberWidth}))`}}
          />
        </div>
        <div className={styles.input}>
          <input
            id={id}
            type="text"
            value={value + unit}
            autoComplete="off"
            spellCheck="false"
            onChange={(e) => onChange(Number(e.target.value.split(unit)[0]))}
          />
        </div>
      </div>
    </Row>
  );
}

type UploadModuleProps = {
  onCommit: (entries: Input[]) => Promise<void>;
};

// UploadModule combines a custom number of put operations into a transaction
// and commits it to be cached on a Myel node. It collects all the inputs and commits them
// then when finished triggers the onCommit callback with the root CID of the transaction.
// The state of the module is then reset to allow creating the next transaction.
function UploadModule({onCommit}: UploadModuleProps) {
  const [inputs, setInputs] = useRecoilState(stagedInputs);
  const [key, setKey] = useRecoilState(keyName);
  const [type, setInputType] = useRecoilState(inputType);

  const [pending, setPending] = useState(false);

  const canCommit = inputs.length > 0 && inputs.every((si) => si.value);

  const commit = async () => {
    setPending(true);
    await onCommit(inputs);
    setPending(false);
    setInputs([]);
  };
  return (
    <div className={styles.module}>
      <div className={styles.titleBar}>
        <div className={styles.titleAccessory}>
          <MyelIcon />
        </div>
        <div className={styles.titleLogo}>
          <div className={styles.titleBarTitle}>Upload</div>
        </div>
        <div className={styles.titleAccessory} />
      </div>
      <div className={styles.panel}>
        <div className={styles.ctrlContainer}>
          {inputs.map((input, i) => {
            const isFirst = i === 0;
            switch (input.type) {
              case 'string':
                return (
                  <StringRow
                    id={input.id}
                    key={input.id}
                    isFirst={isFirst}
                    isLast={false}
                    value={input.value as string}
                    onChange={(v) => {
                      const nextInput = {
                        ...input,
                        value: v,
                      };
                      setInputs([
                        ...inputs.slice(0, i),
                        nextInput,
                        ...inputs.slice(i + 1),
                      ]);
                    }}
                    onDelete={() =>
                      setInputs(inputs.slice(0, i).concat(inputs.slice(i + 1)))
                    }
                    deletable
                  />
                );
              case 'file':
                return (
                  <FileRow
                    id={input.id}
                    key={input.id}
                    isFirst={isFirst}
                    isLast={false}
                    value={input.value as File}
                    onChange={(v) => {
                      const nextInput = {
                        ...input,
                        value: v,
                      };
                      setInputs([
                        ...inputs.slice(0, i),
                        nextInput,
                        ...inputs.slice(i + 1),
                      ]);
                    }}
                    onDelete={() =>
                      setInputs(inputs.slice(0, i).concat(inputs.slice(i + 1)))
                    }
                  />
                );
              default:
                return null;
            }
          })}
          <div className={styles.inputRow}>
            <div className={styles.bbLeft}>
              <div className={[styles.input, styles.keyInput].join(' ')}>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="key"
                />
              </div>
            </div>
            <div className={styles.bbCenter}>
              <div className={styles.select}>
                <select
                  value={type}
                  onChange={(e) => setInputType(e.target.value)}>
                  <option value="string">string</option>
                  <option value="file">file</option>
                </select>
                <span>{type}</span>
                <Caret />
              </div>
            </div>
            <div className={styles.bbRight}>
              <button
                className={[styles.btn, key ? '' : styles.btnDisabled].join(
                  ' '
                )}
                disabled={!key}
                onClick={() => {
                  setInputs(
                    inputs.concat([
                      {
                        id: key,
                        type: type,
                        value: '',
                      },
                    ])
                  );
                  setKey('');
                }}>
                Put
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.submitRow}>
        <button
          className={[styles.btn, canCommit ? '' : styles.btnDisabled].join(
            ' '
          )}
          disabled={!canCommit}
          onClick={commit}>
          {pending ? <Spinner /> : 'Commit'}
        </button>
      </div>
    </div>
  );
}

type ProgressProps = {};

type ProgressHandle = {
  updateProgress: (value: number, msg: string) => void;
};

const Progress: React.RefForwardingComponent<ProgressHandle, ProgressProps> = (
  props,
  ref
) => {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    updateProgress: (value: number, msg: string) => {
      indicatorRef.current!.style.right = `${(1 - value) * 100}%`;
      msgRef.current!.innerText = msg;
    },
  }));
  return (
    <div className={styles.progressWrapper}>
      <div className={styles.progressMsg} ref={msgRef} />
      <div className={styles.progressRange}>
        <div
          ref={indicatorRef}
          className={styles.progressIndicator}
          style={{left: 0}}
        />
      </div>
    </div>
  );
};

const ProgressComponent = React.forwardRef(Progress);

type DownloadModuleProps = {
  onDownload: (root: string) => void;
};

// DownloadModule features a simple input for a root CID, it then sends the root up
// into the onDownload callback. When triggering the retrieval operation, it provides feedback
// on this operation until successful or failed.
function DownloadModule({onDownload}: DownloadModuleProps) {
  const endpoint = useRecoilValue(gatewayEndpoint);
  const [root, setRoot] = useState('');
  const canRetrieve = !!root;
  const [price, setPrice] = useState(0);

  const [pending, setPending] = useState(false);
  const size = useRef<number>(1);
  const tx = useRef<Tx | null>(null);

  const progress = useRef<React.ElementRef<typeof ProgressComponent>>(null);

  const onProgress = (result: LoadResult) => {
    if (result.status === 'StatusSelectedOffer') {
      size.current = result.size;
    }
    if (progress.current) {
      progress.current.updateProgress(
        result.totalReceived / size.current,
        statusCopy[result.status]
      );
    }
    if (result.status === 'DealStatusCompleted') {
      setPending(false);
      onDownload(root);
      setRoot('');
      setPrice(0);
    }
  };
  const retrieve = async () => {
    setPending(true);
    try {
      tx.current = new Tx({gateway: endpoint, maxPPB: price});
      await tx.current.load(root, onProgress);
    } catch (e) {
      console.log(e);
    }
  };
  return (
    <div className={styles.module}>
      <div className={styles.titleBar}>
        <div className={styles.titleAccessory}>
          <MyelIcon />
        </div>
        <div className={styles.titleLogo}>
          <div className={styles.titleBarTitle}>Download</div>
        </div>
        <div className={styles.titleAccessory} />
      </div>
      <div className={styles.panel}>
        <div className={styles.ctrlContainer}>
          <div className={styles.inputRow}>
            <div className={styles.bbLeft}>
              <div className={[styles.input, styles.keyInput].join(' ')}>
                <input
                  id="rootCID"
                  type="text"
                  value={root}
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="root CID"
                  onChange={(e) => setRoot(e.target.value)}
                />
              </div>
            </div>
          </div>
          <SliderRow
            id="price/byte"
            value={price}
            onChange={(val) => setPrice(val)}
            min={0}
            max={10}
            isFirst={false}
            isLast={true}
            unit="aFIL"
          />
        </div>
      </div>
      <div className={styles.submitRow}>
        {pending ? (
          <ProgressComponent ref={progress} />
        ) : (
          <button
            className={[styles.btn, canRetrieve ? '' : styles.btnDisabled].join(
              ' '
            )}
            disabled={!canRetrieve}
            onClick={retrieve}>
            Retrieve
          </button>
        )}
      </div>
    </div>
  );
}

type ValueDisplayProps = {
  root: string;
  name: string;
  value: string;
  load?: boolean;
};

const txValue = selectorFamily<string, ValueDisplayProps>({
  key: 'TxValue',
  get:
    (props) =>
    async ({get}) => {
      if (!props.load || props.name.includes('.')) {
        return '';
      }
      const endpoint = get(gatewayEndpoint);
      const value = await fetch(
        endpoint + '/' + props.root + '/' + props.name
      ).then((res) => res.text());
      return value;
    },
});

function ValueDisplay(props: ValueDisplayProps) {
  const {root} = props;
  const [load, setLoad] = useState(false);
  const endpoint = useRecoilValue(gatewayEndpoint);
  const value = useRecoilValue(txValue({...props, load}));
  return load ? (
    imageReg.test(value) ? (
      <div
        className={styles.imgPreview}
        style={{
          backgroundImage: `url(${endpoint}/${root}/${value})`,
        }}
      />
    ) : (
      <div className={[styles.input, styles.inputImmut].join(' ')}>{value}</div>
    )
  ) : (
    <div
      className={[styles.stringItems, styles.stringItemsDeletable].join(' ')}>
      <div className={[styles.input, styles.inputImmut].join(' ')}>
        {shortenCid(props.value)}
      </div>
      <div className={styles.download} onClick={() => setLoad(true)}>
        <Download />
      </div>
    </div>
  );
}

const txEntries = selectorFamily<Entry[], string>({
  key: 'TxEntries',
  get:
    (root) =>
    async ({get}) => {
      const endpoint = get(gatewayEndpoint);
      const entries = await new Tx({gateway: endpoint, root}).getEntries();
      return entries.filter((entry) => !entry.key.includes('.'));
    },
});

const shortenCid = (cid: string): string => {
  return cid.slice(0, 6) + '...' + cid.slice(-7);
};

type FrozenTxProps = {
  cid: string;
};

function FrozenTxModule({cid}: FrozenTxProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cid);
      setCopied(true);
    } catch {}
  };
  return (
    <div className={styles.module}>
      <div className={styles.titleBar}>
        <div
          className={[styles.titleAccessory, open ? styles.caretOpen : ''].join(
            ' '
          )}
          onClick={() => setOpen(!open)}>
          <Caret />
        </div>
        <div className={styles.titleLogo}>
          <div className={styles.titleBarTitle}>{shortenCid(cid)}</div>
        </div>
        <div
          className={[styles.titleAccessory, styles.copy].join(' ')}
          onClick={handleCopy}
          onMouseLeave={() => setCopied(false)}>
          <Clipboard copied={copied} />
        </div>
      </div>
      <div className={styles.panel}>
        {open && (
          <ErrorBoundary FallbackComponent={TxEntriesListFallback}>
            <Suspense fallback={null}>
              <TxEntriesList cid={cid} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

function TxEntriesListFallback({error, resetErrorBoundary}: FallbackProps) {
  return (
    <Row id="error" isFirst isLast>
      <button className={styles.btn} onClick={resetErrorBoundary}>
        Try again
      </button>
    </Row>
  );
}

function TxEntriesList({cid}: FrozenTxProps) {
  const entries = useRecoilValue(txEntries(cid));
  return (
    <div className={styles.ctrlContainer}>
      {entries.map((entry, i) => (
        <Row
          id={entry.key}
          key={entry.key}
          isFirst={i === 0}
          isLast={i === entries.length - 1}>
          <Suspense fallback={<Spinner />}>
            <ValueDisplay root={cid} name={entry.key} value={entry.value} />
          </Suspense>
        </Row>
      ))}
    </div>
  );
}

function NodeSettingsModule() {
  const [endpoint, setEndpoint] = useRecoilState(gatewayEndpoint);
  const [stagedep, setStagedep] = useState(endpoint);

  const canUpdate = stagedep !== endpoint;
  return (
    <div className={styles.module}>
      <div className={styles.titleBar}>
        <div className={styles.titleAccessory}>
          <MyelIcon />
        </div>
        <div className={styles.titleLogo}>
          <div className={styles.titleBarTitle}>Settings</div>
        </div>
        <div className={styles.titleAccessory} />
      </div>
      <div className={styles.panel}>
        <div className={styles.ctrlContainer}>
          <StringRow
            id="address"
            isFirst
            isLast
            value={stagedep}
            onChange={(v) => {
              setStagedep(v);
            }}
            onDelete={() => {}}
          />
        </div>
      </div>
      <div className={styles.submitRow}>
        <button
          className={[styles.btn, canUpdate ? '' : styles.btnDisabled].join(
            ' '
          )}
          disabled={!canUpdate}
          onClick={() => setEndpoint(stagedep)}>
          Update
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [txs, setTxs] = useState<string[]>([]);
  const [dltxs, setDltxs] = useState<string[]>([]);
  const endpoint = useRecoilValue(gatewayEndpoint);

  const handleCommit = async (entries: Input[]) => {
    const tx = new Tx({gateway: endpoint});

    entries.forEach((entry) => {
      if (entry.value instanceof File) {
        tx.put(entry.value.name, entry.value);
        tx.put(entry.id, entry.value.name);
      } else {
        tx.put(entry.id, entry.value);
      }
    });

    try {
      const root = await tx.commit();
      setTxs([...txs, root]);
    } catch (e) {
      console.log(e);
    }
  };
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.col}>
          <NodeSettingsModule />
        </div>
        <div className={styles.col}>
          <UploadModule onCommit={handleCommit} />
          {txs.map((tx) => (
            <FrozenTxModule key={tx} cid={tx} />
          ))}
        </div>
        <div className={styles.col}>
          <DownloadModule onDownload={(root) => setDltxs([...dltxs, root])} />
          {dltxs.map((tx) => (
            <FrozenTxModule key={tx} cid={tx} />
          ))}
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://myel.network"
          target="_blank"
          rel="noopener noreferrer">
          Powered by <strong className={styles.logo}>Myel</strong>
        </a>
      </footer>
    </div>
  );
}
