/** Remove only transparent padding so signatures remain legible in small form cells. */
export function signatureBounds(image: Pick<ImageData, "data" | "width" | "height">) {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return null;
  const padding = 6;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(image.width - 1, right + padding);
  bottom = Math.min(image.height - 1, bottom + padding);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Keyboard signature: the name written in a hand-like style (used when signing on a phone). */
export function nameSignature(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 120;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#14213d";
  context.font = "italic 600 54px 'Nanum Pen Script', 'Gaegu', cursive";
  context.textBaseline = "middle";
  context.fillText(name.trim(), 20, 62);
  return exportSignature(canvas);
}

export function exportSignature(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return "";
  const bounds = signatureBounds(context.getImageData(0, 0, canvas.width, canvas.height));
  if (!bounds) return "";
  const cropped = document.createElement("canvas");
  cropped.width = bounds.width;
  cropped.height = bounds.height;
  const target = cropped.getContext("2d");
  if (!target) return "";
  target.drawImage(
    canvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  return cropped.toDataURL("image/png");
}
