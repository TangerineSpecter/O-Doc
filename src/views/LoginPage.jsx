import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, Mail, Lock, ArrowRight, Github } from 'lucide-react';

export default function LoginPage() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({ email: '', password: '' });

    const handleLogin = (e) => {
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
            {/* 背景装饰 */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-100/40 to-transparent pointer-events-none"></div>
            <div className="absolute -left-20 top-20 w-72 h-72 bg-orange-200/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -right-20 bottom-20 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl pointer-events-none"></div>

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
                                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                                />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600">
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

                    {/* 暂不支持此方法登录 */}
                    {/* <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">或者通过以下方式登录</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div>
                <a href="#" className="w-full inline-flex justify-center py-2.5 px-4 border border-slate-200 rounded-lg shadow-sm bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors">
                  <Github className="h-5 w-5 text-slate-900" />
                </a>
              </div>
              <div>
                <a href="#" className="w-full inline-flex justify-center py-2.5 px-4 border border-slate-200 rounded-lg shadow-sm bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors">
                  <span className="sr-only">Google</span>
                   <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                     <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .533 5.333.533 12S5.867 24 12.48 24c3.44 0 6.1-1.133 8.253-3.293 2.187-2.187 2.853-5.32 2.853-7.787 0-.76-.08-1.48-.213-2l-10.893.013z"/>
                   </svg>
                </a>
              </div>
            </div>
          </div> */}
                </div>

                <p className="mt-6 text-center text-sm text-slate-500">
                    还没有账号?{' '}
                    <a href="#" className="font-medium text-orange-600 hover:text-orange-500">
                        免费注册
                    </a>
                </p>
            </div>
        </div>
    );
}