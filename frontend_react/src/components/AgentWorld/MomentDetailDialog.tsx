import {useCallback, useEffect, useState} from 'react';
import WorldDialog from './WorldDialog';
import MomentCard from './MomentCard';
import type {Moment} from '../../types/api/social';
import {getMoment} from '../../api/social';
import StarLoader from '../common/StarLoader';

export interface MomentDetailDialogProps {
    momentId: string;
    onClose: () => void;
}

export default function MomentDetailDialog({momentId, onClose}: MomentDetailDialogProps) {
    const [moment, setMoment] = useState<Moment | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const reload = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getMoment(momentId);
            setMoment(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : '获取动态失败');
        } finally {
            setLoading(false);
        }
    }, [momentId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return (
        <WorldDialog
            title="朋友圈动态"
            description="生活分享、互动与讨论"
            size="compact"
            onClose={onClose}
        >
            <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto py-1 scrollbar-hide">
                    {loading ? (
                        <div className="flex min-h-48 items-center justify-center">
                            <StarLoader variant="pill" message="读取动态详情..." />
                        </div>
                    ) : error ? (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
                            {error}
                        </div>
                    ) : moment ? (
                        <MomentCard moment={moment} onChanged={() => void reload()} focused={false} />
                    ) : null}
                </div>
            </div>
        </WorldDialog>
    );
}
