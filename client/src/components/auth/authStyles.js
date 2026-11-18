const INPUT_CLASSES = [
  "block min-h-[49px] w-full rounded-[7px] border border-input-border bg-white px-3.5 py-3 text-sm text-ink",
  "transition-[border-color,box-shadow] duration-[120ms] placeholder:text-[#778278]",
  "focus:border-[#315e4e] focus:outline-2 focus:outline-offset-1 focus:outline-[#315e4e]/15",
  "aria-invalid:border-[#b93a32] disabled:bg-[#f5f7f3] motion-reduce:transition-none",
].join(" ");
const LABEL_CLASSES = "mb-2 block text-[13px] font-[650] text-[#2c3e34]";
const FIELD_ERROR_CLASSES =
  "mt-[7px] text-xs text-danger [overflow-wrap:anywhere]";
const EYEBROW_CLASSES =
  "text-[11px] font-[750] tracking-[1.7px] text-[#557368] uppercase";
const SUBMIT_CLASSES =
  "mt-[26px] flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-[7px] border border-brand bg-brand px-[19px] py-[13px] text-sm font-[650] text-white transition-colors duration-[120ms] enabled:hover:bg-brand-hover disabled:cursor-wait disabled:opacity-80 motion-reduce:transition-none";
const PASSWORD_TOGGLE_CLASSES =
  "absolute top-1 right-1 min-h-[41px] min-w-[54px] rounded-[5px] px-2.5 text-xs font-[650] text-[#365c49] enabled:hover:bg-[#f0f4ec]";
const LINK_CLASSES =
  "rounded text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";
const SPINNER_CLASSES =
  "size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none";

export {
  INPUT_CLASSES,
  LABEL_CLASSES,
  FIELD_ERROR_CLASSES,
  EYEBROW_CLASSES,
  SUBMIT_CLASSES,
  PASSWORD_TOGGLE_CLASSES,
  LINK_CLASSES,
  SPINNER_CLASSES,
};
