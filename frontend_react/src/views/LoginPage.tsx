import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Leaf } from 'lucide-react';

// 1. 定义子组件的 Props 类型
interface FloatingCitrusProps {
    className?: string; // 可选
    size?: number;      // 可选
    rotation?: number;  // 可选
    delay?: number;     // 可选
}

// 2. 给子组件加上类型注解
const FloatingCitrus = ({ className, size = 200, rotation = 0, delay = 0 }: FloatingCitrusProps) => (
    <div
        className={`absolute pointer-events-none opacity-10 select-none ${className || ''}`}
        style={{
            animation: `float 6s ease-in-out infinite`,
            animationDelay: `${delay}s`
        }}
    >
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            style={{ transform: `rotate(${rotation}deg)` }}
        >
            <circle cx="50" cy="50" r="48" fill="#FDBA74" />
            <circle cx="50" cy="50" r="42" fill="#FFF7ED" />
            <circle cx="50" cy="50" r="40" fill="#FB923C" />
            <g stroke="#FFF7ED" strokeWidth="2">
                <line x1="50" y1="50" x2="50" y2="10" />
                <line x1="50" y1="50" x2="90" y2="50" />
                <line x1="50" y1="50" x2="50" y2="90" />
                <line x1="50" y1="50" x2="10" y2="50" />
                <line x1="50" y1="50" x2="22" y2="22" />
                <line x1="50" y1="50" x2="78" y2="22" />
                <line x1="50" y1="50" x2="78" y2="78" />
                <line x1="50" y1="50" x2="22" y2="78" />
            </g>
        </svg>
    </div>
);

export default function LoginPage() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    // 3. 这里的 formData 不需要显式定义接口，TS 会自动推断为 { email: string, password: string }
    const [formData, setFormData] = useState({ email: '', password: '' });

    // 4. 给表单提交事件加类型
    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // 模拟登录请求
        setTimeout(() => {
            setIsLoading(false);
            navigate('/'); // 登录成功跳转首页
        }, 800);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* 背景装饰层 */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-100/40 to-transparent pointer-events-none"></div>
            <div className="absolute -left-20 top-20 w-72 h-72 bg-orange-200/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -right-20 bottom-20 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl pointer-events-none"></div>

            <FloatingCitrus className="-top-10 -left-10 text-orange-400 opacity-20" size={260} rotation={-15} delay={0} />
            <FloatingCitrus className="bottom-10 -right-10 text-orange-300 opacity-20" size={180} rotation={30} delay={2} />
            <Leaf className="absolute top-1/4 right-20 w-12 h-12 text-lime-500/20 rotate-45 animate-pulse pointer-events-none" />
            <Leaf className="absolute bottom-1/4 left-10 w-8 h-8 text-lime-600/10 -rotate-12 animate-pulse delay-700 pointer-events-none" />

            {/* 主内容区 */}
            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="flex justify-center mb-6 cursor-pointer" onClick={() => navigate('/')}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-50 border border-orange-100 shadow-md">
                        <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
                            <path d="M12 3.5V6.5" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="12" cy="14" r="8.5" className="fill-orange-500" />
                            <path d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z" className="fill-lime-500" />
                        </svg>
                    </div>
                </div>
                <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
                    欢迎回来
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    登录您的 <span className="text-orange-600 font-bold">小橘文档</span> 账号
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                                邮箱地址
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="focus:ring-orange-500 focus:border-orange-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 transition-all"
                                    placeholder="name@company.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                                密码
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="focus:ring-orange-500 focus:border-orange-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input
                                    id="remember-me"
                                    name="remember-me"
                                    type="checkbox"
                                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded cursor-pointer"
                                />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer select-none">
                                    记住我
                                </label>
                            </div>

                            <div className="text-sm">
                                <a href="#" className="font-medium text-orange-600 hover:text-orange-500">
                                    忘记密码?
                                </a>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-all ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span className="flex items-center">
                                        立即登录 <ArrowRight className="ml-2 h-4 w-4" />
                                    </span>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                <p className="mt-6 text-center text-sm text-slate-500">
                    还没有账号?{' '}
                    <a href="#" className="font-medium text-orange-600 hover:text-orange-500">
                        免费注册
                    </a>
                </p>
            </div>

            <style>{`
                @keyframes float {
                    0% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(5deg); }
                    100% { transform: translateY(0px) rotate(0deg); }
                }
            `}</style>
        </div>
    );
}