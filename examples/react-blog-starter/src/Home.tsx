import * as React from 'react';
import {useState, useCallback} from 'react';
import styles from './Home.module.css';
import {useDT, allSelector} from './retriever';
import {useDropzone} from 'react-dropzone';
import {multiaddr} from 'multiaddr';
import PeerId from 'peer-id';
import CID from 'cids';

const TEST_CID =
  'bafykbzaceakkx46yvfgevdgoovy2gmkun4bdaroti4y4recjtokizdaqrcjlc';

export default function Home() {
  const [cid, setCid] = useState<string | null>(null);
  const [peerAddr, setPeerAddr] = useState<string>('');
  const dt = useDT();

  const startTransfer = () => {
    if (!dt.libp2p) {
      return;
    }
    const addr = multiaddr(
      '/ip4/127.0.0.1/tcp/60834/http/p2p-webrtc-direct/p2p/12D3KooWF4Tda3GXUAegZ4Qt5yzG6qQEjWt9Z2N5NVkunzsn8Zaf'
    );
    const pidStr = addr.getPeerId();
    if (!pidStr) {
      return;
    }
    const pid = PeerId.createFromB58String(pidStr);
    dt.libp2p.peerStore.addressBook.set(pid, [addr]);

    const root = new CID(TEST_CID);

    const addrs = dt.libp2p.peerStore.addressBook.getMultiaddrsForPeer(pid);

    if (!addrs) {
      return;
    }
    dt.request(pid, root, allSelector);
  };

  const onDrop = useCallback((files: File[]) => {
    fetch('http://localhost:2001', {
      method: 'POST',
      body: files[0],
    })
      .then((res) => setCid(res.headers.get('Ipfs-Hash')))
      .catch((err) => console.log(err));
  }, []);
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop});

  const handleEcho = () => {
    if (!dt.libp2p || !peerAddr) {
      return;
    }
    const addr = multiaddr(peerAddr);
    const pidStr = addr.getPeerId();
    if (!pidStr) {
      return;
    }
    const pid = PeerId.createFromB58String(pidStr);
    dt.libp2p.peerStore.addressBook.set(pid, [addr]);

    dt.echo(pid, 'hello world');
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Retrieval tests</h1>

        <p className={styles.description}>Fetch content from a Myel POP</p>

        <div className={styles.grid}>
          <div className={styles.card} onClick={startTransfer}>
            <h2>Request &rarr;</h2>
            <p>Start a new transfer with a peer</p>
          </div>

          <div
            className={[
              styles.card,
              isDragActive ? styles.cardActive : '',
            ].join(' ')}
            {...getRootProps()}>
            <input {...getInputProps()} />
            <h2>Upload &rarr;</h2>
            {cid ? (
              <p>Uploaded: {cid}</p>
            ) : (
              <p>Upload content to a node directly with HTTP</p>
            )}
          </div>

          <div className={styles.card}>
            <h2>Echo &rarr;</h2>
            <p>Send echo message to peer:</p>
            <div className={styles.cardRow}>
              <input
                type="text"
                name="addrs"
                value={peerAddr}
                placeholder="/ip4/127.0.0.1/tcp/60834/http/p2p-webrtc-direct/p2p/12D3KooWF4Tda3GXUAegZ4Qt5yzG6qQEjWt9Z2N5NVkunzsn8Zaf"
                onChange={(e) => setPeerAddr(e.target.value)}
              />
              <button onClick={handleEcho}>Send</button>
            </div>
          </div>

          <div className={styles.card}>
            <h2>Deploy &rarr;</h2>
            <p>Blablablah</p>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div>
          Powered by <span className={styles.logo}>Myel</span>
        </div>
      </footer>
    </div>
  );
}
