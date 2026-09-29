import WorldDialog from './WorldDialog';
import {WorldManagement} from './WorldManagement';

export default function WorldManagementDialog({onClose}: {onClose: () => void}) {
    return (
        <WorldDialog
            title="世界管理"
            description="管理 Agent 世界的分类、职业与收益规则。"
            onClose={onClose}
            size="wide"
        >
            <WorldManagement />
        </WorldDialog>
    );
}
