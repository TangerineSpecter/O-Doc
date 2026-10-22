import {ChevronLeft, ChevronRight} from 'lucide-react';


export function LotteryBalls({values, winning = []}: {values: number[]; winning?: number[]}) {
    return <div className="lottery-balls" aria-label={`号码 ${values.join('、')}`}>
        {values.map((value, index) => <span key={index}
            className={`lottery-ball ${winning.includes(value) ? 'lottery-ball--matched' : ''}`}>
            {String(value).padStart(2, '0')}
        </span>)}
    </div>;
}

export function LotteryPagination({page, total, change, label = '彩票'}: {
    page: number; total: number; change: (page: number) => void; label?: string;
}) {
    if (total <= 20) return null;
    return <nav aria-label={`${label}分页`} className="lottery-pagination">
        <span>第 {page} / {Math.ceil(total / 20)} 页</span>
        <div className="flex items-center gap-1.5">
            <button type="button" aria-label={`${label}上一页`} disabled={page === 1} onClick={() => change(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5"/>上一页
            </button>
            <button type="button" aria-label={`${label}下一页`} disabled={page * 20 >= total} onClick={() => change(page + 1)}>
                下一页<ChevronRight className="h-3.5 w-3.5"/>
            </button>
        </div>
    </nav>;
}
