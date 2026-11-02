import {BookHeart} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import './diary.css';
export default function DiaryEdgeButton() {
    const navigate = useNavigate();
    return <button type="button" title="进入日记" aria-label="进入日记" onClick={() => navigate('/diary')} className="diary-edge fixed right-0 top-[calc(50%+104px)] z-[80] flex h-9 w-9 items-center gap-2 overflow-hidden rounded-l-md bg-rose-500 pl-2 text-white transition-all hover:w-24 hover:bg-rose-600 focus-visible:w-24 active:scale-95">
        <BookHeart size={20} className="shrink-0"/><span className="whitespace-nowrap text-xs font-bold">日记</span>
    </button>;
}
