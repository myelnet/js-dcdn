import * as React from 'react';
import {Link} from 'react-router-dom';
import DateFormatter from './DateFormatter';
import Image from './Image';
import Avatar from './Avatar';
import {Author} from './types';

type Props = {
  title: string;
  coverImage: string;
  date: string;
  excerpt: string;
  author: Author;
  slug: string;
};

export default function PostPreview({
  title,
  coverImage,
  date,
  excerpt,
  author,
  slug,
}: Props) {
  const path = `/blog/${slug}`;
  return (
    <div className="post-preview">
      <div className="post-preview-cover">
        <Link to={path}>
          <Image src={coverImage} alt={title} />
        </Link>
      </div>
      <h3>
        <Link to={path}>{title}</Link>
      </h3>
      <div className="date">
        <DateFormatter dateString={date} />
      </div>
      <p>{excerpt}</p>
      <Avatar {...author} />
    </div>
  );
}
