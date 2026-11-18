const VENDOR_STATUSES = Object.freeze(["pending", "approved", "rejected"]);
const VENDOR_REVIEW_STATUSES = Object.freeze(["approved", "rejected"]);

const VENDOR_LIMITS = Object.freeze({
  storeNameMin: 2,
  storeNameMax: 100,
  descriptionMin: 20,
  descriptionMax: 1000,
});

const VENDOR_LIST_LIMITS = Object.freeze({
  defaultPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
  maxPage: 10000,
});

export {
  VENDOR_STATUSES,
  VENDOR_REVIEW_STATUSES,
  VENDOR_LIMITS,
  VENDOR_LIST_LIMITS,
};
