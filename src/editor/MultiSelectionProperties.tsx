import { Trash2 } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

export function MultiSelectionProperties({
  count,
  onDelete,
}: {
  count: number;
  onDelete: () => void;
}) {
  return (
    <aside className="properties-panel" aria-label="Selection properties">
      <div className="property-heading">{count} selected</div>
      <p className="property-note">
        Shift-click to add or remove elements. Delete or Backspace removes the selection together.
      </p>
      <div className="object-actions">
        <span>Delete selection</span>
        <IconButton label={`Delete ${count} selected elements`} onClick={onDelete}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </aside>
  );
}
