import * as React from 'react';

import Header from './Header';
import HeroPost from './HeroPost';
import PostCollection from './PostCollection';
import {posts} from './const';

export default function BlogIndex() {
  return (
    <>
      <Header
        title="Myel Blog."
        subtitle="A blog example powered by the Myel CDN"
      />
      <HeroPost {...posts[0]} />
      {posts.length > 1 && <PostCollection posts={posts.slice(1)} />}
    </>
  );
}
