import {BookOpen, Clock, ImageOff, ImagePlus, Pencil} from 'lucide-react';
import {Select, type SelectOption} from '../common/Select';
import './recipeDetailsToolbar.css';

type DetailsTab = 'details' | 'history';
type ImageAction = '' | 'choose' | 'remove';

interface RecipeDetailsToolbarProps {
    activeTab: DetailsTab;
    onTabChange: (tab: DetailsTab) => void;
    historyTotal: number;
    hasCustomImage: boolean;
    imageBusy: boolean;
    onOpenImagePicker: () => void;
    onRemoveImage: () => void;
    onOpenRuleEditor: () => void;
}

export function RecipeDetailsToolbar({
    activeTab,
    onTabChange,
    historyTotal,
    hasCustomImage,
    imageBusy,
    onOpenImagePicker,
    onRemoveImage,
    onOpenRuleEditor,
}: RecipeDetailsToolbarProps) {
    const imageOptions: SelectOption<ImageAction>[] = [
        {
            value: 'choose',
            label: '选择图片',
            icon: <ImagePlus className="h-3.5 w-3.5 shrink-0 text-orange-500" />,
        },
        ...(hasCustomImage ? [{
            value: 'remove' as const,
            label: '移除图片',
            icon: <ImageOff className="h-3.5 w-3.5 shrink-0 text-orange-500" />,
        }] : []),
    ];

    return (
        <div className="recipe-details-toolbar mb-3 shrink-0 border-b border-slate-100 pb-2.5">
            <div className="recipe-details-toolbar__row">
                <div className="recipe-details-toolbar__tabs flex shrink-0 gap-1 whitespace-nowrap rounded-xl border border-slate-200/60 bg-slate-100 p-1">
                    <button
                        type="button"
                        aria-label="配方与收益"
                        aria-pressed={activeTab === 'details'}
                        title="配方与收益"
                        onClick={() => onTabChange('details')}
                        className={`recipe-details-toolbar__tab inline-flex shrink-0 items-center whitespace-nowrap rounded-lg py-1 text-xs font-bold transition-all ${
                            activeTab === 'details'
                                ? 'bg-white text-orange-600 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <BookOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className="recipe-details-toolbar__full-label">配方与收益</span>
                        <span className="recipe-details-toolbar__short-label">配方</span>
                    </button>
                    <button
                        type="button"
                        aria-label={`制作记录${historyTotal > 0 ? `，共 ${historyTotal} 条` : ''}`}
                        aria-pressed={activeTab === 'history'}
                        title="制作记录"
                        onClick={() => onTabChange('history')}
                        className={`recipe-details-toolbar__tab inline-flex shrink-0 items-center whitespace-nowrap rounded-lg py-1 text-xs font-bold transition-all ${
                            activeTab === 'history'
                                ? 'bg-white text-orange-600 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="recipe-details-toolbar__full-label">制作记录</span>
                        <span className="recipe-details-toolbar__short-label">记录</span>
                        {historyTotal > 0 && (
                            <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-semibold leading-none ${
                                activeTab === 'history'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-slate-200 text-slate-600'
                            }`}>
                                {historyTotal}
                            </span>
                        )}
                    </button>
                </div>

                {activeTab === 'details' && (
                    <div className="flex shrink-0 items-center gap-1.5">
                        <div className="recipe-details-toolbar__image-menu w-16 shrink-0" title="选择或移除菜品的自定义图片">
                            <Select<ImageAction>
                                value=""
                                placeholder="图片"
                                options={imageOptions}
                                onChange={action => {
                                    if (action === 'choose') onOpenImagePicker();
                                    else if (action === 'remove') onRemoveImage();
                                }}
                                disabled={imageBusy}
                                menuPortal={true}
                                buttonClassName="whitespace-nowrap shrink-0 hover:!border-orange-200 hover:!bg-orange-50 hover:!text-orange-700"
                                menuClassName="recipe-details-toolbar__image-options scrollbar-hide"
                            />
                        </div>
                        <button
                            type="button"
                            aria-label="编辑规则"
                            onClick={onOpenRuleEditor}
                            className="recipe-details-toolbar__edit inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-600 shadow-2xs transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-95"
                            title="编辑规则：自定义食材用量、等级限制与售价收益"
                        >
                            <Pencil className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                            <span className="recipe-details-toolbar__edit-label">编辑规则</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
