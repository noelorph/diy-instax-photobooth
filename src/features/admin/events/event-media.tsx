import { ImageIcon, Upload, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormFeedback } from '@/components/shared/form-feedback';
import { EVENT_MEDIA_UNAVAILABLE_MESSAGE } from '@/lib/events/media-availability';
import styles from './draft.module.css';

export function EventMediaEditor() {
  return (
    <section className={styles.media} aria-labelledby="event-media-heading">
      <h2 id="event-media-heading">Event Media</h2>
      <FormFeedback kind="status">{EVENT_MEDIA_UNAVAILABLE_MESSAGE}</FormFeedback>
      <div className={styles.mediaItem}>
        <div className={styles.mediaPlaceholder}>
          <ImageIcon size={32} aria-hidden="true" />
          <span>Preview unavailable</span>
        </div>
        <div className={styles.mediaDetails}>
          <h3>Background image</h3>
          <p>Displayed on the booth screen as the Event background.</p>
          <p className={styles.help}>Optional · Still JPEG, PNG or WebP · up to 10 MB</p>
          <Button type="button" variant="secondary" disabled>
            <Upload aria-hidden="true" />
            Upload image
          </Button>
        </div>
      </div>
      <div className={styles.mediaItem}>
        <div className={styles.mediaPlaceholder}>
          <Video size={32} aria-hidden="true" />
          <span>Preview unavailable</span>
        </div>
        <div className={styles.mediaDetails}>
          <h3>Welcome montage</h3>
          <p>A welcome video for the booth. Playback is muted.</p>
          <p className={styles.help}>Optional · H.264 MP4 · up to 50 MB and 30 seconds</p>
          <Button type="button" variant="secondary" disabled>
            <Upload aria-hidden="true" />
            Upload montage
          </Button>
        </div>
      </div>
    </section>
  );
}
