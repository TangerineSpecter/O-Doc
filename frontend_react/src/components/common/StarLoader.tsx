const StarLoader = () => {
    return (
        <div className="flex items-center justify-center p-4">
            <style>{`
        .loader {
          height: 40px; /* 增加高度容器，确保容纳光晕 */
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .loader > div {
          /* 核心修改：直接设置为 20px (视觉真实大小)，不再使用 scale(2) 放大 */
          width: 20px;
          height: 20px;
          border-radius: 100%;
          box-shadow: 0 0 10px #f97316; /* 橙色光晕 */
          background: #ffedd5; /* 浅橙色背景 */
          margin: 0 6px; /* 调整间距 */
          /* 初始状态为 1 (原大)，动画变成 0.5 (缩小) */
          transform: scale(1);
        }

        .loader > div:nth-child(1) {
          animation: anm-BL-53-move 1s infinite linear;
        }

        .loader > div:nth-child(2) {
          animation: anm-BL-53-move 1s infinite linear;
          animation-delay: 0.2s;
        }

        .loader > div:nth-child(3) {
          animation: anm-BL-53-move 1s infinite linear;
          animation-delay: 0.3s;
        }

        .loader > div:nth-child(4) {
          animation: anm-BL-53-move 1s infinite linear;
          animation-delay: 0.4s;
        }

        .loader > div:nth-child(5) {
          animation: anm-BL-53-move 1s infinite linear;
          animation-delay: 0.5s;
        }

        @keyframes anm-BL-53-move {
          0%, 100% {
            background: #ffedd5;
            transform: scale(1); /* 保持原大 */
          }
          50% {
            background: #f97316; /* 高亮变深橙色 */
            transform: scale(0.5); /* 缩小至一半 */
          }
        }
      `}</style>

            <div className="loader">
                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div></div>
            </div>
        </div>
    );
};

export default StarLoader;