import React, {useState, Suspense} from 'react';
import {atom, selectorFamily, useRecoilState, useRecoilValue} from 'recoil';
import {useDropzone} from 'react-dropzone';
import styles from './App.module.css';
import MyelIcon from './MyelIcon';
import Caret from './Caret';
import Clipboard from './Clipboard';
import Download from './Download';
import Spinner from './Spinner';
import {Tx, Entry} from 'myel-http-client';

const MYEL_EP = 'http://localhost:2001';

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

type DeleteProps = {
  onDelete: () => void;
};

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
  };

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

function StringRow({
  id,
  isFirst,
  isLast,
  value,
  onChange,
  onDelete,
}: StringRowProps) {
  return (
    <Row id={id} isFirst={isFirst} isLast={isLast}>
      <div className={styles.stringItems}>
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
        <Delete onDelete={onDelete} />
      </div>
    </Row>
  );
}

type FileRowProps = RowProps &
  DeleteProps & {
    value: File;
    onChange: (val: File) => void;
  };

function FileRow({
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
          style={{backgroundImage: value ? `url(${getUrl(value)})` : 'none'}}
        />
        <div {...(getRootProps({className: styles.input}) as any)}>
          <input {...getInputProps()} />
          <div className={styles.instructions}>click or drop</div>
        </div>
        <Delete onDelete={onDelete} />
      </div>
    </Row>
  );
}

type TxModuleProps = {
  onCommit: (entries: Input[]) => Promise<void>;
};

function TxModule({onCommit}: TxModuleProps) {
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
          <div className={styles.titleBarTitle}>New Transaction</div>
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

const imageReg = /[\/.](gif|jpg|jpeg|tiff|png)$/i;

type ValueDisplayProps = {
  root: string;
  name: string;
  value: string;
  load?: boolean;
};

const txValue = selectorFamily<string, ValueDisplayProps>({
  key: 'TxValue',
  get: (props) => async () => {
    if (!props.load || props.name.includes('.')) {
      return '';
    }
    const value = await fetch(
      MYEL_EP + '/' + props.root + '/' + props.name
    ).then((res) => res.text());
    return value;
  },
});

function ValueDisplay(props: ValueDisplayProps) {
  const {root} = props;
  const [load, setLoad] = useState(false);
  const value = useRecoilValue(txValue({...props, load}));
  return load ? (
    imageReg.test(value) ? (
      <div
        className={styles.imgPreview}
        style={{
          backgroundImage: `url(${MYEL_EP}/${root}/${value})`,
        }}
      />
    ) : (
      <div className={[styles.input, styles.inputImmut].join(' ')}>{value}</div>
    )
  ) : (
    <div className={styles.stringItems}>
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
  get: (root) => async () => {
    const entries = await new Tx({endpoint: MYEL_EP, root}).getEntries();
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
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cid);
      setCopied(true);
    } catch {}
  };
  const entries = useRecoilValue(txEntries(cid));
  return (
    <div className={styles.module}>
      <div className={styles.titleBar}>
        <div className={styles.titleAccessory}></div>
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
      </div>
    </div>
  );
}

export default function Home() {
  const [txs, setTxs] = useState<string[]>([]);

  const handleCommit = async (entries: Input[]) => {
    const tx = new Tx({endpoint: 'http://localhost:2001'});

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
        <TxModule onCommit={handleCommit} />
        {txs.map((tx) => (
          <Suspense fallback={null} key={tx}>
            <FrozenTxModule key={tx} cid={tx} />
          </Suspense>
        ))}
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
