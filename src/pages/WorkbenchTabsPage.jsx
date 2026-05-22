import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { APP_DISPLAY_NAME } from '../config/appMeta';

export default function WorkbenchTabsPage() {
  const renderServerBaseUrl = import.meta.env.VITE_RENDER_SERVER || '';

  const tabs = useMemo(
    () => [
      { to: '/workbench/psd-autofill', label: 'PSD自动填充' },
      { to: '/workbench/batch-product-images', label: '批量生成产品图' },
      { to: '/workbench/cutout-no-psd', label: '批量抠图（无PSD）' },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900/80 border-b border-white/10 px-6 py-4 sticky top-0 z-50 backdrop-blur-xl">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto gap-6">
          <div className="flex items-center gap-6 min-w-0">
            <div className="flex items-center gap-3 shrink-0">
              <BrandLogo />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-100 tracking-tight truncate">{APP_DISPLAY_NAME}</h1>
                <p className="text-xs text-gray-500 font-medium truncate">电商图自动化生成工具</p>
              </div>
            </div>

            <nav className="flex items-center gap-2 p-1 bg-black/20 border border-white/10 rounded-xl overflow-x-auto">
              {tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({ isActive }) =>
                    [
                      'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap',
                      isActive ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:text-gray-200',
                    ].join(' ')
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <a
            href="/admin"
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-gray-200 transition-colors"
            title="进入管理后台"
          >
            管理后台 <ArrowRight className="w-4 h-4 text-gray-400" />
          </a>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        <Outlet context={{ renderServerBaseUrl }} />
      </main>
    </div>
  );
}
