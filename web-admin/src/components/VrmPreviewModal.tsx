import VrmPreview from './VrmPreview';

type Props = {
  url: string | null | undefined;
  title?: string;
  onClose: () => void;
};

export default function VrmPreviewModal({ url, title, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: 16 }}>
            {title ?? 'Preview'}
          </h3>
          <button className="ghost small" onClick={onClose}>Close</button>
        </div>
        <VrmPreview url={url} height={520} />
      </div>
    </div>
  );
}
