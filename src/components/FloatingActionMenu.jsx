import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// 1. 移除 Smile/Meh，保留其他图标
import { Tag, FolderOpen, PenTool, BarChart2, Library, Leaf } from 'lucide-react';

export default function FloatingActionMenu() {
  const [isOpen, setIsOpen] = useState(false);
  // 2. 初始化 navigate
  const navigate = useNavigate();

  // 布局配置
  const RADIUS_FAR = 135;
  const RADIUS_NEAR = 85;

  const menuItems = [
    { id: 'stats', label: '数据统计', icon: <BarChart2 className="w-5 h-5" />, color: 'bg-emerald-500', shadow: 'shadow-emerald-500/40' },
    { id: 'whiteboard', label: '灵感白板', icon: <PenTool className="w-5 h-5" />, color: 'bg-pink-500', shadow: 'shadow-pink-500/40' },
    { id: 'resources', label: '资源库', icon: <Library className="w-5 h-5" />, color: 'bg-sky-500', shadow: 'shadow-sky-500/40' },
    { id: 'categories', label: '分类管理', icon: <FolderOpen className="w-5 h-5" />, color: 'bg-orange-500', shadow: 'shadow-orange-500/40' },
    { id: 'tags', label: '标签管理', icon: <Tag className="w-5 h-5" />, color: 'bg-indigo-500', shadow: 'shadow-indigo-500/40' },
  ];

  const toggleMenu = () => setIsOpen(!isOpen);

  // 4. 处理点击事件
  const handleItemClick = (item) => {
    console.log(`Open ${item.label}`);

    // 如果点击的是资源库，进行跳转
    if (item.id === 'resources') {
        navigate('/resources');
    } else if (item.id === 'stats') { // <--- 添加跳转逻辑
        navigate('/stats');
    }

    // 其他功能暂留空或仅 console.log
    setIsOpen(false);
  };

  const getPosition = (index, total) => {
    if (!isOpen) return { x: 0, y: 0 };
    const startAngle = -Math.PI / 2;
    const endAngle = -Math.PI;
    const step = (endAngle - startAngle) / (total - 1);
    const angle = startAngle + (index * step);
    const currentRadius = index % 2 === 0 ? RADIUS_FAR : RADIUS_NEAR;
    return { x: currentRadius * Math.cos(angle), y: currentRadius * Math.sin(angle) };
  };

  return (
    <div className="fixed bottom-10 right-10 z-[90]">

      {/* 装饰线条 */}
      <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ zIndex: 0 }}>
        {menuItems.map((_, index) => {
          const pos = getPosition(index, menuItems.length);
          return (
            <line
              key={`line-${index}`}
              x1={0} y1={0}
              x2={pos.x} y2={pos.y}
              stroke={isOpen ? "#cbd5e1" : "transparent"}
              strokeWidth="1.5"
              strokeDasharray="4 4"
              className="transition-all duration-500 ease-out"
              style={{ opacity: isOpen ? 0.4 : 0, transitionDelay: isOpen ? '50ms' : '0ms' }}
            />
          )
        })}
      </svg>

      {/* 子菜单按钮层 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {menuItems.map((item, index) => {
          const pos = getPosition(index, menuItems.length);
          return (
            <div
              key={item.id}
              className="absolute transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                opacity: isOpen ? 1 : 0,
                pointerEvents: isOpen ? 'auto' : 'none',
                zIndex: isOpen ? 10 : -1,
                transitionDelay: isOpen ? `${index * 40}ms` : '0ms'
              }}
            >
              <div className="relative group flex flex-col items-center">
                <div className={`
                    absolute -top-9 px-2.5 py-1 bg-slate-800 text-white text-[10px] font-medium rounded-lg 
                    opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none
                    shadow-xl shadow-slate-900/20 scale-90 group-hover:scale-100 z-20
                    ${isOpen ? 'translate-y-0' : 'translate-y-2'}
                `}>
                  {item.label}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                </div>
                <button
                  onClick={() => { console.log(`Open ${item.label}`); handleItemClick(item); setIsOpen(false); }}
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center text-white 
                    shadow-lg hover:scale-110 active:scale-95 transition-all duration-300
                    border-2 border-white/20 backdrop-blur-sm
                    ${item.color} ${item.shadow}
                  `}
                >
                  {item.icon}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- 主触发按钮 (无框变脸小橘子) --- */}
      <button
        onClick={toggleMenu}
        className={`
          relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 z-50 group
          ${isOpen
            ? 'bg-white scale-110 ring-4 ring-orange-100' // 打开：白底
            : 'bg-gradient-to-br from-orange-400 to-orange-600 hover:scale-105 hover:shadow-orange-500/50' // 关闭：橘子
          }
        `}
      >
        {/* 1. 小叶子 (仅关闭时显示) */}
        <div className={`
            absolute -top-3 -right-1 z-10 transition-all duration-300 origin-bottom-left
            ${isOpen ? 'opacity-0 scale-0 rotate-45' : 'opacity-100 scale-100 rotate-12 group-hover:rotate-6'}
        `}>
          <Leaf
            className="w-7 h-7 text-lime-600 fill-lime-400 drop-shadow-sm"
            strokeWidth={1.5}
          />
        </div>

        {/* 2. 内部光效 (仅关闭时显示) */}
        {!isOpen && (
          <div className="absolute inset-0 rounded-full bg-gradient-to-t from-black/10 to-transparent pointer-events-none"></div>
        )}

        {/* 3. 表情容器 (使用纯SVG绘制五官，无边框) */}
        <div className="relative w-full h-full flex items-center justify-center">

          {/* 3.1 平静脸 (Calm) - 关闭时显示 (白色五官) */}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`absolute w-7 h-7 text-white transition-all duration-500 ease-in-out
                    ${isOpen ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`}
          >
            {/* 左眼 */}
            <line x1="9" y1="10" x2="9.01" y2="10" />
            {/* 右眼 */}
            <line x1="15" y1="10" x2="15.01" y2="10" />
            {/* 平嘴 */}
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>

          {/* 3.2 笑脸 (Smile) - 打开时显示 (深灰五官) */}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`absolute w-7 h-7 text-slate-600 transition-all duration-500 ease-in-out
                    ${isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`}
          >
            {/* 左眼 */}
            <line x1="9" y1="9" x2="9.01" y2="9" />
            {/* 右眼 */}
            <line x1="15" y1="9" x2="15.01" y2="9" />
            {/* 弯嘴 */}
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          </svg>
        </div>

        {/* 4. 呼吸光环 (仅关闭时显示) */}
        {!isOpen && (
          <span className="absolute -inset-3 rounded-full border border-orange-500/20 animate-ping pointer-events-none" style={{ animationDuration: '2s' }}></span>
        )}
      </button>

      {/* 全屏遮罩 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-white/60 backdrop-blur-[2px] z-[-1] animate-in fade-in duration-300"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

    </div>
  );
}