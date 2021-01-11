import * as React from 'react';
import {Link} from 'react-router-dom';
import {Author} from './types';
import DateFormatter from './DateFormatter';
import Image from './Image';
import Avatar from './Avatar';

type Props = {
  title: string;
  coverImage: string;
  date: string;
  excerpt: string;
  author: Author;
  slug: string;
};

export default function HeroPost({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}: Props) {
  const path = `/blog/${slug}`;
  return (
    <section>
      <div className="hero-cover">
        <Link to={path}>
          <Image src={coverImage} alt={title} />
        </Link>
      </div>
      <div className="hero-body">
        <div>
          <h3>
            <Link to={path}>{title}</Link>
          </h3>
          <div>
            <DateFormatter dateString={date} />
          </div>
        </div>
        <div>
          <p>{excerpt}</p>
          <Avatar {...author} />
        </div>
      </div>
    </section>
  );
}
