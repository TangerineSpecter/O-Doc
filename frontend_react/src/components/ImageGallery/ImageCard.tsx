import { memo, useState } from 'react';
import { Calendar, Edit3, Eye, MapPin, Trash2 } from 'lucide-react';

interface ImageCardProps {
  imageUrl: string;
  title: string;
  shootingTime?: string;
  country?: string;
  city?: string;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ImageCard = memo(({ 
  imageUrl, 
  title, 
  shootingTime, 
  country,
  city,
  onClick,
  onEdit,
  onDelete
}: ImageCardProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const location = [country, city].filter(Boolean).join(' ');
  const shootingDate = shootingTime ? shootingTime.replace('T', ' ').slice(0, 10) : '';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative mb-5 break-inside-avoid cursor-pointer overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
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
            ${isHovered ? 'scale-[1.04]' : 'scale-100'}
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/30 bg-white/20 backdrop-blur-sm transition-transform duration-300 hover:scale-105">
              <Eye className="h-5 w-5 text-white" />
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
                className="rounded-lg bg-white/90 p-2 text-slate-700 shadow-sm transition-all hover:bg-white hover:text-orange-600"
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
                className="rounded-lg bg-white/90 p-2 text-slate-700 shadow-sm transition-all hover:bg-white hover:text-red-600"
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
      <div className="space-y-2.5 p-3.5">
        {/* Title */}
        <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-slate-800 transition-colors duration-300 group-hover:text-orange-600">
          {title}
        </h3>

        {/* Meta Info */}
        <div className="space-y-2">
          {shootingDate && (
            <div className="flex items-center gap-2 text-xs text-slate-500 group-hover:text-slate-600 transition-colors">
              <Calendar className="w-3.5 h-3.5 text-orange-400" />
              <span>{shootingDate}</span>
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
