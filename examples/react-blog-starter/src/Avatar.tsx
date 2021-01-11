import * as React from 'react';

import Image from './Image';

type Props = {
  name: string;
  picture: string;
};

export default function Avatar({name, picture}: Props) {
  return (
    <div className="avatar-container">
      <div>
        <Image src={picture} alt="Avatar" className="avatar" />
      </div>
      <div className="avatar-label">{name}</div>
    </div>
  );
}
