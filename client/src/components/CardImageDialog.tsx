import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface Props {
  name: string;
  imageUri: string | null;
  scryfallUri?: string | null;
  children: ReactNode;
}

/**
 * Shows one card, whole, at its own proportions.
 *
 * The image is Scryfall's full card scan, so the only job here is to not
 * distort it: the frame is sized from the image's natural aspect ratio and
 * capped against the *viewport* rather than a fixed box, which is what keeps
 * a tall card from being squashed to fit on a short screen. `object-fit:
 * contain` is the backstop for cards whose scan isn't the usual ratio
 * (Planechase, art series).
 *
 * Radix Dialog handles focus trapping, restoring focus to whatever was
 * tapped, Escape, and scroll locking.
 */
export function CardImageDialog({ name, imageUri, scryfallUri, children }: Props) {
  // Without an image there is nothing to open, so the trigger stays inert
  // rather than becoming a button that opens an empty modal.
  if (!imageUri) return <>{children}</>;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="card-image-content" aria-describedby={undefined}>
          <Dialog.Title className="visually-hidden">{name}</Dialog.Title>

          <img className="card-image-full" src={imageUri} alt={name} />

          <div className="card-image-footer">
            <span className="card-image-name">{name}</span>
            {scryfallUri && (
              <a
                className="card-image-link"
                href={scryfallUri}
                target="_blank"
                rel="noreferrer noopener"
              >
                Scryfall
              </a>
            )}
          </div>

          <Dialog.Close className="dialog-close card-image-close" aria-label="Close">
            <span aria-hidden="true">×</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
