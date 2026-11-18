import { Product } from "../models/productModel.js";
import { CART_PRODUCT_FIELDS } from "../config/cart.js";
import { ApiError } from "../utils/ApiError.js";
import { cartStorage } from "./cartStorage.js";
import { productImageStorage } from "./productImageStorage.js";

const toCartProduct = async (product) => {
  let imageUrl = null;
  if (product.image?.key) {
    try {
      imageUrl = await productImageStorage.sign(product.image.key);
    } catch (error) {
      console.error("Cart image unavailable:", error.name);
    }
  }
  return {
    id: product._id.toString(),
    vendorId: product.vendorId.toString(),
    title: product.title,
    storeName: product.storeName,
    priceInPaise: product.priceInPaise,
    currency: product.currency,
    stock: product.stock,
    imageUrl,
  };
};

const presentCart = async (stored) => {
  const products = stored.items.length
    ? await Product.find({
        _id: { $in: stored.items.map((item) => item.productId) },
        status: "active",
      }).select(CART_PRODUCT_FIELDS)
    : [];
  const byId = new Map(
    products.map((product) => [product._id.toString(), product]),
  );
  const items = await Promise.all(
    stored.items.map(async (item) => {
      const product = byId.get(item.productId);
      const issue = !product
        ? "PRODUCT_UNAVAILABLE"
        : product.stock < item.quantity
          ? "INSUFFICIENT_STOCK"
          : null;
      return {
        ...item,
        product: product ? await toCartProduct(product) : null,
        issue,
        lineTotalInPaise: product ? product.priceInPaise * item.quantity : null,
      };
    }),
  );
  return {
    version: stored.version,
    currency: "INR",
    items,
    summary: {
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotalInPaise: items.reduce(
        (sum, item) => sum + (item.issue ? 0 : item.lineTotalInPaise),
        0,
      ),
      hasIssues: items.some((item) => item.issue !== null),
    },
  };
};

const getCart = async (userId) => presentCart(await cartStorage.read(userId));

const requireCartProduct = async (productId) => {
  const product = await Product.findOne({
    _id: productId,
    status: "active",
  }).select("stock");
  if (!product)
    throw new ApiError(
      404,
      "PRODUCT_NOT_FOUND",
      "This product is unavailable.",
    );
  return product;
};

const addCartItem = async (userId, { productId, quantity }, operationId) => {
  const product = await requireCartProduct(productId);
  return presentCart(
    await cartStorage.mutate(userId, {
      action: "add",
      productId,
      quantity,
      stock: product.stock,
      operationId,
    }),
  );
};

const updateCartItem = async (userId, productId, quantity, version) => {
  const product = await requireCartProduct(productId);
  return presentCart(
    await cartStorage.mutate(userId, {
      action: "set",
      productId,
      quantity,
      stock: product.stock,
      version,
    }),
  );
};

const removeCartItem = async (userId, productId, version) =>
  presentCart(
    await cartStorage.mutate(userId, { action: "remove", productId, version }),
  );
const clearCart = async (userId, version) =>
  presentCart(await cartStorage.mutate(userId, { action: "clear", version }));

export { getCart, addCartItem, updateCartItem, removeCartItem, clearCart };
