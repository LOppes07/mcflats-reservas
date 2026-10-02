import { useEffect, useState } from 'react';
import { css, Box } from './css';

/**
 * Carrossel de fotos em tela cheia. Abre ao clicar na imagem do imóvel; passa pro
 * lado com setas, teclado (← →) e swipe no celular. A foto aparece INTEIRA
 * (object-fit:contain), sem corte — resolve o "zoom" do hero recortado.
 */
export function Lightbox({ images, index, onClose, onIndex }: {
  images: string[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const n = images.length;
  const go = (d: number) => onIndex((index + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [index, n]);

  const [touchX, setTouchX] = useState<number | null>(null);

  return (
    <div
      style={css('position:fixed; inset:0; z-index:100; background:rgba(8,15,26,.95); display:flex; flex-direction:column; animation:fadeIn .2s ease both;')}
      onClick={onClose}
      role="dialog"
      aria-label="Galeria de fotos"
    >
      <div style={css('display:flex; align-items:center; justify-content:space-between; padding:16px 20px;')}>
        <span style={css("font:600 14px/1 'Manrope',sans-serif; color:rgba(255,255,255,.85);")}>{index + 1} / {n}</span>
        <Box onClick={onClose} aria-label="Fechar" style="width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,.14); display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; font:300 26px/1 system-ui,sans-serif;" hover="background:rgba(255,255,255,.28);">×</Box>
      </div>

      <div
        style={css('flex:1; position:relative; display:flex; align-items:center; justify-content:center; padding:0 8px 22px; min-height:0;')}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX != null) { const dx = e.changedTouches[0].clientX - touchX; if (dx < -45) go(1); else if (dx > 45) go(-1); }
          setTouchX(null);
        }}
      >
        <Box onClick={() => go(-1)} aria-label="Foto anterior" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); z-index:2; width:50px; height:50px; border-radius:50%; background:rgba(255,255,255,.16); display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; font:400 30px/1 serif; padding-bottom:3px;" hover="background:rgba(255,255,255,.3);">‹</Box>
        <img src={images[index]} alt={`Foto ${index + 1}`} style={css('max-width:100%; max-height:100%; object-fit:contain; border-radius:8px; user-select:none;')} />
        <Box onClick={() => go(1)} aria-label="Próxima foto" style="position:absolute; right:14px; top:50%; transform:translateY(-50%); z-index:2; width:50px; height:50px; border-radius:50%; background:rgba(255,255,255,.16); display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; font:400 30px/1 serif; padding-bottom:3px;" hover="background:rgba(255,255,255,.3);">›</Box>
      </div>
    </div>
  );
}
