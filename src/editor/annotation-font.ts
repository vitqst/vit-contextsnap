const FONT_SAMPLE = 'ContextSnap Tiếng Việt Ắằễộựđ 123';
let pending: Promise<void> | undefined;

/** Mount the editor only after its bundled font is ready: geometry caches retain metrics. */
export function loadAnnotationFonts(): Promise<void> {
  pending ??= Promise.all(
    [500, 700].map((weight) => document.fonts.load(`${weight} 24px "Playpen Sans"`, FONT_SAMPLE)),
  ).then((faces) => {
    if (faces.some((loaded) => !loaded.length || loaded.some((face) => face.status !== 'loaded')))
      throw new Error('The bundled annotation font could not be loaded. Reopen the editor.');
  });
  return pending;
}
