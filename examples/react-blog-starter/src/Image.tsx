import * as React from 'react';
import {useState} from 'react';

type Props = {
  src: string;
  alt: string;
  className?: string;
};

export default function Image({src, alt, className = ''}: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={['image-container', className].join(' ')}>
      <img alt={alt} src={src} className="image" />
    </div>
  );
}
