import * as React from 'react';
import {readFile} from './readFile';

type Props = {
  content: string;
};

export default function PostBody({content}: Props) {
  const html = readFile(content, 'utf8') as string;
  return (
    <div className="text-column text-with-markdown">
      <div dangerouslySetInnerHTML={{__html: html}} />
    </div>
  );
}
