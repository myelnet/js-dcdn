import * as React from 'react';

import {Post} from './types';
import PostPreview from './PostPreview';

type Props = {
  posts: Post[];
};

export default function PostCollection({posts}: Props) {
  return (
    <section>
      <h2 className="collection-title">Latest Posts</h2>
      <div className="post-collection">
        {posts.map((post) => (
          <PostPreview
            key={post.slug}
            title={post.title}
            coverImage={post.coverImage}
            date={post.date}
            author={post.author}
            slug={post.slug}
            excerpt={post.excerpt}
          />
        ))}
      </div>
    </section>
  );
}
