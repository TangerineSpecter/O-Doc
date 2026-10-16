import WorldDialog from './WorldDialog';
import {WorldManagement} from './WorldManagement';

export default function WorldManagementDialog({onClose}: {onClose: () => void}) {
    return (
        <WorldDialog
            title="世界管理"
            description="管理 Agent 世界规则、冒险限制、社交习惯和统一决策模型。"
            onClose={onClose}
            size="wide"
        >
            <WorldManagement />
        </WorldDialog>
    );
}
