"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  fullscreen?: boolean;
};

export default function Modal({ isOpen, onClose, title, children, fullscreen = false }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`modal-overlay ${fullscreen ? "modal-fullscreen-overlay" : ""}`}
      onClick={onClose}
    >
      <div
        className={`modal-content ${fullscreen ? "modal-fullscreen" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={`modal-body ${fullscreen ? "report-body" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
