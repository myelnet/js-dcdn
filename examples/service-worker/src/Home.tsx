import * as React from 'react';
import styles from './Home.module.css';
import {useStore} from './store';

const Image = ({name}: {name: string}) => {
  return (
    <img
      src={
        '/bafyreiaemos3x3k5fmycs64ry3otobineo4wdz73ccrqxrlzt7gmtzhbmm/' + name
      }
      alt={name}
    />
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
          <div className={styles.grid}>
            <div className={styles.card}>
              <Image name="blue-frog.jpg" />
            </div>
            {/*
            <div className={styles.card}>
              <Image name="green-frog.jpg" />
            </div>
            <div className={styles.card}>
              <Image name="orange-frog.jpg" />
            </div>
            <div className={styles.card}>
              <Image name="red-frog.jpg" />
            </div>
	      */}
          </div>
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
