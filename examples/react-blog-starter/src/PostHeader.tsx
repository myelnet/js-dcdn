import * as React from 'react';

import DateFormatter from './DateFormatter';
import Avatar from './Avatar';
import Image from './Image';
import {Author} from './types';

type Props = {
  title: string;
  coverImage: string;
  date: string;
  author: Author;
};

export default function PostHeader({title, coverImage, date, author}: Props) {
  return (
    <header>
      <h1>{title}</h1>
      <div className="post-avatar-wide">
        <Avatar {...author} />
      </div>
      <div className="hero-cover">
        <Image src={coverImage} alt={title} />
      </div>
      <div className="post-avatar">
        <Avatar {...author} />
      </div>
      <div className="text-column">
        <DateFormatter dateString={date} />
      </div>
    </header>
  );
}
