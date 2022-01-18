import * as React from 'react';
import {DialogOverlay, DialogContent} from '@reach/dialog';
import {Cross} from './icons';

type ModalProps = {
  loading?: boolean;
  isOpen: boolean;
  actionTitle: string;
  onDismiss: () => void;
  dismissTitle?: string;
  children: React.ReactNode;
  center?: boolean;
  disableAction?: boolean;
  onlyDismiss?: boolean;
};

export interface ModalMethods {
  dismiss: () => void;
}

const Modal = React.forwardRef(function Modal(
  {
    actionTitle,
    loading,
    isOpen,
    center,
    onDismiss,
    children,
    dismissTitle,
    disableAction,
    onlyDismiss,
  }: ModalProps,
  ref
) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => setVisible(isOpen), 10);
    }
  }, [isOpen]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(), 200);
  };

  React.useImperativeHandle(ref, () => ({
    dismiss,
  }));

  return (
    <DialogOverlay
      isOpen={isOpen}
      onDismiss={dismiss}
      style={{
        zIndex: 2994,
        background: visible ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0)',
        backdropFilter: 'blur(20px)',
        transition: 'background 300ms ease',
      }}
    >
      <DialogContent
        style={{
          width: 380,
          height: 380,
          borderRadius: 30,
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
          transform: visible ? 'translateY(25%)' : 'translateY(100%)',
          opacity: visible ? 1 : 0,
          transition: 'transform 300ms ease, opacity 300ms ease',
        }}
        aria-label={actionTitle}
      >
        <div data-dcdn-modal="">
          <div data-dcdn-modal-header="">
            <div data-dcdn-modal-header-title="">{actionTitle}</div>
            <Cross size={24} color="#000" onClick={dismiss} />
          </div>
          {children}
        </div>
      </DialogContent>
    </DialogOverlay>
  );
});

export default Modal;
