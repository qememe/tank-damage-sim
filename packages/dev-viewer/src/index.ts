export interface DevViewerMountOptions {
  container: HTMLElement;
}

export function mountDevViewerPlaceholder(
  options: DevViewerMountOptions,
): void {
  options.container.innerHTML = [
    "<section>",
    "<h1>Tank Damage Viewer</h1>",
    "<p>Result replay UI is not implemented yet.</p>",
    "<p>This package is reserved for loading result JSON and visualizing events.</p>",
    "</section>"
  ].join("");
}
