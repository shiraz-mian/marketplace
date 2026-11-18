import { Order } from "../models/orderModel.js";
import { User } from "../models/userModel.js";
import { Product } from "../models/productModel.js";
import { Vendor } from "../models/vendorModel.js";
const analyticsService = {
  overview: async () => {
    const since = new Date(Date.now() - 30 * 86400000);
    const [
      users,
      vendors,
      products,
      pendingApplications,
      totals,
      dailySales,
      topStores,
      refundPending,
      pendingPayments,
    ] = await Promise.all([
      User.countDocuments({ status: "active" }),
      Vendor.countDocuments({ status: "approved" }),
      Product.countDocuments({ status: "active" }),
      Vendor.countDocuments({ status: "pending" }),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenueInPaise: { $sum: "$totalInPaise" },
            commissionInPaise: { $sum: "$commissionInPaise" },
            discountInPaise: { $sum: "$discountInPaise" },
          },
        },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: "paid", paidAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$paidAt",
                timezone: "Asia/Kolkata",
              },
            },
            orders: { $sum: 1 },
            revenueInPaise: { $sum: "$totalInPaise" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $unwind: "$shipments" },
        {
          $group: {
            _id: "$shipments.vendorId",
            storeName: { $first: "$shipments.storeName" },
            revenueInPaise: { $sum: "$shipments.totalInPaise" },
            vendorAmountInPaise: { $sum: "$shipments.vendorAmountInPaise" },
          },
        },
        { $sort: { revenueInPaise: -1, _id: 1 } },
        { $limit: 10 },
      ]),
      Order.countDocuments({ paymentStatus: "refund_pending" }),
      Order.countDocuments({ paymentStatus: "pending" }),
    ]);
    return {
      users,
      vendors,
      products,
      pendingApplications,
      refundPending,
      pendingPayments,
      totals: totals[0]
        ? {
            orders: totals[0].orders,
            revenueInPaise: totals[0].revenueInPaise,
            commissionInPaise: totals[0].commissionInPaise,
            discountInPaise: totals[0].discountInPaise,
          }
        : {
            orders: 0,
            revenueInPaise: 0,
            commissionInPaise: 0,
            discountInPaise: 0,
          },
      dailySales: dailySales.map((d) => ({
        date: d._id,
        orders: d.orders,
        revenueInPaise: d.revenueInPaise,
      })),
      topStores: topStores.map((v) => ({
        vendorId: String(v._id),
        storeName: v.storeName,
        revenueInPaise: v.revenueInPaise,
        vendorAmountInPaise: v.vendorAmountInPaise,
      })),
    };
  },
};
export { analyticsService };
