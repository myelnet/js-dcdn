import * as React from 'react';
import {useParams} from 'react-router-dom';

import Header from './Header';
import PostHeader from './PostHeader';
import {posts} from './const';
import PostBody from './PostBody';

export default function BlogPost() {
  const {selectedId} = useParams();
  const post = posts.find((el) => el.slug === selectedId) ?? posts[0];

  return (
    <>
      <Header title="Myel Blog." small />
      <article>
        <PostHeader
          title={post.title}
          coverImage={post.coverImage}
          date={post.date}
          author={post.author}
        />
        <PostBody content={post.content} />
      </article>
    </>
  );
}
