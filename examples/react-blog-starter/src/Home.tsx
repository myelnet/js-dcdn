import * as React from 'react';
import styles from './Home.module.css';

const Image = ({name}: {name: string}) => {
  return (
    <img
      src={
        '/bafyreigae5sia65thtb3a73vudwi3rsxqscqnkh2mtx7jqjlq5xl72k7ba/' + name
      }
      alt={name}
    />
  );
};

export default function Home() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Retrieval tests</h1>

        <p className={styles.description}>Retrieve content from a Myel POP</p>

        <div className={styles.grid}>
          <div className={styles.card}>
            <Image name="blue-frog.jpg" />
          </div>
          <div className={styles.card}>
            <Image name="green-frog.jpg" />
          </div>

          <div className={styles.card}>
            <Image name="orange-frog.jpg" />
          </div>

          <div className={styles.card}>
            <Image name="red-frog.jpg" />
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
