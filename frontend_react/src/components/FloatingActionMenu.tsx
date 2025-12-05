import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, FolderOpen, PenTool, BarChart2, Library, Leaf } from 'lucide-react';

// --- 右下角 导航菜单组件 ---

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  shadow: string;
}

interface StateRef {
  isOpen: boolean;
  starAnimState: string;
  isWinking: boolean;
}

interface EyePos {
  x: number;
  y: number;
}

export default function FloatingActionMenu() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isWinking, setIsWinking] = useState<boolean>(false);
  // 'idle' | 'throwing' | 'falling' | 'bounce'
  const [starAnimState, setStarAnimState] = useState<string>('idle');
  const [showBonk, setShowBonk] = useState<boolean>(false); // 控制 Bonk 文字显示
  const [eyePos, setEyePos] = useState<EyePos>({ x: 0, y: 0 });

  // 解决闭包陷阱
  const stateRef = useRef<StateRef>({ isOpen, starAnimState, isWinking });
  useEffect(() => {
    stateRef.current = { isOpen, starAnimState, isWinking };
  }, [isOpen, starAnimState, isWinking]);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const RADIUS_FAR = 135;
  const RADIUS_NEAR = 85;

  const menuItems: MenuItem[] = [
    { id: 'stats', label: '数据统计', icon: <BarChart2 className="w-5 h-5" />, color: 'bg-emerald-400', shadow: 'shadow-emerald-400/40' },
    { id: 'whiteboard', label: '灵感白板', icon: <PenTool className="w-5 h-5" />, color: 'bg-pink-400', shadow: 'shadow-pink-400/40' },
    { id: 'resources', label: '资源库', icon: <Library className="w-5 h-5" />, color: 'bg-sky-400', shadow: 'shadow-sky-400/40' },
    { id: 'categories', label: '分类管理', icon: <FolderOpen className="w-5 h-5" />, color: 'bg-orange-400', shadow: 'shadow-orange-400/40' },
    { id: 'tags', label: '标签管理', icon: <Tag className="w-5 h-5" />, color: 'bg-indigo-400', shadow: 'shadow-indigo-400/40' },
  ];

  const toggleMenu = () => setIsOpen(!isOpen);

  const handleItemClick = (item: MenuItem) => {
    if (item.id === 'resources') navigate('/resources');
    else if (item.id === 'stats') navigate('/stats');
    else if (item.id === 'tags') navigate('/tags');
    else if (item.id === 'categories') navigate('/categories');
    setIsOpen(false);
  };

  const getPosition = (index: number, total: number) => {
    if (!isOpen) return { x: 0, y: 0 };
    const startAngle = -Math.PI / 2;
    const endAngle = -Math.PI;
    const step = (endAngle - startAngle) / (total - 1);
    const angle = startAngle + (index * step);
    const currentRadius = index % 2 === 0 ? RADIUS_FAR : RADIUS_NEAR;
    return { x: currentRadius * Math.cos(angle), y: currentRadius * Math.sin(angle) };
  };

  // --- 1. 眼神跟随 ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { isOpen: _isOpen, starAnimState: _starState } = stateRef.current;
      if (_isOpen || !buttonRef.current || _starState !== 'idle') {
        setEyePos({ x: 0, y: 0 });
        return;
      }
      const rect = buttonRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const distance = Math.min(3, Math.hypot(e.clientX - centerX, e.clientY - centerY) / 20);
      setEyePos({ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // --- 2. 大脑循环 (50/50 概率) ---
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const scheduleNextAction = () => {
      const waitTime = Math.random() * 3000 + 2000; // 2-5秒间隔
      timer = setTimeout(() => {
        const { isOpen: _isOpen, starAnimState: _starState } = stateRef.current;
        if (_isOpen || _starState !== 'idle') {
          scheduleNextAction();
          return;
        }

        // 50% 概率二选一
        const rand = Math.random();
        if (rand < 0.5) {
          triggerStarSequence(scheduleNextAction);
        } else {
          setIsWinking(true);
          setTimeout(() => {
            setIsWinking(false);
            scheduleNextAction();
          }, 800);
        }
      }, waitTime);
    };
    scheduleNextAction();
    return () => clearTimeout(timer);
  }, []);

  // --- 3. 星星动画序列 (含 Bonk!) ---
  const triggerStarSequence = (onComplete?: () => void) => {
    if (stateRef.current.starAnimState !== 'idle') return;

    setStarAnimState('throwing'); // 0ms: 丢出

    setTimeout(() => {
      setStarAnimState('falling'); // 600ms: 下落
    }, 600);

    setTimeout(() => {
      setStarAnimState('bounce'); // 900ms: 砸中!
      setShowBonk(true);          // 显示 Bonk 文字
    }, 900);

    setTimeout(() => {
      setStarAnimState('idle');   // 1700ms: 结束
      setShowBonk(false);         // 隐藏文字
      if (onComplete) onComplete();
    }, 1700);
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (stateRef.current.starAnimState === 'idle') triggerStarSequence();
  };

  return (
    <div className="fixed bottom-10 right-10 z-[90]">

      <style>{`
        @keyframes leaf-sway { 0%, 100% { transform: rotate(12deg); } 50% { transform: rotate(22deg); } }
        @keyframes pop-star { 0% { transform: scale(0) rotate(0deg); opacity: 0; } 50% { transform: scale(1.2) rotate(180deg); opacity: 1; } 100% { transform: scale(0) rotate(360deg); opacity: 0; } }

        /* 星星轨迹动画 */
        @keyframes star-throw {
            0% { transform: translate(-10px, 10px) scale(0); opacity: 0; }
            40% { opacity: 1; }
            100% { transform: translate(0px, -60px) scale(1) rotate(180deg); opacity: 1; }
        }
        @keyframes star-fall-hit {
            0% { transform: translate(0px, -60px) rotate(180deg); animation-timing-function: ease-in; }
            100% { transform: translate(0px, -15px) rotate(360deg); }
        }
        @keyframes star-bounce-drop {
            0% { transform: translate(0px, -15px) rotate(0deg); animation-timing-function: ease-out; }
            30% { transform: translate(30px, -45px) rotate(180deg); animation-timing-function: ease-in; }
            100% { transform: translate(60px, 80px) rotate(720deg); opacity: 0; }
        }
        
        /* 身体受击挤压 */
        @keyframes body-bonk {
            0%, 100% { transform: scale(1); }
            30% { transform: scale(1.15, 0.85) translateY(4px); }
            60% { transform: scale(0.95, 1.05) translateY(-2px); }
        }

        /* === Bonk! 文字飘动动画 === */
        @keyframes bonk-float {
            0% { opacity: 0; transform: translate(10px, -10px) scale(0.5) rotate(-10deg); }
            20% { opacity: 1; transform: translate(0px, -25px) scale(1.2) rotate(-20deg); } /* 突然出现 */
            100% { opacity: 0; transform: translate(-40px, -60px) scale(1) rotate(-45deg); } /* 向左上飘走渐隐 */
        }
      `}</style>

      {/* 装饰线条 */}
      <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ zIndex: 0 }}>
        {menuItems.map((_, index) => {
          const pos = getPosition(index, menuItems.length);
          return (
            <line key={`line-${index}`} x1={0} y1={0} x2={pos.x} y2={pos.y} stroke={isOpen ? "#cbd5e1" : "transparent"} strokeWidth="2" strokeDasharray="6 6" strokeLinecap="round" className="transition-all duration-500 ease-out" style={{ opacity: isOpen ? 0.3 : 0, transitionDelay: isOpen ? '50ms' : '0ms' }} />
          )
        })}
      </svg>

      {/* 子菜单 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {menuItems.map((item, index) => {
          const pos = getPosition(index, menuItems.length);
          return (
            <div key={item.id} className="absolute transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)" style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none', zIndex: isOpen ? 10 : -1, transitionDelay: isOpen ? `${index * 40}ms` : '0ms' }}>
              <div className="relative group flex flex-col items-center">
                <div className={`absolute -top-10 px-3 py-1.5 bg-slate-700 text-white text-xs font-bold rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none shadow-xl scale-90 group-hover:scale-100 z-20 tracking-wide ${isOpen ? 'translate-y-0' : 'translate-y-2'}`}>{item.label}</div>
                <button onClick={() => handleItemClick(item)} className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 border-[3px] border-white ${item.color} ${item.shadow}`}>{item.icon}</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- 主按钮 --- */}
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        onDoubleClick={handleDoubleClick}
        className={`
          relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 z-50 group
          ${isOpen ? 'scale-110' : 'hover:scale-105 active:scale-95'}
        `}
        style={{
          boxShadow: isOpen ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 10px 30px -5px rgba(251, 146, 60, 0.6), 0 5px 10px -3px rgba(234, 88, 12, 0.3)'
        }}
      >

        {/* 呼吸波纹 */}
        {!isOpen && starAnimState === 'idle' && (
          <>
            <span className="absolute -inset-1 rounded-full border border-orange-400/40 animate-ping opacity-75" style={{ animationDuration: '2s' }}></span>
            <span className="absolute -inset-1 rounded-full border border-orange-300/20 animate-ping opacity-75" style={{ animationDuration: '2s', animationDelay: '0.6s' }}></span>
          </>
        )}

        {/* 橘子主体 */}
        <div
          className={`
            absolute inset-0 rounded-full overflow-hidden transition-all duration-500
            ${isOpen ? 'bg-white ring-4 ring-orange-100' : ''}
          `}
          style={{
            background: isOpen ? '#fff' : 'linear-gradient(135deg, #fbbf24 0%, #fb923c 40%, #ea580c 100%)',
            animation: starAnimState === 'bounce' ? 'body-bonk 0.4s ease-out' : 'none'
          }}
        >
          {!isOpen && (
            <>
              <div className="absolute top-0 left-1/4 w-1/2 h-3/4 bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[2px]"></div>
              <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-orange-300/30 to-transparent mix-blend-screen"></div>
            </>
          )}
        </div>

        {/* 叶子 */}
        <div className={`absolute -top-3 -right-2 z-20 transition-all duration-500 origin-bottom-left ${isOpen ? 'opacity-0 scale-0' : 'opacity-100 scale-100'}`} style={{ animation: !isOpen ? 'leaf-sway 3s ease-in-out infinite alternate' : 'none' }}>
          <Leaf className="w-9 h-9 text-lime-500 fill-lime-400 drop-shadow-sm" strokeWidth={2} />
        </div>

        {/* === 表情层 === */}
        <div className="relative z-30 w-full h-full flex items-center justify-center pointer-events-none">
          {/* Menu Icon */}
          <svg className={`absolute w-8 h-8 text-slate-600 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /><path d="M7 13s1.5 3 5 3 5-3 5-3" />
          </svg>

          {/* Anime Face */}
          <div className={`absolute w-full h-full flex items-center justify-center transition-all duration-300 ${isOpen ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`}>

            {/* 状态 1: 痛苦 (>_<) */}
            {(starAnimState === 'falling' || starAnimState === 'bounce') ? (
              <svg viewBox="0 0 64 64" className="w-12 h-12">
                <path d="M12 30 L20 36 L12 42" fill="none" stroke="#451a03" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M52 30 L44 36 L52 42" fill="none" stroke="#451a03" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M24 50 Q 28 46, 32 50 Q 36 54, 40 50" fill="none" stroke="#451a03" strokeWidth="3" strokeLinecap="round" />
                <path d="M56 20 Q 58 24, 54 28" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
              </svg>
            ) : isWinking && starAnimState === 'idle' ? (
              // 状态 2: Wink
              <div className="relative w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 64 64" className="w-12 h-12">
                  <path d="M12 34 Q 18 30, 24 34" fill="none" stroke="#451a03" strokeWidth="3.5" strokeLinecap="round" />
                  <g transform="translate(36, 26)"><ellipse cx="6" cy="8" rx="6" ry="8" fill="#451a03" /><circle cx="3.5" cy="4.5" r="2.5" fill="white" /><circle cx="7" cy="10" r="1.5" fill="white" opacity="0.4" /></g>
                  <path d="M26 46 Q29 49 32 46 Q35 49 38 46" fill="none" stroke="#451a03" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 42 l4 -4 m-2 6 l4 -4" stroke="#f87171" strokeWidth="2" opacity="0.6" /><path d="M48 42 l4 -4 m-2 6 l4 -4" stroke="#f87171" strokeWidth="2" opacity="0.6" />
                </svg>
                <svg viewBox="0 0 24 24" className="absolute top-2 left-1 w-5 h-5 text-yellow-300 drop-shadow-sm" style={{ animation: 'pop-star 0.6s ease-out forwards' }}><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </div>
            ) : (
              // 状态 3: Normal
              <svg viewBox="0 0 64 64" className="w-12 h-12">
                <g style={{ transform: `translate(${eyePos.x}px, ${eyePos.y}px)`, transition: 'transform 0.1s ease-out' }}>
                  <g transform="translate(10, 26)"><ellipse cx="6" cy="8" rx="6" ry="8" fill="#451a03" /><circle cx="3.5" cy="4.5" r="2.5" fill="white" /><circle cx="7" cy="10" r="1.5" fill="white" opacity="0.4" /></g>
                  <g transform="translate(38, 26)"><ellipse cx="6" cy="8" rx="6" ry="8" fill="#451a03" /><circle cx="3.5" cy="4.5" r="2.5" fill="white" /><circle cx="7" cy="10" r="1.5" fill="white" opacity="0.4" /></g>
                </g>
                <path d="M26 46 Q29 49 32 46 Q35 49 38 46" fill="none" stroke="#451a03" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <g opacity="0.6" stroke="#f87171" strokeWidth="2" strokeLinecap="round"><path d="M5 40 L9 36" /><path d="M9 40 L13 36" /><path d="M51 40 L55 36" /><path d="M55 40 L59 36" /></g>
              </svg>
            )}
          </div>
        </div>

        {/* === Bonk! 漫画字特效 === */}
        {showBonk && (
          <div
            className="absolute top-0 right-0 z-[60] text-xl font-black text-red-500 pointer-events-none"
            style={{
              fontFamily: '"Comic Sans MS", "Chalkboard SE", sans-serif', // 漫画字体兜底
              textShadow: '2px 2px 0px white, -1px -1px 0px white, 1px -1px 0px white, -1px 1px 0px white, 1px 1px 0px white', // 白色描边
              animation: 'bonk-float 0.8s ease-out forwards'
            }}
          >
            Bonk!
          </div>
        )}

        {/* === 星星 === */}
        {starAnimState !== 'idle' && (
          <svg viewBox="0 0 24 24" className="absolute w-6 h-6 text-yellow-400 drop-shadow-md z-40 pointer-events-none" style={{
            animation:
              starAnimState === 'throwing' ? 'star-throw 0.6s ease-out forwards' :
                starAnimState === 'falling' ? 'star-fall-hit 0.3s linear forwards' :
                  starAnimState === 'bounce' ? 'star-bounce-drop 0.8s forwards' : 'none'
          }}>
            <path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        )}

      </button>

      {/* 全屏遮罩 */}
      {isOpen && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-[3px] z-[-1] animate-in fade-in duration-300" onClick={() => setIsOpen(false)}></div>
      )}

    </div>
  );
}
