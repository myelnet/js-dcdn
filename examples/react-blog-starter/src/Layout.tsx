import * as React from 'react';
import {useState} from 'react';
import {Outlet} from 'react-router-dom';
import Footer from './Footer';

type ThemeName = 'light' | 'dark';

export default function Layout() {
  const [theme, setTheme] = useState<ThemeName>('light');
  return (
    <div className={['main', theme].join(' ')}>
      <div className="container">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
