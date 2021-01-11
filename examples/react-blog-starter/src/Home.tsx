import * as React from 'react';
import {Link} from 'react-router-dom';

import Image from './Image';
import MyelLogo from './assets/MyelIconGrid.png';
import Footer from './Footer';

export default function Home() {
  return (
    <div className="main light">
      <main className="home-container">
        <section className="home-hero">
          <div className="section-content">
            <Image alt="Myel icon" src={MyelLogo} className="hero-logo" />
            <div>
              <h1 className="section-title">Myel Docs</h1>
              <p className="section-subtitle">
                Explore our examples and case studies on how to join the Myel
                network.
                <br />
                (More coming soon)
              </p>
              <Link to="blog" className="home-link">
                Read the blog
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
