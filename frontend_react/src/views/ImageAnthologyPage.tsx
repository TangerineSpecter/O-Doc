import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Image as ImageIcon, Plus } from 'lucide-react';
import ImageCard from '../components/ImageGallery/ImageCard';
import ImageViewer from '../components/ImageGallery/ImageViewer';
import ImageUploadModal from '../components/ImageGallery/ImageUploadModal';
import { getAnthologyDetail, Anthology } from '../api/anthology';
import { getIconComponent } from '../constants/iconList';
import StarLoader from '../components/common/StarLoader';

interface ImageItem {
  articleId: string;
  title: string;
  imageUrl: string;
  description?: string;
  shootingTime?: string;
  location?: string;
  tags?: string[];
  author?: string;
  createdAt?: string;
}

interface ImageAnthologyPageProps {
  onNavigate?: (viewName: string, params?: any) => void;
  collId?: string;
  title?: string;
}

export default function ImageAnthologyPage({ onNavigate, collId, title }: ImageAnthologyPageProps) {
  const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  useEffect(() => {
    if (collId) {
      loadAnthologyData();
    }
  }, [collId]);

  const loadAnthologyData = async () => {
    if (!collId) return;
    
    try {
      setLoading(true);
      const data = await getAnthologyDetail(collId);
      setAnthologyInfo(data);
      
      // 将 articles 转换为 ImageItem 格式
      // 注意：这里需要根据实际的数据结构进行调整
      const imageList: ImageItem[] = (data.articles || []).map((article: any) => ({
        articleId: article.articleId,
        title: article.title,
        imageUrl: article.imageUrl || extractImageFromContent(article.content) || '',
        description: article.description || extractDescription(article.content),
        shootingTime: article.shootingTime || extractShootingTime(article.content),
        location: article.location || extractLocation(article.content),
        tags: article.tags || extractTags(article.content),
        author: article.author,
        createdAt: article.date || article.created_at
      }));

      setImages(imageList);
    } catch (error) {
      console.error('加载图片文集失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 从 content 中提取图片 URL（假设使用 Markdown 图片语法）
  const extractImageFromContent = (content?: string): string => {
    if (!content) return '';
    const match = content.match(/!\[.*?\]\((.*?)\)/);
    return match ? match[1] : '';
  };

  // 从 content 中提取描述
  const extractDescription = (content?: string): string => {
    if (!content) return '';
    // 移除图片语法，返回剩余文本
    const withoutImages = content.replace(/!\[.*?\]\(.*?\)/g, '');
    return withoutImages.trim().substring(0, 500);
  };

  // 从 content 中提取拍摄时间（假设格式为 <shooting_time>xxx</shooting_time>）
  const extractShootingTime = (content?: string): string => {
    if (!content) return '';
    const match = content.match(/<shooting_time>(.*?)<\/shooting_time>/);
    return match ? match[1] : '';
  };

  // 从 content 中提取地点
  const extractLocation = (content?: string): string => {
    if (!content) return '';
    const match = content.match(/<location>(.*?)<\/location>/);
    return match ? match[1] : '';
  };

  // 从 content 中提取标签
  const extractTags = (content?: string): string[] => {
    if (!content) return [];
    const match = content.match(/<tags>(.*?)<\/tags>/);
    return match ? match[1].split(',').map(t => t.trim()) : [];
  };

  const handleBack = () => {
    if (onNavigate) {
      onNavigate('home');
    }
  };

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
  };

  const handleCloseViewer = () => {
    setSelectedIndex(null);
  };

  const handlePrevious = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  // 瀑布流：将图片分成两列
  const { leftColumn, rightColumn } = useMemo(() => {
    const left: ImageItem[] = [];
    const right: ImageItem[] = [];
    
    images.forEach((image, index) => {
      if (index % 2 === 0) {
        left.push(image);
      } else {
        right.push(image);
      }
    });
    
    return { leftColumn: left, rightColumn: right };
  }, [images]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-orange-50 flex-col">
        <StarLoader />
        <span className="text-sm text-slate-500 mt-4 font-medium">正在加载图片...</span>
      </div>
    );
  }

  const displayTitle = anthologyInfo?.title || title || '图片文集';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left Section */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors group"
                aria-label="返回"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600 group-hover:text-orange-600 transition-colors" />
              </button>
              
              <div className="flex items-center gap-3">
                {anthologyInfo && (
                  <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100">
                    {getIconComponent(anthologyInfo.iconId, 'w-5 h-5')}
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-slate-900 leading-tight">
                    {displayTitle}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {images.length} 张图片
                  </p>
                </div>
              </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95"
                aria-label="添加图片"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加图片</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Empty State */}
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              暂无图片
            </h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
              这个图片文集还没有上传任何图片
            </p>
          </div>
        ) : (
          /* Masonry Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              {leftColumn.map((image, index) => (
                <div
                  key={image.articleId}
                  className="animate-fade-in-up"
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: 'both'
                  }}
                >
                  <ImageCard
                    imageUrl={image.imageUrl}
                    title={image.title}
                    shootingTime={image.shootingTime}
                    location={image.location}
                    onClick={() => handleImageClick(images.indexOf(image))}
                  />
                </div>
              ))}
            </div>

            {/* Right Column */}
            <div className="space-y-6 md:mt-12">
              {rightColumn.map((image, index) => (
                <div
                  key={image.articleId}
                  className="animate-fade-in-up"
                  style={{
                    animationDelay: `${(index + 1) * 100}ms`,
                    animationFillMode: 'both'
                  }}
                >
                  <ImageCard
                    imageUrl={image.imageUrl}
                    title={image.title}
                    shootingTime={image.shootingTime}
                    location={image.location}
                    onClick={() => handleImageClick(images.indexOf(image))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Image Viewer Modal */}
      <ImageViewer
        isOpen={selectedIndex !== null}
        image={selectedIndex !== null ? images[selectedIndex] : null}
        onClose={handleCloseViewer}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={selectedIndex !== null && selectedIndex > 0}
        hasNext={selectedIndex !== null && selectedIndex < images.length - 1}
      />

      {/* Upload Modal */}
      <ImageUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        collId={collId || ''}
        onSuccess={() => {
          loadAnthologyData();
        }}
      />

      {/* Animation Styles */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}
