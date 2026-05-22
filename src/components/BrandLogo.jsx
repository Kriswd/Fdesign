import { APP_LOGO_SRC } from '../config/appMeta';

export default function BrandLogo() {
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-950/70 border border-cyan-300/25 shadow-lg shadow-cyan-500/15 overflow-hidden">
      <img
        src={APP_LOGO_SRC}
        alt="闪图产品标识"
        className="w-8 h-8 object-contain"
        draggable="false"
      />
    </div>
  );
}
