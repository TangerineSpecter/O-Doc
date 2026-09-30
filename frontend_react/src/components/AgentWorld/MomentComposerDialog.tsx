import WorldDialog from './WorldDialog';
import MomentComposer from './MomentComposer';

export default function MomentComposerDialog({onClose, onPublished}: {onClose: () => void; onPublished: () => void}) {
    return <WorldDialog title="发布朋友圈" description="分享今天的一件小事，也可以抛出一个问题。" size="compact" fixedHeight={false} onClose={onClose}>
        <MomentComposer onPublished={() => {onPublished(); onClose();}}/>
    </WorldDialog>;
}
