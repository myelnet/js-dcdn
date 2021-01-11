import * as React from 'react';
import {Link} from 'react-router-dom';

type Props = {
  title: string;
  subtitle?: string;
  small?: boolean;
};

export default function Header({title, subtitle, small}: Props) {
  return (
    <section className={['header', small && 'header-small'].join(' ')}>
      {small ? (
        <h2>
          <Link to="/blog">{title}</Link>
        </h2>
      ) : (
        <h1 className="header-title">{title}</h1>
      )}
      {subtitle && <h4>{subtitle}</h4>}
    </section>
  );
}
