import { memo, useState } from 'react';
import { Calendar, Edit3, Eye, MapPin, Trash2 } from 'lucide-react';

interface ImageCardProps {
  imageUrl: string;
  title: string;
  shootingTime?: string;
  location?: string;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ImageCard = memo(({ 
  imageUrl, 
  title, 
  shootingTime, 
  location,
  onClick,
  onEdit,
  onDelete
}: ImageCardProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 cursor-pointer mb-6 break-inside-avoid"
    >
      {/* Image Container */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
        {/* Skeleton Loader */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300 animate-pulse" />
        )}
        
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          className={`
            w-full h-auto object-cover transition-all duration-700 ease-out
            ${isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}
            ${isHovered ? 'scale-110' : 'scale-100'}
          `}
        />

        {/* Hover Overlay */}
        <div 
          className={`
            absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent
            transition-opacity duration-300
            ${isHovered ? 'opacity-100' : 'opacity-0'}
          `}
        >
          {/* Center Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 transform transition-transform duration-300 hover:scale-110">
              <Eye className="w-7 h-7 text-white" />
            </div>
          </div>

          <div className="absolute right-3 top-3 flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-2 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-orange-600 shadow-sm transition-all"
                aria-label="编辑图片"
                title="编辑图片"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-2 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-red-600 shadow-sm transition-all"
                aria-label="删除图片"
                title="删除图片"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <h3 className="text-base font-semibold text-slate-800 line-clamp-2 group-hover:text-orange-600 transition-colors duration-300 leading-relaxed">
          {title}
        </h3>

        {/* Meta Info */}
        <div className="space-y-2">
          {shootingTime && (
            <div className="flex items-center gap-2 text-xs text-slate-500 group-hover:text-slate-600 transition-colors">
              <Calendar className="w-3.5 h-3.5 text-orange-400" />
              <span>{shootingTime}</span>
            </div>
          )}
          
          {location && (
            <div className="flex items-center gap-2 text-xs text-slate-500 group-hover:text-slate-600 transition-colors">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate">{location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Accent Line */}
      <div className="h-0.5 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
    </div>
  );
});

ImageCard.displayName = 'ImageCard';

export default ImageCard;
