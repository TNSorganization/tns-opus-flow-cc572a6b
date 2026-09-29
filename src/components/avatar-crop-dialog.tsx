import { useEffect, useRef, useState } from "react";
import { Loader2, Move, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

type Dimensions = { width: number; height: number };

interface AvatarCropDialogProps {
  file: File | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (image: Blob) => Promise<void>;
}

export function AvatarCropDialog({ file, saving, onCancel, onSave }: AvatarCropDialogProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [previewSize, setPreviewSize] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(0);
  const [vertical, setVertical] = useState(0);

  useEffect(() => {
    if (!file) {
      setSourceUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setDimensions(null);
    setZoom(1);
    setHorizontal(0);
    setVertical(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const updateSize = () => setPreviewSize(preview.clientWidth || 320);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [sourceUrl]);

  const baseScale = dimensions
    ? Math.max(previewSize / dimensions.width, previewSize / dimensions.height)
    : 1;
  const renderedWidth = dimensions ? dimensions.width * baseScale * zoom : previewSize;
  const renderedHeight = dimensions ? dimensions.height * baseScale * zoom : previewSize;
  const maxHorizontalOffset = Math.max(0, (renderedWidth - previewSize) / 2);
  const maxVerticalOffset = Math.max(0, (renderedHeight - previewSize) / 2);
  const horizontalOffset = (horizontal / 100) * maxHorizontalOffset;
  const verticalOffset = (vertical / 100) * maxVerticalOffset;

  async function saveCrop() {
    const image = imageRef.current;
    if (!image || !dimensions || !previewSize) return;

    const totalScale = baseScale * zoom;
    const sourceSize = previewSize / totalScale;
    const sourceX = Math.max(
      0,
      (renderedWidth - previewSize) / (2 * totalScale) - horizontalOffset / totalScale,
    );
    const sourceY = Math.max(
      0,
      (renderedHeight - previewSize) / (2 * totalScale) - verticalOffset / totalScale,
    );

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);

    const cropped = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9),
    );
    if (!cropped) return toast.error("This browser could not prepare the cropped photo.");
    await onSave(cropped);
  }

  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crop profile photo</DialogTitle>
          <DialogDescription>
            Center your face inside the circle. The saved image will be a sharp square crop.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={previewRef}
          className="relative mx-auto aspect-square w-full max-w-80 overflow-hidden rounded-full border-4 border-background bg-muted shadow-lg ring-1 ring-border"
        >
          {sourceUrl && (
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Photo crop preview"
              draggable={false}
              onLoad={(event) =>
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => toast.error("This image could not be opened.")}
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                width: renderedWidth,
                height: renderedHeight,
                left: `calc(50% + ${horizontalOffset}px)`,
                top: `calc(50% + ${verticalOffset}px)`,
                transform: "translate(-50%, -50%)",
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/50" />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs">
              <ZoomIn className="h-3.5 w-3.5" /> Zoom
            </Label>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.01}
              onValueChange={([value]) => setZoom(value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs">
              <Move className="h-3.5 w-3.5" /> Move left or right
            </Label>
            <Slider
              value={[horizontal]}
              min={-100}
              max={100}
              step={1}
              disabled={maxHorizontalOffset < 1}
              onValueChange={([value]) => setHorizontal(value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs">
              <Move className="h-3.5 w-3.5 rotate-90" /> Move up or down
            </Label>
            <Slider
              value={[vertical]}
              min={-100}
              max={100}
              step={1}
              disabled={maxVerticalOffset < 1}
              onValueChange={([value]) => setVertical(value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !dimensions} onClick={saveCrop}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
