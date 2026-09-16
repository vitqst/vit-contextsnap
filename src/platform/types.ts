export interface CaptureRecord {
  version: 1;
  id: string;
  image: Blob;
  width: number;
  height: number;
  title: string;
  url: string;
  createdAt: string;
  mode: 'visible' | 'area' | 'import' | 'screen';
}

/** Recent items are flattened exports only; no original image or editable object data. */
export interface RecentRecord extends CaptureRecord {
  exportedAt: string;
}

export interface CaptureRequest {
  type: 'capture';
  mode: 'visible' | 'area';
  tabId?: number;
}

export interface AreaCaptureRequest {
  type: 'capture-area-confirm';
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number; devicePixelRatio: number };
}

export interface CaptureReply {
  ok: boolean;
  error?: string;
}
