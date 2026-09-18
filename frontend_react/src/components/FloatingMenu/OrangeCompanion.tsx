import {StarCharm} from './StarCharm';
import {useCompanionAnimation} from './useCompanionAnimation';
import spriteSheet from '../../assets/companion/orange-girl-actions.png';
import './orange-companion.css';

interface OrangeCompanionProps {
    isOpen: boolean;
    playRequest: number;
    hovered: boolean;
}

export function OrangeCompanion({isOpen, playRequest, hovered}: OrangeCompanionProps) {
    const {frame, playing, manual, cycle} = useCompanionAnimation(isOpen, playRequest);
    const visibleFrame = hovered && frame === 0 && !isOpen && !playing ? 2 : frame;

    return (
        <span className="orange-girl" data-playing={playing} data-manual={manual} data-happy={isOpen} aria-hidden="true">
            <span className="orange-girl__ground"/>
            <span className="orange-girl__motion" key={`girl-${cycle}`}>
                <span className="orange-girl__frame">
                    <img src={spriteSheet} alt="" draggable={false} style={{
                        left: `${(visibleFrame % 4) * -100}%`,
                        top: `${Math.floor(visibleFrame / 4) * -100}%`,
                    }}/>
                </span>
            </span>
            {playing && <span key={`effects-${cycle}`} className="orange-girl__effects">
                <StarCharm className="orange-girl__star"/>
                <span className="orange-girl__bonk">Bonk!</span>
                <span className="orange-girl__impact">✦</span><span className="orange-girl__impact orange-girl__impact--second">✧</span>
            </span>}
        </span>
    );
}
