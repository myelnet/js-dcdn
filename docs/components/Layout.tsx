import {useState, useEffect} from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {RemoveScroll} from 'react-remove-scroll';
import styles from '../styles/Layout.module.css';
import {PageProps, MasterProps, ListItem} from '../types/page';
import Burger from './Burger';
import Github from './Github';
import LeftArrow from './LeftArrow';

type NavBarProps = {
  onMenuOpen: () => void;
};

function NavBar({onMenuOpen}: NavBarProps) {
  const {query} = useRouter();
  const base = query.slug?.[0];
  return (
    <nav className={styles.navContainer}>
      <div className={styles.navContent}>
        <div className={styles.navBurger} onClick={onMenuOpen}>
          <Burger />
        </div>
        <div className={styles.navLogo}>
          <Link href="/">
            <a className={styles.logo}>
              <Image
                src="/RoundedLogo.png"
                className={styles.logoImg}
                height={40}
                width={40}
                alt="Myel logo"
              />
              <span className={styles.logoTitle}>Myel Docs</span>
            </a>
          </Link>
        </div>
        <div className={styles.navLinks}>
          <div
            className={[
              styles.navLink,
              base === 'pop' ? styles.navLinkActive : '',
            ].join(' ')}>
            <Link href="/pop">
              <a>pop</a>
            </Link>
          </div>
          <div
            className={[
              styles.navLink,
              base === 'myel-js' ? styles.navLinkActive : '',
            ].join(' ')}>
            <Link href="/myel-js">
              <a>myel.js</a>
            </Link>
          </div>
        </div>
        <div className={styles.navSearch}>
          <a
            className={styles.githubLogo}
            href={
              base === 'myel-js'
                ? 'https://github.com/myelnet/myel.js'
                : 'https://github.com/myelnet/pop'
            }>
            <Github />
          </a>
        </div>
      </div>
    </nav>
  );
}

function Master({items, pathroot, open, onBack}: MasterProps) {
  const {query, events} = useRouter();
  useEffect(() => {
    const handleRouteChange = () => {
      onBack?.();
    };
    events.on('routeChangeStart', handleRouteChange);

    // If the component is unmounted, unsubscribe
    // from the event with the `off` method:
    return () => {
      events.off('routeChangeStart', handleRouteChange);
    };
  }, []);
  const base = query.slug?.[0];
  const sel = query.slug?.[1];
  const renderSublist = (list: ListItem[]) =>
    list.map((item: ListItem) => (
      <li key={item.slug} className={styles.menuItem}>
        <Link href={'/' + pathroot + item.slug}>
          <a
            className={
              sel === item.slug.slice(1) ? styles.menuItemActive : undefined
            }>
            {item.title}
          </a>
        </Link>
      </li>
    ));
  return (
    <RemoveScroll enabled={open} forwardProps>
      <aside
        className={[styles.master, open ? styles.masterOpen : ''].join(' ')}>
        <div className={styles.masterTopBar}>
          <div className={styles.backBtn} onClick={onBack}>
            <LeftArrow />
          </div>
          <div className={styles.sideNavLinks}>
            <div
              className={[
                styles.navLink,
                base === 'pop' ? styles.navLinkActive : '',
              ].join(' ')}>
              <Link href="/pop">
                <a>pop</a>
              </Link>
            </div>
            <div
              className={[
                styles.navLink,
                base === 'myel-js' ? styles.navLinkActive : '',
              ].join(' ')}>
              <Link href="/myel-js">
                <a>myel.js</a>
              </Link>
            </div>
          </div>
        </div>
        <div className={styles.masterContent}>
          <ul className={styles.menuList}>{renderSublist(items[0])}</ul>
          <div className={styles.menuHeading}>Features</div>
          <ul className={styles.menuList}>{renderSublist(items[1])}</ul>
          <div className={styles.menuHeading}>API</div>
          <ul className={styles.menuList}>{renderSublist(items[2])}</ul>
        </div>
      </aside>
    </RemoveScroll>
  );
}

type HeaderProps = {
  title: string;
  subtitle: string;
};

function Header({title, subtitle}: HeaderProps) {
  return (
    <div className={styles.header}>
      <h1 className={styles.headerTitle}>{title}</h1>
      <p className={styles.headerSubtitle}>{subtitle}</p>
    </div>
  );
}

type DetailProps = HeaderProps & {
  content: string;
};

function Detail({title, subtitle, content}: DetailProps) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailContent}>
        <Header title={title} subtitle={subtitle} />
        <Content content={content} />
      </div>
    </div>
  );
}

type ContentProps = {
  content: string;
};

function Content({content}: ContentProps) {
  return (
    <div className={styles.text}>
      <div dangerouslySetInnerHTML={{__html: content}} />
    </div>
  );
}

export default function Layout({
  title,
  description,
  content,
  menu,
  root,
}: PageProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.container}>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>

      <NavBar onMenuOpen={() => setOpen(true)} />

      <div className={styles.content}>
        <div
          className={[styles.overlay, open ? styles.overlayOpen : ''].join(' ')}
          onClick={() => setOpen(false)}
        />
        <Master
          items={menu}
          pathroot={root}
          open={open}
          onBack={() => setOpen(false)}
        />
        <Detail title={title} subtitle={description} content={content} />
      </div>
    </div>
  );
}
