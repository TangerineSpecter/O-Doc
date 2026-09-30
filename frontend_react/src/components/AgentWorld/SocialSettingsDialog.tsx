import WorldDialog from './WorldDialog';
import SocialSettings from './SocialSettings';

export default function SocialSettingsDialog({onClose, onSaved}: {onClose: () => void; onSaved?: () => void}) {
    return <WorldDialog title="社交设置" description="选择参与者、交流节奏和图片偏好。" size="wide" fixedHeight onClose={onClose}>
        <SocialSettings onCancel={onClose} onSaved={() => {onSaved?.(); onClose();}}/>
    </WorldDialog>;
}
