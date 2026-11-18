import { Link } from "react-router";

const MarketplaceBrand = () => (
  <Link
    to="/"
    className="flex items-center gap-[11px] rounded text-[23px] font-[750] tracking-[-0.8px] text-[#204c42] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    aria-label="Marketplace home"
  >
    <svg
      className="size-7"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor" />
      <rect x="18" y="2" width="12" height="12" rx="3" fill="currentColor" />
      <rect x="2" y="18" width="12" height="12" rx="3" fill="currentColor" />
      <rect x="18" y="18" width="12" height="12" rx="3" fill="#c36b48" />
    </svg>
    <span>Marketplace</span>
  </Link>
);

export { MarketplaceBrand };
