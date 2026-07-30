import React from 'react';
import { Undo2, X } from 'lucide-react';
import { useData } from '../context/DataContext';

function UndoToast() {
  const { toast, performUndo, dismissToast } = useData();
  if (!toast) return null;
  return (
    <div className="toast" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ minWidth: 0 }}>{toast.message}</span>
      {toast.undo && (
        <button className="toast-undo-btn" onClick={performUndo}>
          <Undo2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          Undo
        </button>
      )}
      <button className="toast-close-btn" onClick={dismissToast} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export default UndoToast;
