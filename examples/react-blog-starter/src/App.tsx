import React, {lazy, useState, useEffect} from 'react';
import {Routes, Route} from 'react-router-dom';
import './styles.css';

import Layout from './Layout';
const BlogIndex = lazy(() => import('./BlogIndex'));
const BlogPost = lazy(() => import('./BlogPost'));
const Home = lazy(() => import('./Home'));

export default function App() {
  return (
    <Routes>
      <Route path="" element={<Home />} />
      <Route path="blog" element={<Layout />}>
        <Route path=":selectedId" element={<BlogPost />} />
        <Route path="/" element={<BlogIndex />} />
      </Route>
    </Routes>
  );
}
