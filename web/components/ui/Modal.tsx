"use client";

import { ReactNode } from "react";
import { Cross2Icon } from "@radix-ui/react-icons";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  fullscreen?: boolean;
  headerContent?: ReactNode;
};

export default function Modal({ isOpen, onClose, title, children, fullscreen = false, headerContent }: ModalProps) {
  if (!isOpen) return null;

  const showHeader = title || headerContent;

  return (
    <div
      className={`modal-overlay ${fullscreen ? "modal-fullscreen-overlay" : ""}`}
      onClick={onClose}
    >
      <div
        className={`modal-content ${fullscreen ? "modal-fullscreen" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showHeader && (
          <div className="modal-header">
            {title ? <h2>{title}</h2> : <div className="modal-header-content">{headerContent}</div>}
            <button className="modal-close" onClick={onClose}>
              <Cross2Icon className="w-5 h-5" />
            </button>
          </div>
        )}
        {!showHeader && (
          <button className="modal-close-floating" onClick={onClose}>
            <Cross2Icon className="w-5 h-5" />
          </button>
        )}
        <div className={`modal-body ${fullscreen ? "report-body" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
