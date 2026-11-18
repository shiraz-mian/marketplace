import {
  createProductSchema,
  updateProductSchema,
  productListSchema,
  productParamsSchema,
} from "../validators/productValidator.js";
import {
  createProduct,
  updateProduct,
  archiveProduct,
  listProducts,
  toProductResponse,
  getPublicProduct,
  replaceProductImage,
} from "../services/productService.js";
import { apiResponse } from "../utils/apiResponse.js";

const listCatalog = async (req, res) =>
  res.json(
    apiResponse(
      await listProducts(productListSchema.parse(req.query)),
      "Products loaded.",
    ),
  );
const getCatalogProduct = async (req, res) => {
  const { productId } = productParamsSchema.parse(req.params);
  return res.json(
    apiResponse(
      { product: await getPublicProduct(productId) },
      "Product loaded.",
    ),
  );
};
const listMyProducts = async (req, res) =>
  res.json(
    apiResponse(
      await listProducts(productListSchema.parse(req.query), req.vendor._id),
      "Products loaded.",
    ),
  );
const getMyProduct = async (req, res) =>
  res.json(
    apiResponse(
      { product: await toProductResponse(req.product) },
      "Product loaded.",
    ),
  );
const addProduct = async (req, res) => {
  const input = createProductSchema.parse(req.body);
  return res
    .status(201)
    .json(
      apiResponse(
        { product: await createProduct(req.vendor, input) },
        "Product created.",
      ),
    );
};
const editProduct = async (req, res) => {
  const input = updateProductSchema.parse(req.body);
  return res.json(
    apiResponse(
      { product: await updateProduct(req.product._id, req.vendor._id, input) },
      "Product updated.",
    ),
  );
};
const deleteProduct = async (req, res) => {
  await archiveProduct(req.product._id, req.vendor._id);
  return res.status(204).end();
};
const uploadProductImage = async (req, res) =>
  res.json(
    apiResponse(
      {
        product: await replaceProductImage(
          req.product,
          req.vendor._id,
          req.file,
        ),
      },
      "Product image uploaded.",
    ),
  );

export {
  listCatalog,
  getCatalogProduct,
  listMyProducts,
  getMyProduct,
  addProduct,
  editProduct,
  deleteProduct,
  uploadProductImage,
};
