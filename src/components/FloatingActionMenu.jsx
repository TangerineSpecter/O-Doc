import React, { useState } from 'react';
import { Tag, FolderOpen, PenTool, BarChart2, Plus } from 'lucide-react';

export default function FloatingActionMenu() {
  const [isOpen, setIsOpen] = useState(false);

  // --- 配置项 ---
  const RADIUS = 110; // 展开半径 (像素)
  const TOTAL_ANGLE = 90; // 扇形总角度 (90度)
  
  // 菜单项数据
  const menuItems = [
    { id: 'stats', label: '数据统计', icon: <BarChart2 className="w-5 h-5" />, color: 'bg-emerald-500', shadow: 'shadow-emerald-500/30' },
    { id: 'whiteboard', label: '灵感白板', icon: <PenTool className="w-5 h-5" />, color: 'bg-pink-500', shadow: 'shadow-pink-500/30' },
    { id: 'categories', label: '分类管理', icon: <FolderOpen className="w-5 h-5" />, color: 'bg-orange-500', shadow: 'shadow-orange-500/30' },
    { id: 'tags', label: '标签管理', icon: <Tag className="w-5 h-5" />, color: 'bg-indigo-500', shadow: 'shadow-indigo-500/30' },
  ];

  const toggleMenu = () => setIsOpen(!isOpen);

  // 计算每个按钮的位置
  const getPosition = (index, total) => {
    if (!isOpen) return { x: 0, y: 0 };
    
    // 只有一个元素时，直接放在 45 度角
    if (total === 1) return { x: -RADIUS * Math.cos(Math.PI / 4), y: -RADIUS * Math.sin(Math.PI / 4) };

    // 计算角度步长：从正上方(90度)到正左方(180度)
    // 对应弧度：-PI/2 (上) 到 -PI (左)
    const startAngle = -Math.PI / 2; 
    const endAngle = -Math.PI;
    const step = (endAngle - startAngle) / (total - 1);
    
    const angle = startAngle + (index * step);
    
    // 极坐标转直角坐标
    const x = RADIUS * Math.cos(angle);
    const y = RADIUS * Math.sin(angle);
    
    return { x, y };
  };

  return (
    <div className="fixed bottom-10 right-10 z-[90]">
      
      {/* 1. 子菜单项 (绝对定位在主按钮背后) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {menuItems.map((item, index) => {
          const pos = getPosition(index, menuItems.length);
          
          return (
            <div
              key={item.id}
              className="absolute transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)" // 贝塞尔曲线实现回弹效果
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                opacity: isOpen ? 1 : 0,
                // 关闭时稍微缩小，且没有点击事件
                pointerEvents: isOpen ? 'auto' : 'none', 
                zIndex: isOpen ? 10 : -1
              }}
            >
              <div className="relative group flex flex-col items-center">
                 {/* Tooltip (悬浮时显示) */}
                <div className={`
                    absolute -top-8 px-2 py-1 bg-slate-800 text-white text-[10px] rounded-md 
                    opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none
                    shadow-md
                    ${isOpen ? 'translate-y-0' : 'translate-y-2'}
                `}>
                    {item.label}
                    {/* 小三角 */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                </div>

                {/* 圆形按钮 */}
                <button
                  onClick={() => {
                    console.log(`Clicked ${item.label}`);
                    setIsOpen(false);
                  }}
                  className={`
                    w-11 h-11 rounded-full flex items-center justify-center text-white 
                    shadow-lg hover:scale-110 active:scale-95 transition-transform duration-200
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

      {/* 2. 主触发按钮 (保持不变，只是层级要高) */}
      <button 
        onClick={toggleMenu}
        className={`
          relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 z-50
          ${isOpen ? 'bg-slate-800 rotate-45 scale-105 shadow-slate-900/20' : 'bg-slate-900 hover:scale-110 hover:bg-orange-600 shadow-orange-500/20'}
        `}
      >
        <Plus 
          className={`w-7 h-7 text-white transition-transform duration-300`} 
          strokeWidth={2.5}
        />
        
        {!isOpen && (
           <span className="absolute -inset-1 rounded-full bg-orange-400/30 animate-ping pointer-events-none duration-1000"></span>
        )}
      </button>

      {/* 3. 遮罩层 (点击空白处关闭) */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-white/10 backdrop-blur-[1px] z-[-1] animate-in fade-in duration-300"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

    </div>
  );
}