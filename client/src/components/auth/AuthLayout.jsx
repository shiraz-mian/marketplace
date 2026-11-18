import { useEffect } from "react";
import { MarketplaceBrand } from "../MarketplaceBrand.jsx";
import { RegistrationArtwork } from "../RegistrationArtwork.jsx";
import { EYEBROW_CLASSES } from "./authStyles.js";

const AuthLayout = ({ title, eyebrow, description, children }) => {
  useEffect(() => {
    document.title = `${title} | Marketplace`;
  }, [title]);

  return (
    <div className="min-h-svh px-5 max-[360px]:px-3 min-[721px]:px-6">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-5 border-b border-line py-[23px] min-[721px]:py-[30px]">
        <MarketplaceBrand />
        <p className="hidden text-[13px] text-[#5c6a61] min-[721px]:block">
          Made for your everyday.
        </p>
      </header>
      <main className="mx-auto my-7 max-w-[460px] min-[721px]:my-[42px] min-[721px]:grid min-[721px]:max-w-[1040px] min-[721px]:grid-cols-[minmax(0,1fr)_minmax(0,460px)] min-[721px]:items-center min-[721px]:gap-[35px] min-[901px]:gap-[72px]">
        <aside
          className="hidden py-3 min-[721px]:block"
          aria-label="About Marketplace"
        >
          <span className={EYEBROW_CLASSES}>Good finds start here</span>
          <p className="mt-[22px] text-[49px] leading-[1.06] font-bold tracking-[-3px] text-[#203f36] min-[901px]:text-[clamp(46px,5vw,65px)]">
            More choice.
            <br />
            <span className="text-accent">More you.</span>
          </p>
          <p className="mt-[22px] max-w-[350px] text-base leading-[1.75] text-[#5c6a61]">
            A place for everyday essentials, unexpected discoveries, and
            everything in between.
          </p>
          <RegistrationArtwork />
          <p className="mt-2 text-xs text-[#5c6a61]">
            A little discovery goes a long way.
          </p>
        </aside>
        <section
          className="rounded-[18px] border border-[#e0e5dc] bg-white px-6 py-[29px] shadow-[0_12px_36px_#264e3810] max-[360px]:px-[19px] max-[360px]:py-[26px] min-[721px]:p-[30px] min-[901px]:p-[38px]"
          aria-labelledby="auth-title"
        >
          <span className={EYEBROW_CLASSES}>{eyebrow}</span>
          <h1
            className="mt-2.5 mb-2 text-[29px] leading-[1.2] font-bold tracking-[-1.1px] text-[#1e342c] max-[360px]:text-[26px] min-[721px]:text-[31px]"
            id="auth-title"
          >
            {title}
          </h1>
          <p className="text-sm text-muted">{description}</p>
          {children}
        </section>
      </main>
      <footer className="mx-auto max-w-80 pt-1 pb-7 text-center text-[11px] leading-[1.7] text-[#687269] min-[721px]:max-w-none min-[721px]:leading-[normal]">
        Marketplace · Small discoveries. Everyday possibilities.
      </footer>
    </div>
  );
};

export { AuthLayout };
