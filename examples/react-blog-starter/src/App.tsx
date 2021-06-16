import React, {lazy} from 'react';
import {Routes, Route} from 'react-router-dom';
import './styles.css';

const Home = lazy(() => import('./Home'));

export default function App() {
  return (
    <Routes>
      <Route path="" element={<Home />} />
    </Routes>
  );
}
