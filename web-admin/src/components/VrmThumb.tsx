import { useEffect, useRef, useState } from 'react';
import { isVrm, vrmThumbnail } from '../lib/vrmThumbnail';

type Props = {
    /** The character's `base_model_url`. Ignored unless it is a .vrm. */
    modelUrl: string | null | undefined;
    /** Shown until the model has rendered, and kept if it never does. */
    fallback: string | null;
    alt?: string;
    style?: React.CSSProperties;
};

/**
 * The character's real model, rendered in place of the catalogue thumbnail.
 *
 * Only renders when the card is actually on screen. The list holds 129
 * characters and each model is ~19MB: downloading them all because they exist
 * in an array would be a hundred-odd megabytes of traffic to show pictures
 * nobody has scrolled to. IntersectionObserver is what makes this affordable —
 * without it the feature is a denial of service against your own browser.
 *
 * The static thumbnail shows immediately and stays if the render fails, so a
 * broken or missing model degrades to exactly what the list showed before.
 */
export default function VrmThumb({ modelUrl, fallback, alt = '', style }: Props) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [rendered, setRendered] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setRendered(null);
        if (!isVrm(modelUrl)) return;
        const el = ref.current;
        if (!el) return;

        let alive = true;
        const io = new IntersectionObserver(
            (entries) => {
                if (!entries.some((e) => e.isIntersecting)) return;
                io.disconnect();
                setBusy(true);
                vrmThumbnail(modelUrl as string)
                    .then((data) => { if (alive) setRendered(data); })
                    .catch(() => { /* keep the fallback */ })
                    .finally(() => { if (alive) setBusy(false); });
            },
            { rootMargin: '200px' }
        );
        io.observe(el);
        return () => { alive = false; io.disconnect(); };
    }, [modelUrl]);

    const src = rendered ?? fallback;

    return (
        <div ref={ref} style={{ position: 'relative', ...style }}>
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
            ) : (
                <div className="avatar-empty" style={{ width: '100%', height: '100%' }} />
            )}
            {busy && !rendered && (
                <div
                    title="Đang dựng model…"
                    style={{
                        position: 'absolute', right: 6, top: 6,
                        width: 8, height: 8, borderRadius: 4,
                        background: 'var(--accent, #FF4D8D)',
                        boxShadow: '0 0 6px var(--accent, #FF4D8D)',
                    }}
                />
            )}
        </div>
    );
}
