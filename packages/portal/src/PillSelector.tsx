import * as React from 'react';
import {Chevron} from './icons';

type PillSelectorProps = {
  title: string;
  onClick: () => void;
};

export default function PillSelector({title, onClick}: PillSelectorProps) {
  return (
    <div
      data-dcdn-fs-portal-pill-btn=""
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div data-dcdn-fs-portal-pill-content="">
        <div>{title}</div>
        <div data-dcdn-fs-portal-pill-icon="">
          <Chevron />
        </div>
      </div>
    </div>
  );
}
