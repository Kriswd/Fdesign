import { ShoppingBag } from 'lucide-react';
import {
  APP_SHOP_LINK_ENABLED,
  APP_SHOP_LINK_LABEL,
  APP_SHOP_LINK_TITLE,
  APP_SHOP_URL,
} from '../config/appMeta';

export default function ShopLinkButton() {
  if (!APP_SHOP_LINK_ENABLED) return null;

  return (
    <a
      href={APP_SHOP_URL}
      target="_blank"
      rel="noreferrer"
      title={APP_SHOP_LINK_TITLE}
      aria-label={APP_SHOP_LINK_TITLE}
      className="shrink-0 inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 shadow-lg shadow-emerald-500/10 transition-colors hover:border-emerald-200/50 hover:bg-emerald-400/20"
    >
      <ShoppingBag className="h-4 w-4 text-emerald-300" />
      <span className="hidden sm:inline">{APP_SHOP_LINK_LABEL}</span>
    </a>
  );
}
