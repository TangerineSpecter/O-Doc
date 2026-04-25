import { useEffect, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Plus } from 'lucide-react';
import ImageCard from '../components/ImageGallery/ImageCard';
import ImageViewer from '../components/ImageGallery/ImageViewer';
import ImageUploadModal from '../components/ImageGallery/ImageUploadModal';
import { getAnthologyDetail, Anthology } from '../api/anthology';
import { deleteImage, getImagesByAnthology, Image } from '../api/image';
import { getIconComponent } from '../constants/iconList';
import StarLoader from '../components/common/StarLoader';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { useToast } from '../components/common/ToastProvider';

interface ImageAnthologyPageProps {
  onNavigate?: (viewName: string, params?: any) => void;
  collId?: string;
  title?: string;
}

export default function ImageAnthologyPage({ onNavigate, collId, title }: ImageAnthologyPageProps) {
  const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<Image | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Image | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (collId) {
      loadAnthologyData();
    }
  }, [collId]);

  const loadAnthologyData = async () => {
    if (!collId) return;
    
    try {
      setLoading(true);

      // 并行获取文集详情和图片列表
      const [anthologyData, imagesData] = await Promise.all([
        getAnthologyDetail(collId),
        getImagesByAnthology(collId)
      ]);

      setAnthologyInfo(anthologyData);

      setImages(imagesData);
    } catch (error) {
      console.error('加载图片文集失败:', error);
    } finally {
      setLoading(false);
    }
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

  const handleOpenCreateModal = () => {
    setEditingImage(null);
    setIsUploadModalOpen(true);
  };

  const handleOpenEditModal = (image: Image) => {
    setEditingImage(image);
    setIsUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false);
    setEditingImage(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteImage(deleteTarget.imageId);
      toast.success('图片已删除');
      setDeleteTarget(null);
      await loadAnthologyData();
    } catch (error) {
      console.error('删除图片失败:', error);
      toast.error('删除失败，请重试');
    }
  };

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
                onClick={handleOpenCreateModal}
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
      <div className="mx-auto max-w-[1480px] px-5 py-7 lg:px-6">
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
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">
            {images.map((image, index) => (
              <div
                key={image.imageId}
                className="break-inside-avoid animate-fade-in-up"
                style={{
                  animationDelay: `${index * 60}ms`,
                  animationFillMode: 'both'
                }}
              >
                <ImageCard
                  imageUrl={image.imageUrl}
                  title={image.title}
                  shootingTime={image.shootingTimeStr}
                  country={image.country}
                  city={image.city}
                  onClick={() => handleImageClick(index)}
                  onEdit={() => handleOpenEditModal(image)}
                  onDelete={() => setDeleteTarget(image)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Viewer Modal */}
      <ImageViewer
        isOpen={selectedIndex !== null}
        image={selectedIndex !== null ? {
          imageUrl: images[selectedIndex].imageUrl,
          title: images[selectedIndex].title,
          description: images[selectedIndex].description,
          shootingTime: images[selectedIndex].shootingTimeStr,
          country: images[selectedIndex].country,
          city: images[selectedIndex].city,
          tags: images[selectedIndex].tagsList,
          author: images[selectedIndex].author,
          createdAt: images[selectedIndex].createdAt
        } : null}
        onClose={handleCloseViewer}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={selectedIndex !== null && selectedIndex > 0}
        hasNext={selectedIndex !== null && selectedIndex < images.length - 1}
      />

      {/* Upload Modal */}
      <ImageUploadModal
        isOpen={isUploadModalOpen}
        onClose={handleCloseUploadModal}
        collId={collId || ''}
        initialData={editingImage}
        onSuccess={() => {
          loadAnthologyData();
        }}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="确认删除图片?"
        description={
          <span>
            确定要删除图片<strong className="text-red-600">「{deleteTarget?.title}」</strong>吗？此操作无法恢复。
          </span>
        }
        confirmText="确认删除"
        type="danger"
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
