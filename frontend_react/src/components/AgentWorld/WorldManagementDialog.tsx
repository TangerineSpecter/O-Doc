import WorldDialog from './WorldDialog';
import {WorldManagement} from './WorldManagement';

export default function WorldManagementDialog({onClose}: {onClose: () => void}) {
    return (
        <WorldDialog
            title="世界管理"
            description="管理 Agent 世界规则、冒险限制和统一决策模型；活动开关集中在任务分配。"
            onClose={onClose}
            size="wide"
        >
            <WorldManagement />
        </WorldDialog>
    );
}
