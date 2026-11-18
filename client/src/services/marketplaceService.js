import { apiClient, protectedApiClient } from "../api/apiClient.js";
import { getCatalogSearch } from "./catalogRequest.js";

const readData = ({ data, status }) => {
  if (![200, 201].includes(status) || data?.success !== true || !data.data)
    throw new Error("Unexpected API response.");
  return data.data;
};

const readList = (response, field) => {
  const data = readData(response);
  if (
    !Array.isArray(data[field]) ||
    !Number.isInteger(data.pagination?.page) ||
    !Number.isInteger(data.pagination?.totalPages)
  ) {
    throw new Error("Unexpected list response.");
  }
  return data;
};

const getMyApplication = async ({ signal } = {}) => {
  try {
    return readData(await protectedApiClient.get("/vendors/me", { signal }))
      .vendor;
  } catch (error) {
    if (
      error.response?.status === 404 &&
      error.response.data?.error?.code === "VENDOR_APPLICATION_NOT_FOUND"
    )
      return null;
    throw error;
  }
};
const applyForVendor = async ({ storeName, description }) =>
  readData(
    await protectedApiClient.post("/vendors/apply", { storeName, description }),
  ).vendor;
const listVendorApplications = async (params, { signal } = {}) =>
  readList(
    await protectedApiClient.get("/admin/vendors", { params, signal }),
    "vendors",
  );
const reviewVendorApplication = async (id, status) =>
  readData(
    await protectedApiClient.patch(`/admin/vendors/${id}/review`, { status }),
  ).vendor;
const listCatalog = async (params, { signal } = {}) =>
  readList(await apiClient.get("/products", { params, signal }), "products");
const searchCatalog = async (params, { signal } = {}) =>
  readList(await getCatalogSearch(params, { signal }), "products");
const getCatalogProduct = async (id, { signal } = {}) =>
  readData(await apiClient.get(`/products/${id}`, { signal })).product;
const listMyProducts = async (params, { signal } = {}) =>
  readList(
    await protectedApiClient.get("/vendor/products", { params, signal }),
    "products",
  );
const getMyProduct = async (id, { signal } = {}) =>
  readData(await protectedApiClient.get(`/vendor/products/${id}`, { signal }))
    .product;
const saveProduct = async (id, values) => {
  const { title, description, category, priceInPaise, stock, status } = values;
  const body = { title, description, category, priceInPaise, stock, status };
  const response = id
    ? await protectedApiClient.patch(`/vendor/products/${id}`, body)
    : await protectedApiClient.post("/vendor/products", body);
  return readData(response).product;
};
const archiveProduct = async (id) => {
  const response = await protectedApiClient.delete(`/vendor/products/${id}`);
  if (response.status !== 204) throw new Error("Unexpected archive response.");
};
const uploadProductImage = async (id, file) => {
  const body = new FormData();
  body.append("image", file);
  return readData(
    await protectedApiClient.post(`/vendor/products/${id}/image`, body, {
      timeout: 30000,
    }),
  ).product;
};

export {
  getMyApplication,
  applyForVendor,
  listVendorApplications,
  reviewVendorApplication,
  listCatalog,
  searchCatalog,
  getCatalogProduct,
  listMyProducts,
  getMyProduct,
  saveProduct,
  archiveProduct,
  uploadProductImage,
};
