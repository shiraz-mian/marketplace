import { productSearchSchema } from "../validators/productSearchValidator.js";
import { searchProducts } from "../services/productSearchService.js";
import { apiResponse } from "../utils/apiResponse.js";

const searchCatalog = async (req, res) => {
  const input = productSearchSchema.parse(req.query);
  res.set("Cache-Control", "no-store");
  return res.json(
    apiResponse(await searchProducts(input), "Search results loaded."),
  );
};

export { searchCatalog };
