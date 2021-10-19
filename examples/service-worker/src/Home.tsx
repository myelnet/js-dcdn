import * as React from 'react';
import {useState} from 'react';
import styles from './Home.module.css';
import {useStore} from './store';

const Image = ({name, root}: {name: string; root: string}) => {
  const path = root + '/' + name;
  const [, set] = useState(false);
  return <img src={path} alt={name} onLoad={() => set(true)} />;
};

const Frogs = () => {
  const root = 'bafyreiaemos3x3k5fmycs64ry3otobineo4wdz73ccrqxrlzt7gmtzhbmm';
  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <Image name="blue-frog.jpg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="green-frog.jpg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="orange-frog.jpg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="red-frog.jpg" root={root} />
      </div>
    </div>
  );
};

const FrogsFromGateway = () => {
  const root =
    'http://localhost:2001/bafyreiaemos3x3k5fmycs64ry3otobineo4wdz73ccrqxrlzt7gmtzhbmm';
  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <Image name="blue-frog.jpg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="green-frog.jpg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="orange-frog.jpg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="red-frog.jpg" root={root} />
      </div>
    </div>
  );
};

const Icons = () => {
  const root = 'bafyreihln6fhimxmuzu7nmqyhld5l64qub3xasfdrtccjnq6lxbhmmt2oi';
  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <Image name="Books.svg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="Box.svg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="People.svg" root={root} />
      </div>
      <div className={styles.card}>
        <Image name="Scroll.svg" root={root} />
      </div>
    </div>
  );
};

export default function Home() {
  const cached = useStore((state) => state.cached);
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Retrieval tests</h1>

        <p className={styles.description}>Retrieve content from a Myel POP</p>

        {cached && (
          <>
            <Frogs />
          </>
        )}
      </main>

      <footer className={styles.footer}>
        <div>
          Powered by <span className={styles.logo}>Myel</span>
        </div>
      </footer>
    </div>
  );
}
