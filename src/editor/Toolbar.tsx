import {
  Crop,
  CircleDashed,
  CircleDot,
  MousePointer2,
  MoveUpRight,
  Pencil,
  RectangleHorizontal,
  SquareDashed,
  Type,
  ZoomIn,
} from 'lucide-react';
import type { Tool } from '../core/model';
import { IconButton } from '../ui/IconButton';

const TOOLS = [
  { id: 'select', title: 'Select', key: 'V', icon: MousePointer2 },
  { id: 'arrow', title: 'Arrow', key: 'A', icon: MoveUpRight },
  { id: 'pen', title: 'Pen', key: 'P', icon: Pencil },
  { id: 'rectangle', title: 'Rectangle', key: 'R', icon: RectangleHorizontal },
  { id: 'text', title: 'Text', key: 'T', icon: Type },
  { id: 'step', title: 'Step', key: 'S', icon: CircleDot },
  { id: 'magnifier', title: 'Magnifier', key: 'M', icon: ZoomIn },
  { id: 'blur', title: 'Blur', key: 'B', icon: CircleDashed },
  { id: 'redact', title: 'Redact', key: 'X', icon: SquareDashed },
  { id: 'crop', title: 'Crop', key: 'C', icon: Crop },
] as const;

export function Toolbar({ tool, onChange }: { tool: Tool; onChange: (tool: Tool) => void }) {
  return (
    <div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map(({ id, title, key, icon: Icon }, index) => (
        <div className="tool-wrap" key={id}>
          {index === 1 || id === 'magnifier' || id === 'crop' ? (
            <span className="tool-separator" />
          ) : null}
          <IconButton active={tool === id} label={`${title} (${key})`} onClick={() => onChange(id)}>
            {id === 'step' ? (
              <span className="step-tool-icon">1</span>
            ) : (
              <Icon size={19} strokeWidth={1.7} />
            )}
            <span className="tool-key">{key}</span>
          </IconButton>
        </div>
      ))}
    </div>
  );
}
