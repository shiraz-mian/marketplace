import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { Product } from "../src/models/productModel.js";

try {
  await connectDB();
  const collection = Product.collection;
  const indexes = await collection.listSearchIndexes().toArray();
  const suggestionsIndex = indexes.find(
    (index) => index.name === "marketplace_suggestions",
  );
  const autocomplete = {
    type: "autocomplete",
    tokenization: "edgeGram",
    minGrams: 2,
    maxGrams: 15,
  };
  if (!suggestionsIndex) {
    await collection.createSearchIndex({
      name: "marketplace_suggestions",
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            title: autocomplete,
            storeName: autocomplete,
          },
        },
      },
    });
    console.log(
      "Suggestion index creation requested. Wait until Atlas reports it is ready.",
    );
  } else if (!suggestionsIndex.latestDefinition?.mappings?.fields?.storeName) {
    if (!suggestionsIndex.latestDefinition?.mappings?.fields)
      throw new Error(
        "Cannot inspect the existing suggestion index definition.",
      );
    const definition = suggestionsIndex.latestDefinition;
    definition.mappings.fields.storeName = autocomplete;
    await collection.updateSearchIndex("marketplace_suggestions", definition);
    console.log(
      "Suggestion index update requested. Wait until Atlas reports it is ready.",
    );
  } else {
    console.log("The marketplace_suggestions search index already exists.");
  }
  if (indexes.some((index) => index.name === "marketplace_products")) {
    console.log("The marketplace_products search index already exists.");
  } else {
    await collection.createSearchIndex({
      name: "marketplace_products",
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            title: { type: "string" },
            description: { type: "string" },
            storeName: { type: "string" },
          },
        },
      },
    });
    console.log(
      "Search index creation requested. Wait until Atlas reports it is ready.",
    );
  }
} catch (error) {
  console.error("Could not create the search index:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
